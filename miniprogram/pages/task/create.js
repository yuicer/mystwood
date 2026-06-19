"use strict";

const api = require("../../utils/api.js");
const lbs = require("../../utils/lbs.js");
const taskForm = require("../../utils/task-form.js");
const taskImages = require("../../utils/task-images.js");

Page({
  data: Object.assign({
    form: taskForm.getEmptyForm(),
    selectedLocationName: "",
    imageItems: [],
    isUploadingImage: false,
    maxImageCount: taskImages.MAX_TASK_IMAGE_COUNT
  }, taskForm.getAppointmentData()),

  async onShow() {
    try {
      await api.getState();
    } catch (error) {
      wx.showToast({ title: error.message || "加载失败", icon: "none" });
    }
  },

  onTitleInput(event) {
    this.setData({ "form.title": event.detail.value });
  },

  onDescInput(event) {
    this.setData({ "form.desc": event.detail.value });
  },

  setAppointmentSelection(index) {
    const appointment = taskForm.getAppointmentSelection(this.data.appointmentDateValues, this.data.appointmentDateLabels, index);
    this.setData({
      appointmentIndex: index,
      appointmentText: appointment.text,
      "form.date": appointment.date,
      "form.time": appointment.time
    });
  },

  onAppointmentPick(event) {
    this.setAppointmentSelection(event.detail.value);
  },

  async chooseImage() {
    if (this.data.isUploadingImage) return;
    const remainingCount = taskImages.MAX_TASK_IMAGE_COUNT - this.data.imageItems.length;
    if (remainingCount <= 0) {
      wx.showToast({ title: `最多上传 ${taskImages.MAX_TASK_IMAGE_COUNT} 张图片`, icon: "none" });
      return;
    }

    const previousImages = this.data.form.images;
    const previousImageItems = this.data.imageItems;
    let didShowLoading = false;

    try {
      const filePaths = await taskImages.chooseAndCompressImages({ count: remainingCount });
      if (filePaths.length === 0) return;

      this.setData({ isUploadingImage: true });
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
        "form.images": nextItems.map((item) => item.fileID),
        imageItems: nextItems
      });
    } catch (error) {
      if (!taskImages.isCancelError(error)) {
        this.setData({
          "form.images": previousImages,
          imageItems: previousImageItems
        });
        wx.showToast({ title: error.message || "图片上传失败", icon: "none" });
      }
    } finally {
      this.setData({ isUploadingImage: false });
      if (didShowLoading) wx.hideLoading();
    }
  },

  previewImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    const urls = this.data.imageItems.map((item) => item.previewUrl || item.fileID);
    taskImages.previewImages(urls, index);
  },

  removeImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    const imageItems = this.data.imageItems.filter((item, itemIndex) => item && itemIndex !== index);
    this.setData({
      imageItems,
      "form.images": imageItems.map((item) => item.fileID)
    });
  },

  async chooseLocation() {
    try {
      const selectedLocation = await taskForm.chooseTaskLocation(this.data.form.location);
      this.setData({
        "form.location": selectedLocation,
        selectedLocationName: lbs.getLocationName(selectedLocation)
      });
    } catch (error) {
      if (!taskImages.isCancelError(error)) {
        wx.showToast({ title: error.message || "地图打开失败", icon: "none" });
      }
    }
  },

  async create() {
    const { form } = this.data;
    if (!form.title.trim()) {
      wx.showToast({ title: "请填写任务名称", icon: "none" });
      return;
    }

    try {
      await api.createTask({
        title: form.title.trim(),
        desc: form.desc.trim(),
        location: form.location,
        images: form.images,
        imageUrl: form.images[0] || "",
        appointmentAt: taskForm.buildAppointmentAt(form.date, form.time)
      });
      this.setData(Object.assign({
        form: taskForm.getEmptyForm(),
        selectedLocationName: "",
        imageItems: [],
        isUploadingImage: false
      }, taskForm.getAppointmentData()));
      wx.showToast({ title: "创建成功", icon: "success" });
      wx.navigateBack({
        fail() {
          wx.redirectTo({ url: "/pages/index/index" });
        }
      });
    } catch (error) {
      wx.showToast({ title: error.message || "创建失败", icon: "none" });
    }
  }
});
