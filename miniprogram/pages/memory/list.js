"use strict";

const api = require("../../utils/api.js");
const lbs = require("../../utils/lbs.js");
const time = require("../../utils/time.js");

Page({
  data: {
    memories: []
  },

  async onShow() {
    try {
      const state = await api.getState();
      this.setData({
        memories: (state.memories || []).map((item) => ({
          ...item,
          locationTitle: lbs.getLocationName(item.location),
          statusText: item.status === "completed" ? "已完成" : "逾期扣分",
          timeText: time.formatAppointmentTime(item.completedAt || item.appointmentAt || item.deadline || item.createdAt, { emptyText: "" })
        }))
      });
    } catch (error) {
      wx.showToast({ title: error.message || "加载失败", icon: "none" });
    }
  },

  openMemoryLocation(event) {
    const index = Number(event.currentTarget.dataset.index);
    const memory = this.data.memories[index];
    if (!memory || !memory.location) return;
    lbs.openLocation(memory.location);
  }
});
