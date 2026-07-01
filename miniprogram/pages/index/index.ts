'use strict';

const api = require('../../utils/api.js');
const config = require('../../config.js');
const lbs = require('../../utils/lbs.js');
const sync = require('../../utils/sync.js');
const taskImages = require('../../utils/task-images.js');
const time = require('../../utils/time.js');

const HAPPY_LINES = [
  '小东西，真可爱，谁研究的呢',
  '风很轻，云很淡，你很好',
  '想见你，只想见你',
  '想起你的时候总是会开心起来',
  '不希望你有一点点的难过',
  '都是轻松，明亮的！',
];

const DEFAULT_PAGE_BACKGROUND = 'linear-gradient(135deg,#f7f6f3,#eadfc9,#d8e3dc)';

function createEmptyState(): CloudState {
  return {
    space: null,
    tasks: [],
    memories: [],
    syncCursor: 0,
  };
}

function normalizeState(state: AnyRecord | null | undefined): CloudState {
  const source: AnyRecord = state && typeof state === 'object' ? state : {};
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

function getErrorMessage(error: Error | AnyRecord | null | undefined) {
  return (error && (error.message || error.errMsg)) || '加载失败';
}

function pickHappyLine() {
  return HAPPY_LINES[Math.floor(Math.random() * HAPPY_LINES.length)];
}

function getTaskStatusText(task: AnyRecord) {
  const permissions = task.permissions || {};
  const completion = task.completion || {};

  if (task.status === 'pending') return permissions.canAccept ? '等待你同意' : '等待 TA 同意';
  if (task.kind === 'self') return permissions.isCreator ? '正在进行' : 'TA 的自愿约定';
  if (task.kind === 'together') {
    if (completion.isMineCompleted) return '我已完成，等 TA';
    if (completion.isPartnerCompleted) return 'TA 已完成，等你';
    return '一起进行中';
  }
  return permissions.isCreator ? '等待 TA 完成' : '等你完成';
}

function getTaskSortRank(task: AnyRecord) {
  if ((task.permissions || {}).canAccept) return 0;
  if (task.status === 'pending') return 1;
  return 2;
}

Page({
  data: {
    state: createEmptyState(),
    taskCards: [],
    pageBackground: DEFAULT_PAGE_BACKGROUND,
    happyLine: pickHappyLine(),
    isLoadingState: true,
    stateReady: false,
    loadError: '',
  },

  syncClient: null,
  handledSyncVersions: null,
  syncErrorShown: false,
  serverStateLoaded: false,

  onLoad(options: AnyRecord) {
    this.setData({ happyLine: pickHappyLine() });
    this.shouldShowPrivateSharePrompt = !!(options && options.privateTaskShare === '1');
    this.applyCachedState();
  },

  async onShow() {
    const state = await this.loadState({ usePreload: true });
    this.showPrivateSharePrompt(state);
    if (state && state.space) {
      this.startSyncClient(state.syncCursor);
    } else {
      this.stopSyncClient();
    }
  },

  showPrivateSharePrompt(state: CloudState | null) {
    if (!this.shouldShowPrivateSharePrompt) return;
    this.shouldShowPrivateSharePrompt = false;
    const hasSpace = !!(state && state.space);
    wx.showModal({
      title: '这是一份私密约定',
      content: '它只对约定双方开放。创建属于你们的双人空间，也开始一份新的约定吧。',
      showCancel: false,
      confirmText: hasSpace ? '回到首页' : '创建空间',
      success: () => {
        if (!hasSpace) wx.navigateTo({ url: '/pages/space/create' });
      }
    });
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

  getStateRequest(options?: { usePreload?: boolean }) {
    const app = getAppInstance();
    const preloadPromise =
      app && app.globalData && app.globalData.statePreloadPromise;
    if (!options || options.usePreload !== false) {
      if (preloadPromise) return preloadPromise;
    }
    return api.getState();
  },

  applyState(nextState: AnyRecord | null | undefined, options?: { fromCache?: boolean }) {
    const state = normalizeState(nextState);
    const taskCards = [...(state.tasks || [])]
      .sort((first: AnyRecord, second: AnyRecord) => getTaskSortRank(first) - getTaskSortRank(second))
      .slice(0, 8)
      .map((task: AnyRecord) => {
        const imageUrls = taskImages.normalizeImageUrls(task.images, task.imageUrl);
        return {
          ...task,
          imageUrls,
          coverImageUrl: imageUrls[0] || '',
          statusText: getTaskStatusText(task),
          locationTitle: lbs.getLocationName(task.location),
          appointmentText: task.appointmentAt
            ? time.formatAppointmentTime(task.appointmentAt)
            : '未约定',
        };
      });

    this.setData({
      state,
      taskCards,
      stateReady: true,
      isLoadingState: !!(options && options.fromCache),
      loadError: '',
    });
  },

  async loadState(options?: { quiet?: boolean; usePreload?: boolean }) {
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

  startSyncClient(cursor: number) {
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
      onEvents: (events: SyncEvent[]) => {
        this.handleSyncEvents(events).catch(() => {});
      },
      onError: (error: Error) => {
        if (sync.isRetryableSyncError(error)) return;
        if (sync.isTerminalSyncError(error)) {
          this.loadState({ quiet: true, usePreload: false }).then((state: CloudState | null) => {
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

  async handleSyncEvents(events: SyncEvent[]) {
    const validEvents = (events || []).filter(
      (event: SyncEvent) => event && typeof event.v === 'number',
    );
    if (validEvents.length === 0) return;

    if (!this.handledSyncVersions) this.handledSyncVersions = {};
    const freshEvents = validEvents.filter((event: SyncEvent) => {
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

  go(event: WxEvent<AnyRecord, { url?: string }>) {
    const url = event.currentTarget.dataset.url;
    if (url) wx.navigateTo({ url });
  },

  openTaskLocation(event: WxEvent<AnyRecord, { index?: number | string }>) {
    const index = Number(event.currentTarget.dataset.index);
    const task = this.data.taskCards[index];
    if (!task || !task.location) return;
    lbs.openLocation(task.location);
  },

  openTaskDetail(event: WxEvent<AnyRecord, { id?: string }>) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/task/detail?id=${id}` });
  },

  previewTaskImage(event: WxEvent<AnyRecord, { index?: number | string }>) {
    const index = Number(event.currentTarget.dataset.index);
    const task = this.data.taskCards[index];
    if (!task) return;
    taskImages.previewImages(task.imageUrls, 0);
  },

});
