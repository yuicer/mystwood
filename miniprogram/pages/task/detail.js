"use strict";

const api = require("../../utils/api.js");
const lbs = require("../../utils/lbs.js");
const taskForm = require("../../utils/task-form.js");
const taskImages = require("../../utils/task-images.js");
const time = require("../../utils/time.js");

function getStatusText(status) {
  if (status === "completed") return "已完成";
  if (status === "overdue") return "已逾期";
  return "待完成";
}

function goBackHome() {
  wx.navigateBack({
    fail() {
      wx.redirectTo({ url: "/pages/index/index" });
    }
  });
}

function createEditState(task) {
  const appointmentAt = task.appointmentAt || task.deadline;
  const appointmentData = taskForm.getAppointmentData(appointmentAt);
  const imageItems = taskImages.createImageItems(task.images, task.imageUrl);

  return {
    editForm: {
      title: task.title || "",
      desc: task.desc || "",
      location: task.location || null,
      images: imageItems.map((item) => item.fileID),
      date: appointmentData.appointmentDate,
      time: appointmentData.appointmentTime
    },
    editSelectedLocationName: lbs.getLocationName(task.location),
    editImageItems: imageItems,
    editAppointmentRange: appointmentData.appointmentRange,
    editAppointmentDateLabels: appointmentData.appointmentDateLabels,
    editAppointmentDateValues: appointmentData.appointmentDateValues,
    editAppointmentIndex: appointmentData.appointmentIndex,
    editAppointmentText: appointmentData.appointmentText
  };
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
    taskImages: [],
    taskImageUrls: [],
    isEditing: false,
    editForm: taskForm.getEmptyForm(),
    editSelectedLocationName: "",
    editImageItems: [],
    editAppointmentRange: [],
    editAppointmentDateLabels: [],
    editAppointmentDateValues: [],
    editAppointmentIndex: [0, 10, 0],
    editAppointmentText: "",
    isUploadingImages: false,
    isSavingEdit: false,
    maxImageCount: taskImages.MAX_TASK_IMAGE_COUNT,
    isLoading: true
  },

  onLoad(options) {
    this.setData({ id: options && options.id ? options.id : "" });
  },

  async onShow() {
    if (this.skipNextShowRefresh) {
      this.consumeSkipNextShowRefresh();
      return;
    }
    if (this.data.isEditing) return;
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
    this.setData({
      task,
      locationTitle: lbs.getLocationName(task.location),
      appointmentText: time.formatAppointmentTime(task.appointmentAt || task.deadline),
      createdText: time.formatAppointmentTime(task.createdAt, { emptyText: "" }),
      completedText: time.formatAppointmentTime(task.completedAt, { emptyText: "" }),
      statusText: getStatusText(task.status),
      taskImageUrls,
      taskImages: taskImageUrls.map((url) => ({ url })),
      isLoading: false
    });
  },

  async loadTask() {
    if (!this.data.id) {
      wx.showToast({ title: "任务不存在", icon: "none" });
      return;
    }

    try {
      this.setData({ isLoading: !this.data.task });
      const state = await api.getState();
      const tasks = [...(state.tasks || []), ...(state.memories || [])];
      const task = tasks.find((item) => item && item._id === this.data.id);
      if (!task) {
        wx.showToast({ title: "任务不存在", icon: "none" });
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

  enterEdit() {
    if (!this.data.task) return;
    this.setData({
      isEditing: true,
      ...createEditState(this.data.task)
    });
  },

  cancelEdit() {
    this.setData({
      isEditing: false,
      isUploadingImages: false,
      isSavingEdit: false
    });
  },

  onEditTitleInput(event) {
    this.setData({ "editForm.title": event.detail.value });
  },

  onEditDescInput(event) {
    this.setData({ "editForm.desc": event.detail.value });
  },

  setEditAppointmentSelection(index) {
    const appointment = taskForm.getAppointmentSelection(
      this.data.editAppointmentDateValues,
      this.data.editAppointmentDateLabels,
      index
    );
    this.setData({
      editAppointmentIndex: index,
      editAppointmentText: appointment.text,
      "editForm.date": appointment.date,
      "editForm.time": appointment.time
    });
  },

  onEditAppointmentPick(event) {
    this.setEditAppointmentSelection(event.detail.value);
  },

  async chooseEditLocation() {
    try {
      const selectedLocation = await taskForm.chooseTaskLocation(this.data.editForm.location);
      this.setData({
        "editForm.location": selectedLocation,
        editSelectedLocationName: lbs.getLocationName(selectedLocation)
      });
    } catch (error) {
      if (!taskImages.isCancelError(error)) {
        wx.showToast({ title: error.message || "地图打开失败", icon: "none" });
      }
    }
  },

  async chooseEditImage() {
    if (this.data.isUploadingImages) return;
    const remainingCount = taskImages.MAX_TASK_IMAGE_COUNT - this.data.editImageItems.length;
    if (remainingCount <= 0) {
      wx.showToast({ title: `最多上传 ${taskImages.MAX_TASK_IMAGE_COUNT} 张图片`, icon: "none" });
      return;
    }

    const previousImages = this.data.editForm.images;
    const previousImageItems = this.data.editImageItems;
    let didShowLoading = false;

    try {
      const filePaths = await taskImages.chooseAndCompressImages({ count: remainingCount });
      if (filePaths.length === 0) return;

      this.setData({ isUploadingImages: true });
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
        "editForm.images": nextItems.map((item) => item.fileID),
        editImageItems: nextItems
      });
    } catch (error) {
      if (!taskImages.isCancelError(error)) {
        this.setData({
          "editForm.images": previousImages,
          editImageItems: previousImageItems
        });
        wx.showToast({ title: error.message || "图片上传失败", icon: "none" });
      }
    } finally {
      this.setData({ isUploadingImages: false });
      if (didShowLoading) wx.hideLoading();
    }
  },

  previewEditImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    const urls = this.data.editImageItems.map((item) => item.previewUrl || item.fileID);
    this.markSkipNextShowRefresh();
    taskImages.previewImages(urls, index);
  },

  removeEditImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    const editImageItems = this.data.editImageItems.filter((item, itemIndex) => item && itemIndex !== index);
    this.setData({
      editImageItems,
      "editForm.images": editImageItems.map((item) => item.fileID)
    });
  },

  async saveEdit() {
    if (!this.data.task || this.data.isSavingEdit) return;
    const { editForm } = this.data;
    if (!editForm.title.trim()) {
      wx.showToast({ title: "请填写任务名称", icon: "none" });
      return;
    }

    try {
      this.setData({ isSavingEdit: true });
      const updatedTask = await api.updateTask(this.data.task._id, {
        title: editForm.title.trim(),
        desc: editForm.desc.trim(),
        location: editForm.location,
        images: editForm.images,
        imageUrl: editForm.images[0] || "",
        appointmentAt: taskForm.buildAppointmentAt(editForm.date, editForm.time)
      });
      this.applyTask(updatedTask);
      this.setData({ isEditing: false, isSavingEdit: false });
      wx.showToast({ title: "已保存", icon: "success" });
    } catch (error) {
      this.setData({ isSavingEdit: false });
      wx.showToast({ title: error.message || "保存失败", icon: "none" });
    }
  },

  async completeTask() {
    if (!this.data.task || this.data.task.status !== "todo") return;
    try {
      await api.completeTask(this.data.task._id);
      wx.showToast({ title: "已完成", icon: "success" });
      goBackHome();
    } catch (error) {
      wx.showToast({ title: error.message || "操作失败", icon: "none" });
    }
  },

  async deleteTask() {
    if (!this.data.task) return;
    const modal = await new Promise((resolve) => {
      wx.showModal({
        title: "删除任务",
        content: "删除后不会进入回忆，确定删除吗？",
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
  }
});
