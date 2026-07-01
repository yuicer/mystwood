"use strict";

const api = require("../../utils/api.js");

Page({
  data: {
    spaceName: "",
    originalSpaceName: "",
    savingName: false
  },

  async onShow() {
    try {
      const state = await api.getState();
      const spaceName = state && state.space && state.space.name ? state.space.name : "";
      this.setData({
        spaceName,
        originalSpaceName: spaceName
      });
    } catch (error) {
      wx.showToast({ title: error.message || "加载失败", icon: "none" });
    }
  },

  onSpaceNameInput(event: WxEvent<TextInputDetail>) {
    this.setData({ spaceName: event.detail.value });
  },

  async saveSpaceName() {
    const name = this.data.spaceName.trim();
    if (!name) {
      wx.showToast({ title: "请填写空间名称", icon: "none" });
      return;
    }

    if (name === this.data.originalSpaceName) {
      wx.showToast({ title: "空间名称未变化", icon: "none" });
      return;
    }

    this.setData({ savingName: true });
    try {
      await api.renameSpace(name);
      const state = await api.getState();
      const app = typeof getApp === "function" ? getApp() : null;
      if (app && app.setStateCache) app.setStateCache(state);
      this.setData({
        originalSpaceName: name,
        spaceName: name
      });
      wx.showToast({ title: "已保存", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    } finally {
      this.setData({ savingName: false });
    }
  },

  dissolve() {
    wx.showModal({
      title: "确认解绑",
      content: "解绑后将清空空间历史，是否继续？",
      success: async ({ confirm }: { confirm: boolean }) => {
        if (!confirm) return;

        try {
          await api.dissolveSpace();
          const app = typeof getApp === "function" ? getApp() : null;
          if (app && app.clearStateCache) app.clearStateCache();
          wx.showToast({ title: "已解绑", icon: "success" });
          setTimeout(() => {
            wx.reLaunch({ url: "/pages/index/index" });
          }, 500);
        } catch (error) {
          wx.showToast({ title: error.message || "解绑失败", icon: "none" });
        }
      }
    });
  }
});
