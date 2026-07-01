"use strict";

const api = require("../../utils/api.js");
const lbs = require("../../utils/lbs.js");
const taskImages = require("../../utils/task-images.js");
const time = require("../../utils/time.js");

function goBackHome() {
  wx.navigateBack({
    fail() {
      wx.redirectTo({ url: "/pages/index/index" });
    }
  });
}

function getStatusText(task) {
  const permissions = task.permissions || {};
  const completion = task.completion || {};

  if (task.status === "completed") return "已完成";
  if (task.status === "declined") return "已婉拒";
  if (task.status === "pending") {
    return permissions.canAccept ? "等待你的同意" : "等待 TA 同意";
  }
  if (task.kind === "self") {
    return permissions.isCreator ? "正在进行" : "TA 的自愿约定";
  }
  if (task.kind === "together") {
    if (completion.isMineCompleted) return "我已完成，等待 TA";
    if (completion.isPartnerCompleted) return "TA 已完成，等你完成";
    return "一起进行中";
  }
  return permissions.isCreator ? "等待 TA 完成" : "等你完成";
}

function getCompleteActionText(task) {
  if (task.kind === "together") return "我已完成";
  return "我完成了";
}

function formatReplyTime(value) {
  return time.formatAppointmentTime(value, { emptyText: "" });
}

