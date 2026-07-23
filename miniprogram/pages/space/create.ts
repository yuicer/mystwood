"use strict";

const api = require("../../utils/api.js");

Page({
  data: {
    name: "",
    isSubmitting: false
  },

  onNameInput(event: WxEvent<TextInputDetail>) {
    this.setData({ name: event.detail.value });
  },

  async submit() {
    if (this.data.isSubmitting) return;

    const name = this.data.name.trim();
    if (!name) {
      wx.showToast({ title: "请填写空间名称", icon: "none" });
      return;
    }

    try {
      this.setData({ isSubmitting: true });
      await api.createSpace(name);
      wx.redirectTo({ url: "/pages/space/invite" });
    } catch (error) {
      wx.showToast({ title: error.message || "创建失败", icon: "none" });
    } finally {
      this.setData({ isSubmitting: false });
    }
  }
});
