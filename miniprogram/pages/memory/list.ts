"use strict";

const api = require("../../utils/api.js");
const lbs = require("../../utils/lbs.js");
const time = require("../../utils/time.js");

function getErrorMessage(error: Error | AnyRecord | null | undefined) {
  return (error && (error.message || error.errMsg)) || "加载失败";
}

function createMemoryCards(memories: AnyRecord[] | null | undefined) {
  return (memories || []).map((item: AnyRecord) => ({
    _id: item._id,
    title: item.title || "",
    desc: item.desc || "",
    location: item.location || null,
    locationTitle: lbs.getLocationName(item.location),
    statusText: item.status === "completed" ? "已完成" : "已婉拒",
    timeText: time.formatAppointmentTime(item.completedAt || item.responseAt || item.createdAt, { emptyText: "" })
  }));
}

Page({
  data: {
    memories: [],
    isLoadingMemories: true,
    loadError: ""
  },

  async onShow() {
    await this.loadMemories();
  },

  async loadMemories() {
    this.setData({
      isLoadingMemories: true,
      loadError: ""
    });

    try {
      const state = await api.getState();
      this.setData({
        memories: createMemoryCards(state && state.memories),
        isLoadingMemories: false,
        loadError: ""
      });
    } catch (error) {
      this.setData({
        isLoadingMemories: false,
        loadError: getErrorMessage(error)
      });
    }
  },

  retryLoadMemories() {
    this.loadMemories();
  },

  openMemoryLocation(event: WxEvent<AnyRecord, { index?: number | string }>) {
    const index = Number(event.currentTarget.dataset.index);
    const memory = this.data.memories[index];
    if (!memory || !memory.location) return;
    lbs.openLocation(memory.location);
  },

  openMemoryDetail(event: WxEvent<AnyRecord, { id?: string }>) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/task/detail?id=${id}` });
  }
});