Page({
  data: {
    id: "",
    task: null,
    locationTitle: "",
    appointmentText: "",
    createdText: "",
    completedText: "",
    statusText: "",
    completionText: "",
    completeActionText: "我完成了",
    responseText: "",
    taskImages: [],
    taskImageUrls: [],
    replies: [],
    replyText: "",
    replyImageItems: [],
    replyImageUrls: [],
    isUploadingReplyImage: false,
    isSubmittingReply: false,
    isCompleting: false,
    maxReplyImageCount: taskImages.MAX_TASK_IMAGE_COUNT,
    isResponding: false,
    responseDecision: "",
    responseNote: "",
    isSubmittingResponse: false,
    isLoading: true
  },

  onLoad(options) {
    this.setData({ id: options && options.id ? options.id : "" });
    if (wx.showShareMenu) {
      wx.showShareMenu({ withShareTicket: true, menus: ["shareAppMessage"] });
    }
  },

  async onShow() {
    if (this.skipNextShowRefresh) {
      this.consumeSkipNextShowRefresh();
      return;
    }
    await this.loadTask();
  },

  onUnload() {
    this.consumeSkipNextShowRefresh();
  },

  markSkipNextShowRefresh() {
    this.skipNextShowRefresh = true;
    if (this.skipNextShowRefreshTimer) clearTimeout(this.skipNextShowRefreshTimer);
    this.skipNextShowRefreshTimer = setTimeout(() => {
      this.skipNextShowRefresh = false;
      this.skipNextShowRefreshTimer = null;
    }, 120000);
  },

  consumeSkipNextShowRefresh() {
    this.skipNextShowRefresh = false;
    if (this.skipNextShowRefreshTimer) {
      clearTimeout(this.skipNextShowRefreshTimer);
      this.skipNextShowRefreshTimer = null;
    }
  },

  applyTask(task) {
    const taskImageUrls = taskImages.normalizeImageUrls(task.images, task.imageUrl);
    const completion = task.completion || {};
    const replies = (task.replies || []).map((reply) => {
      const replyImageUrls = taskImages.normalizeImageUrls(reply.images, reply.imageUrl);
      return {
        ...reply,
        imageUrls: replyImageUrls,
        imageItems: replyImageUrls.map((url) => ({ url })),
        timeText: formatReplyTime(reply.createdAt)
      };
    });
    this.setData({
      task,
      locationTitle: lbs.getLocationName(task.location),
      appointmentText: time.formatAppointmentTime(task.appointmentAt),
      createdText: time.formatAppointmentTime(task.createdAt, { emptyText: "" }),
      completedText: time.formatAppointmentTime(task.completedAt, { emptyText: "" }),
      statusText: getStatusText(task),
      completionText: completion.requiredCount > 1 ? `${completion.completedCount || 0} / ${completion.requiredCount} 人已完成` : "",
      completeActionText: getCompleteActionText(task),
      responseText: task.responseNote || "",
      taskImageUrls,
      taskImages: taskImageUrls.map((url) => ({ url })),
      replies,
      isResponding: false,
      responseDecision: "",
      responseNote: "",
      isSubmittingResponse: false,
      isCompleting: false,
      isLoading: false
    });
  },

  async loadTask() {
    if (!this.data.id) {
      wx.showToast({ title: "约定不存在", icon: "none" });
      return;
    }

    try {
      this.setData({ isLoading: !this.data.task });
      const state = await api.getState();
      const tasks = [...(state.tasks || []), ...(state.memories || [])];
      const task = tasks.find((item) => item && item._id === this.data.id);
      if (!task) {
        wx.showToast({ title: "约定不存在", icon: "none" });
        goBackHome();
        return;
      }
      this.applyTask(task);
    } catch (error) {
      this.setData({ isLoading: false });
      wx.showToast({ title: error.message || "加载失败", icon: "none" });
    }
  },

  openLocation() {
    if (!this.data.task || !this.data.task.location) return;
    this.markSkipNextShowRefresh();
    lbs.openLocation(this.data.task.location);
  },

  previewImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.markSkipNextShowRefresh();
    taskImages.previewImages(this.data.taskImageUrls, index);
  },

  onReplyInput(event) {
    this.setData({ replyText: event.detail.value });
  },

  async chooseReplyImage() {
    if (this.data.isUploadingReplyImage) return;
    const remainingCount = taskImages.MAX_TASK_IMAGE_COUNT - this.data.replyImageItems.length;
    if (remainingCount <= 0) {
      wx.showToast({ title: `最多上传 ${taskImages.MAX_TASK_IMAGE_COUNT} 张图片`, icon: "none" });
      return;
    }

    const previousImageItems = this.data.replyImageItems;
    let didShowLoading = false;

    try {
      const filePaths = await taskImages.chooseAndCompressImages({ count: remainingCount });
      if (filePaths.length === 0) return;

      this.setData({ isUploadingReplyImage: true });
      wx.showLoading({ title: "上传中", mask: true });
      didShowLoading = true;

      const fileIDs = await taskImages.uploadImages(filePaths);
      const nextItems = previousImageItems
        .concat(fileIDs.map((fileID, index) => ({
          fileID,
          previewUrl: filePaths[index] || fileID
        })))
        .slice(0, taskImages.MAX_TASK_IMAGE_COUNT);
      this.setData({
        replyImageItems: nextItems,
        replyImageUrls: nextItems.map((item) => item.previewUrl || item.fileID)
      });
    } catch (error) {
      if (!taskImages.isCancelError(error)) {
        this.setData({
          replyImageItems: previousImageItems,
          replyImageUrls: previousImageItems.map((item) => item.previewUrl || item.fileID)
        });
        wx.showToast({ title: error.message || "图片上传失败", icon: "none" });
      }
    } finally {
      this.setData({ isUploadingReplyImage: false });
      if (didShowLoading) wx.hideLoading();
    }
  },

  removeReplyImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    const replyImageItems = this.data.replyImageItems.filter((item, itemIndex) => item && itemIndex !== index);
    this.setData({
      replyImageItems,
      replyImageUrls: replyImageItems.map((item) => item.previewUrl || item.fileID)
    });
  },

  previewReplyDraftImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    taskImages.previewImages(this.data.replyImageUrls, index);
  },

  previewReplyImage(event) {
    const replyIndex = Number(event.currentTarget.dataset.replyIndex);
    const imageIndex = Number(event.currentTarget.dataset.imageIndex);
    const reply = this.data.replies[replyIndex];
    if (!reply) return;
    this.markSkipNextShowRefresh();
    taskImages.previewImages(reply.imageUrls, imageIndex);
  },

  async submitReply() {
    if (!this.data.task || this.data.isSubmittingReply) return;
    const text = this.data.replyText.trim();
    const images = this.data.replyImageItems.map((item) => item.fileID).filter(Boolean);
    if (!text && images.length === 0) {
      wx.showToast({ title: "写点文字或选张图片吧", icon: "none" });
      return;
    }

    try {
      this.setData({ isSubmittingReply: true });
      const task = await api.addTaskReply(this.data.task._id, { text, images });
      this.applyTask(task);
      this.setData({
        replyText: "",
        replyImageItems: [],
        replyImageUrls: [],
        isSubmittingReply: false
      });
      wx.showToast({ title: "已回复", icon: "success" });
    } catch (error) {
      this.setData({ isSubmittingReply: false });
      wx.showToast({ title: error.message || "回复失败", icon: "none" });
    }
  },

  startResponse(event) {
    const decision = event.currentTarget.dataset.decision;
    if (decision !== "accept" && decision !== "decline") return;
    this.setData({
      isResponding: true,
      responseDecision: decision,
      responseNote: ""
    });
  },

  cancelResponse() {
    this.setData({
      isResponding: false,
      responseDecision: "",
      responseNote: ""
    });
  },

  onResponseNoteInput(event) {
    this.setData({ responseNote: event.detail.value });
  },

  async submitResponse() {
    if (!this.data.task || this.data.isSubmittingResponse || !this.data.responseDecision) return;
    try {
      this.setData({ isSubmittingResponse: true });
      const task = await api.respondTask(
        this.data.task._id,
        this.data.responseDecision,
        this.data.responseNote.trim()
      );
      this.applyTask(task);
      wx.showToast({
        title: task.status === "declined" ? "已婉拒" : "已同意，约定开始",
        icon: "success"
      });
    } catch (error) {
      this.setData({ isSubmittingResponse: false });
      wx.showToast({ title: error.message || "操作失败", icon: "none" });
    }
  },

  async completeTask() {
    if (!this.data.task || this.data.isCompleting || !(this.data.task.permissions || {}).canComplete) return;

    try {
      this.setData({ isCompleting: true });
      const task = await api.completeTask(this.data.task._id);
      this.applyTask(task);
      wx.showToast({
        title: task.status === "completed" ? "约定已完成" : "已记录你的完成",
        icon: "success"
      });
    } catch (error) {
      this.setData({ isCompleting: false });
      wx.showToast({ title: error.message || "操作失败", icon: "none" });
    }
  },

  async deleteTask() {
    if (!this.data.task || !(this.data.task.permissions || {}).canDelete) return;
    const modal = await new Promise((resolve) => {
      wx.showModal({
        title: "删除约定",
        content: "删除后会同时从任务和回忆中移除，确定删除吗？",
        confirmText: "删除",
        confirmColor: "#e03e3e",
        success: resolve,
        fail: () => resolve({ confirm: false })
      });
    });
    if (!modal.confirm) return;

    try {
      await api.deleteTask(this.data.task._id);
      wx.showToast({ title: "已删除", icon: "success" });
      goBackHome();
    } catch (error) {
      wx.showToast({ title: error.message || "删除失败", icon: "none" });
    }
  },

  onShareAppMessage() {
    const task = this.data.task || {};
    const permissions = task.permissions || {};
    if (!permissions.canShare || !task.shareToken) {
      return { title: "来创建属于你们的双人空间", path: "/pages/index/index" };
    }
    return {
      title: "我想和你约定一件事",
      path: `/pages/task/share?id=${encodeURIComponent(task._id)}&shareToken=${encodeURIComponent(task.shareToken)}`
    };
  }
});
