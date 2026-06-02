"use strict";

const api = require("../../utils/api.js");
const config = require("../../config.js");
const sync = require("../../utils/sync.js");

Page({
  data: {
    state: {
      space: null,
      tasks: []
    },
    todoTasks: []
  },

  syncClient: null,
  handledSyncVersions: null,
  syncErrorShown: false,

  async onShow() {
    const state = await this.loadState();
    this.startSyncClient(state && state.syncCursor);
  },

  onHide() {
    this.stopSyncClient();
  },

  onUnload() {
    this.stopSyncClient();
  },

  async onPullDownRefresh() {
    try {
      await this.loadState();
    } finally {
      if (wx.stopPullDownRefresh) wx.stopPullDownRefresh();
    }
  },

  async loadState(options) {
    const quiet = options && options.quiet;

    try {
      const state = await api.getState();
      const todoTasks = (state.tasks || [])
        .filter((task) => task.status === "todo")
        .slice(0, 5)
        .map((task) => ({
          ...task,
          deadlineText: task.deadline ? new Date(task.deadline).toLocaleString() : "未设置"
        }));

      this.setData({
        state,
        todoTasks
      });
      return state;
    } catch (error) {
      if (!quiet) wx.showToast({ title: error.message || "加载失败", icon: "none" });
      return null;
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
        if (this.syncErrorShown) return;
        this.syncErrorShown = true;
        wx.showToast({ title: error.message || "同步连接失败", icon: "none" });
      }
    });
    this.syncClient.start();
  },

  async handleSyncEvents(events) {
    const validEvents = (events || []).filter(event => event && typeof event.v === "number");
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
    if (message) wx.showToast({ title: message, icon: "none" });
  },

  go(event) {
    wx.navigateTo({ url: event.currentTarget.dataset.url });
  },

  async finish(event) {
    try {
      await api.completeTask(event.currentTarget.dataset.id);
      await this.loadState();
      wx.showToast({ title: "已完成", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message || "操作失败", icon: "none" });
    }
  }
});
