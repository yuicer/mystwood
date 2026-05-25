"use strict";

const api = require("../../utils/api.js");

const SPACE_STATUS = {
  PENDING: "pending",
  ACTIVE: "active"
};

Page({
  data: {
    space: null,
    invite: null,
    inviteToken: "",
    inviteState: null,
    isPolling: false
  },

  pollTimer: null,
  pollCount: 0,

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
        const invite = await api.getInvite(this.data.inviteToken);
        this.setData({ space: null, invite, inviteState: null });
        this.stopInvitePolling();
        return;
      }

      const state = await api.getState();
      if (state.space) {
        this.setData({ space: state.space, invite: null });
        if (state.space.status === SPACE_STATUS.PENDING && state.space.inviteToken) {
          this.startInvitePolling();
        } else {
          this.stopInvitePolling();
        }
        return;
      }

      this.stopInvitePolling();
      this.setData({ space: null, invite: null, inviteState: null });
    } catch (error) {
      wx.showToast({ title: error.message || "加载失败", icon: "none" });
    }
  },

  onHide() {
    this.stopInvitePolling();
  },

  onUnload() {
    this.stopInvitePolling();
  },

  startInvitePolling() {
    this.stopInvitePolling();
    this.pollCount = 0;
    this.setData({ isPolling: true });
    this.pollInviteState();
  },

  stopInvitePolling() {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.data.isPolling) {
      this.setData({ isPolling: false });
    }
  },

  getNextPollDelay() {
    const delays = [2000, 3000, 5000, 8000];
    return delays[Math.min(this.pollCount, delays.length - 1)];
  },

  async pollInviteState() {
    if (!this.data.space || !this.data.space.inviteToken) return;
    try {
      const inviteState = await api.getInviteState(this.data.space.inviteToken);
      this.setData({ inviteState });
      if (inviteState && inviteState.status === SPACE_STATUS.ACTIVE) {
        this.stopInvitePolling();
        wx.showToast({ title: "对方已确认加入", icon: "success" });
        setTimeout(() => wx.redirectTo({ url: "/pages/index/index" }), 400);
        return;
      }
    } catch (error) {
      // 轮询阶段静默失败，交由下一轮重试
    }

    this.pollCount += 1;
    const delay = this.getNextPollDelay();
    this.pollTimer = setTimeout(() => this.pollInviteState(), delay);
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
