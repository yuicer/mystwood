'use strict';

const api = require('../../utils/api.js');
const config = require('../../config.js');
const sync = require('../../utils/sync.js');

const HAPPY_LINES = [
  '小东西，真可爱，谁研究的呢',
  '风很轻，云很淡，你很好',
  '想见你，只想见你',
  '想起你的时候总是会开心起来',
  '不希望你有一点点的难过',
  '都是轻松，明亮的！',
];

function createEmptyState() {
  return {
    space: null,
    tasks: [],
    memories: [],
    syncCursor: 0,
  };
}

function normalizeState(state) {
  const source = state && typeof state === 'object' ? state : {};
  const syncCursor = Number(source.syncCursor || 0);

  return {
    space: source.space || null,
    tasks: Array.isArray(source.tasks) ? source.tasks : [],
    memories: Array.isArray(source.memories) ? source.memories : [],
    syncCursor: Number.isFinite(syncCursor) ? syncCursor : 0,
  };
}

function getAppInstance() {
  return typeof getApp === 'function' ? getApp() : null;
}

function getErrorMessage(error) {
  return (error && (error.message || error.errMsg)) || '加载失败';
}

function pickHappyLine() {
  return HAPPY_LINES[Math.floor(Math.random() * HAPPY_LINES.length)];
}

Page({
  data: {
    state: createEmptyState(),
    todoTasks: [],
    happyLine: pickHappyLine(),
    isLoadingState: true,
    stateReady: false,
    loadError: '',
  },

  syncClient: null,
  handledSyncVersions: null,
  syncErrorShown: false,
  serverStateLoaded: false,

  onLoad() {
    this.setData({ happyLine: pickHappyLine() });
    this.applyCachedState();
  },

  async onShow() {
    const state = await this.loadState({ usePreload: true });
    if (state && state.space) {
      this.startSyncClient(state.syncCursor);
    } else {
      this.stopSyncClient();
    }
  },

  onHide() {
    this.stopSyncClient();
  },

  onUnload() {
    this.stopSyncClient();
  },

  async onPullDownRefresh() {
    try {
      const state = await this.loadState({ usePreload: false });
      if (state && state.space) {
        this.startSyncClient(state.syncCursor);
      } else {
        this.stopSyncClient();
      }
    } finally {
      if (wx.stopPullDownRefresh) wx.stopPullDownRefresh();
    }
  },

  async applyCachedState() {
    try {
      const app = getAppInstance();
      const cachedState =
        app && app.getStateCache ? await app.getStateCache() : null;
      if (this.serverStateLoaded) return;
      if (!cachedState || !cachedState.space) return;

      this.applyState(cachedState, { fromCache: true });
    } catch (error) {
      console.warn('[index] read cached state failed', error);
    }
  },

  getStateRequest(options) {
    const app = getAppInstance();
    const preloadPromise =
      app && app.globalData && app.globalData.statePreloadPromise;
    if (!options || options.usePreload !== false) {
      if (preloadPromise) return preloadPromise;
    }
    return api.getState();
  },

  applyState(nextState, options) {
    const state = normalizeState(nextState);
    const todoTasks = (state.tasks || [])
      .filter((task) => task.status === 'todo')
      .slice(0, 5)
      .map((task) => ({
        ...task,
        deadlineText: task.deadline
          ? new Date(task.deadline).toLocaleString()
          : '未设置',
      }));

    this.setData({
      state,
      todoTasks,
      stateReady: true,
      isLoadingState: !!(options && options.fromCache),
      loadError: '',
    });
  },

  async loadState(options) {
    const quiet = options && options.quiet;

    if (!quiet) {
      this.setData({
        isLoadingState: true,
        loadError: '',
      });
    }

    try {
      const state = await this.getStateRequest(options);
      this.serverStateLoaded = true;
      this.applyState(state);

      const app = getAppInstance();
      if (app && app.setStateCache) app.setStateCache(state);

      return state;
    } catch (error) {
      const message = getErrorMessage(error);
      this.setData({
        isLoadingState: false,
        loadError: this.data.stateReady ? '' : message,
      });

      if (!quiet && this.data.stateReady) {
        wx.showToast({ title: message, icon: 'none' });
      }
      return null;
    }
  },

  async retryLoadState() {
    const state = await this.loadState({ usePreload: false });
    if (state && state.space) {
      this.startSyncClient(state.syncCursor);
    } else {
      this.stopSyncClient();
    }
  },

  stopSyncClient() {
    if (this.syncClient) {
      this.syncClient.close();
      this.syncClient = null;
    }
  },

  startSyncClient(cursor) {
    this.stopSyncClient();
    if (!this.data.state.space) return;

    const longPoll = config.syncLongPoll || {};
    this.syncErrorShown = false;
    this.syncClient = sync.createSimulatedSocketClient({
      cursor,
      timeoutMs: longPoll.timeoutMs,
      intervalMs: longPoll.intervalMs,
      emptyReconnectMinMs: longPoll.emptyReconnectMinMs,
      emptyReconnectMaxMs: longPoll.emptyReconnectMaxMs,
      onEvents: (events) => {
        this.handleSyncEvents(events).catch(() => {});
      },
      onError: (error) => {
        if (sync.isRetryableSyncError(error)) return;
        if (sync.isTerminalSyncError(error)) {
          this.loadState({ quiet: true, usePreload: false }).then((state) => {
            if (!state || !state.space) this.stopSyncClient();
          });
          return;
        }
        if (this.syncErrorShown) return;
        this.syncErrorShown = true;
        wx.showToast({ title: error.message || '同步连接失败', icon: 'none' });
      },
    });
    this.syncClient.start();
  },

  async handleSyncEvents(events) {
    const validEvents = (events || []).filter(
      (event) => event && typeof event.v === 'number',
    );
    if (validEvents.length === 0) return;

    if (!this.handledSyncVersions) this.handledSyncVersions = {};
    const freshEvents = validEvents.filter((event) => {
      if (this.handledSyncVersions[event.v]) return false;
      this.handledSyncVersions[event.v] = true;
      return true;
    });
    if (freshEvents.length === 0) return;

    if (sync.shouldRefreshForEvents(freshEvents)) {
      const state = await this.loadState({ quiet: true });
      if (!state || !state.space) this.stopSyncClient();
    }

    const message = sync.getEventMessage(freshEvents[freshEvents.length - 1]);
    if (message) wx.showToast({ title: message, icon: 'none' });
  },

  go(event) {
    const url = event.currentTarget.dataset.url;
    if (url) wx.navigateTo({ url });
  },

  async finish(event) {
    try {
      await api.completeTask(event.currentTarget.dataset.id);
      await this.loadState({ usePreload: false });
      wx.showToast({ title: '已完成', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '操作失败', icon: 'none' });
    }
  },
});
