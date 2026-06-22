"use strict";

const api = require("../../utils/api.js");

Page({
  data: {
    isLoading: true
  },

  onLoad(options) {
    this.taskId = options && options.id ? decodeURIComponent(options.id) : "";
    this.shareToken = options && options.shareToken ? decodeURIComponent(options.shareToken) : "";
  },

  onShow() {
    if (this.hasResolved) return;
    this.hasResolved = true;
    this.resolveShare();
  },

  async resolveShare() {
    try {
      const result = await api.resolveTaskShare(this.taskId, this.shareToken);
      if (!result || !result.id) throw new Error("这是私密约定");
      wx.redirectTo({ url: `/pages/task/detail?id=${result.id}` });
    } catch (error) {
      wx.reLaunch({ url: "/pages/index/index?privateTaskShare=1" });
    }
  }
});
