'use strict';

const config = require('./config.js');
const api = require('./utils/api.js');

const STATE_CACHE_KEY = 'mystwood.state.v1';
const STATE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeState(state: AnyRecord | null | undefined): CloudState {
  const source: AnyRecord = state && typeof state === 'object' ? state : {};
  const syncCursor = Number(source.syncCursor || 0);

  return {
    space: source.space || null,
    tasks: Array.isArray(source.tasks) ? source.tasks : [],
    memories: Array.isArray(source.memories) ? source.memories : [],
    syncCursor: Number.isFinite(syncCursor) ? syncCursor : 0
  };
}

function hasCachedSpace(state: CloudState | null | undefined) {
  return !!(state && state.space);
}

function readCachedState(): Promise<CloudState | null> {
  if (typeof wx === 'undefined' || !wx.getStorage) return Promise.resolve(null);

  return new Promise((resolve) => {
    wx.getStorage({
      key: STATE_CACHE_KEY,
      success(res: AnyRecord) {
        const cached = res && res.data;
        if (!cached || !cached.state || !cached.cachedAt) {
          resolve(null);
          return;
        }

        if (Date.now() - Number(cached.cachedAt) > STATE_CACHE_MAX_AGE_MS) {
          resolve(null);
          return;
        }

        const state = normalizeState(cached.state);
        resolve(hasCachedSpace(state) ? state : null);
      },
      fail() {
        resolve(null);
      }
    });
  });
}

function writeCachedState(state: CloudState) {
  if (typeof wx === 'undefined' || !wx.setStorage) return;

  wx.setStorage({
    key: STATE_CACHE_KEY,
    data: {
      state,
      cachedAt: Date.now()
    }
  });
}

function clearCachedState() {
  if (typeof wx === 'undefined' || !wx.removeStorage) return;
  wx.removeStorage({ key: STATE_CACHE_KEY });
}

App({
  globalData: {
    statePreloadPromise: null
  },

  onLaunch() {
    if (!wx.cloud) {
      console.warn('[runtime] wx.cloud is unavailable in current environment');
      return;
    }

    const cloudInitOptions = {
      traceUser: true,
      env: config.cloudEnvId,
    };

    wx.cloud.init(cloudInitOptions);
    this.preloadState();

    console.log('海边沙滩启动');
  },

  preloadState() {
    if (!wx.cloud) return null;

    const clearPreloadPromise = () => {
      if (this.globalData.statePreloadPromise === promise) {
        this.globalData.statePreloadPromise = null;
      }
    };
    const promise = api.getState().then((state: AnyRecord) => {
      this.setStateCache(state);
      return state;
    });

    promise
      .then(clearPreloadPromise)
      .catch((error: Error) => {
        console.warn('[runtime] preload state failed', error);
        clearPreloadPromise();
      });

    this.globalData.statePreloadPromise = promise;
    return promise;
  },

  getStateCache() {
    return readCachedState();
  },

  setStateCache(state: AnyRecord) {
    const normalizedState = normalizeState(state);
    if (!hasCachedSpace(normalizedState)) {
      this.clearStateCache();
      return;
    }

    writeCachedState(normalizedState);
  },

  clearStateCache() {
    clearCachedState();
  }
});
