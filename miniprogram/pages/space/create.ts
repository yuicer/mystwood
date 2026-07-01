"use strict";

const api = require("../../utils/api.js");

Page({
  data: {
    name: ""
  },

  onNameInput(event: WxEvent<TextInputDetail>) {
    this.setData({ name: event.detail.value });
  },

  async submit() {
    const name = this.data.name.trim();
    if (!name) {
      wx.showToast({ title: "请填写空间名称", icon: "none" });
      return;
    }

    try {
      await api.createSpace(name);
      wx.redirectTo({ url: "/pages/space/invite" });
    } catch (error) {
      wx.showToast({ title: error.message || "创建失败", icon: "none" });
    }
  }
});
