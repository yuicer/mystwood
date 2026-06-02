"use strict";

const api = require("../../utils/api.js");
const config = require("../../config.js");
const sync = require("../../utils/sync.js");

const SPACE_STATUS = {
  PENDING: "pending",
  ACTIVE: "active"
};

Page({
  data: {
    space: null,
    invite: null,
    inviteToken: "",
    inviteState: null
  },

  syncClient: null,
  syncErrorShown: false,

  onLoad(options) {
    const rawInviteToken = options && (options.inviteToken || options.token || options.scene);
    const inviteToken = rawInviteToken ? decodeURIComponent(rawInviteToken) : "";
    this.setData({ inviteToken });

    if (wx.showShareMenu) {
      wx.showShareMenu({
        withShareTicket: true,
        menus: ["shareAppMessage"]
      });
    }
  },

  async onShow() {
    try {
      if (this.data.inviteToken) {
        await this.loadInviteTokenEntry();
        return;
      }

      const state = await api.getState();
      if (state.space) {
        this.setData({ space: state.space, invite: null });
        this.startInviteClient(state.syncCursor);
        return;
      }

      this.stopInviteClient();
      this.setData({ space: null, invite: null, inviteState: null });
    } catch (error) {
      wx.showToast({ title: error.message || "加载失败", icon: "none" });
    }
  },

  async loadInviteTokenEntry() {
    const state = await api.getState();
    const space = state.space;
    const isCurrentSpaceInvite = space && space.inviteToken === this.data.inviteToken;

    if (isCurrentSpaceInvite) {
      this.setData({
        space,
        invite: null,
        inviteState: {
          spaceId: space._id,
          name: space.name,
          inviteToken: space.inviteToken,
          status: space.status
        }
      });

      if (space.status === SPACE_STATUS.ACTIVE) {
        this.stopInviteClient();
        wx.showToast({ title: "对方已确认加入", icon: "success" });
        setTimeout(() => wx.redirectTo({ url: "/pages/index/index" }), 400);
        return;
      }

      this.startInviteClient(state.syncCursor);
      return;
    }

    const invite = await api.getInvite(this.data.inviteToken);
    this.setData({ space: null, invite, inviteState: null });
    this.stopInviteClient();
  },

  onHide() {
    this.stopInviteClient();
  },

  onUnload() {
    this.stopInviteClient();
  },

  startInviteClient(cursor) {
    this.stopInviteClient();
    if (!this.data.space || !this.data.space.inviteToken || this.data.space.status !== SPACE_STATUS.PENDING) return;

    const longPoll = config.syncLongPoll || {};
    this.syncErrorShown = false;
    this.syncClient = sync.createSimulatedSocketClient({
      cursor,
      timeoutMs: longPoll.timeoutMs,
      intervalMs: longPoll.intervalMs,
      emptyReconnectMinMs: longPoll.emptyReconnectMinMs,
      emptyReconnectMaxMs: longPoll.emptyReconnectMaxMs,
      onEvents: (events) => {
        this.handleSyncEvents(events);
      },
      onError: (error) => {
        if (this.syncErrorShown) return;
        this.syncErrorShown = true;
        wx.showToast({ title: error.message || "同步连接失败", icon: "none" });
      }
    });
    this.syncClient.start();
  },

  stopInviteClient() {
    if (this.syncClient) {
      this.syncClient.close();
      this.syncClient = null;
    }
  },

  handleSyncEvents(events) {
    const hasInviteConfirmed = (events || []).some(event => event && event.type === sync.EVENT_TYPES.INVITE_CONFIRMED);
    if (!hasInviteConfirmed) return;

    this.stopInviteClient();
    wx.showToast({ title: "对方已确认加入", icon: "success" });
    setTimeout(() => wx.redirectTo({ url: "/pages/index/index" }), 400);
  },

  copy() {
    if (!this.data.space || !this.data.space.inviteToken) {
      wx.showToast({ title: "暂无邀请码", icon: "none" });
      return;
    }
    wx.setClipboardData({ data: this.data.space.inviteToken });
  },

  async acceptInvite() {
    try {
      await api.acceptInvite(this.data.inviteToken);
      wx.showToast({ title: "已加入", icon: "success" });
      setTimeout(() => wx.redirectTo({ url: "/pages/index/index" }), 400);
    } catch (error) {
      wx.showToast({ title: error.message || "操作失败", icon: "none" });
    }
  },

  onShareAppMessage() {
    const space = this.data.space || {};
    const inviteToken = space.inviteToken || this.data.inviteToken;
    return {
      title: `${space.name || "亲密空间"} 邀请你加入`,
      path: `/pages/space/invite?inviteToken=${encodeURIComponent(inviteToken)}`
    };
  },

  goCreate() {
    wx.redirectTo({ url: "/pages/space/create" });
  }
});
