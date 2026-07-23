"use strict";

const api = require("../../utils/api.js");
const lbs = require("../../utils/lbs.js");
const taskForm = require("../../utils/task-form.js");
const taskImages = require("../../utils/task-images.js");

const TASK_KIND_OPTIONS = [
  {
    value: "self",
    title: "我来做",
    desc: "我想为自己做到，完成由我来决定。"
  },
  {
    value: "together",
    title: "一起做",
    desc: "等 TA 同意后，你们都要完成。"
  },
  {
    value: "for_partner",
    title: "希望 TA 做",
    desc: "等 TA 同意后，由 TA 来完成。"
  }
];

Page({
  data: Object.assign({
    form: taskForm.getEmptyForm(),
    kindOptions: TASK_KIND_OPTIONS,
    selectedKind: "self",
    selectedLocationName: "",
    imageItems: [],
    isUploadingImage: false,
    isSubmitting: false,
    maxImageCount: taskImages.MAX_TASK_IMAGE_COUNT
  }, taskForm.getAppointmentData()),

  async onShow() {
    try {
      await api.getState();
    } catch (error) {
      wx.showToast({ title: error.message || "加载失败", icon: "none" });
    }
  },

  onTitleInput(event: WxEvent<TextInputDetail>) {
    this.setData({ "form.title": event.detail.value });
  },

  onDescInput(event: WxEvent<TextInputDetail>) {
    this.setData({ "form.desc": event.detail.value });
  },

  selectKind(event: WxEvent<AnyRecord, { kind?: string }>) {
    const kind = event.currentTarget.dataset.kind;
    if (!TASK_KIND_OPTIONS.some((item: AnyRecord) => item.value === kind)) return;
    this.setData({ selectedKind: kind });
  },

  setAppointmentSelection(index: number[]) {
    const appointment = taskForm.getAppointmentSelection(this.data.appointmentDateValues, this.data.appointmentDateLabels, index);
    this.setData({
      appointmentIndex: index,
      appointmentText: appointment.text,
      "form.date": appointment.date,
      "form.time": appointment.time
    });
  },

  onAppointmentPick(event: WxEvent<PickerChangeDetail>) {
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
        .concat(fileIDs.map((fileID: string, index: number) => ({
          fileID,
          previewUrl: filePaths[index] || fileID
        })))
        .slice(0, taskImages.MAX_TASK_IMAGE_COUNT);

      this.setData({
        "form.images": nextItems.map((item: TaskImageItem) => item.fileID),
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

  previewImage(event: WxEvent<AnyRecord, { index?: number | string }>) {
    const index = Number(event.currentTarget.dataset.index);
    const urls = this.data.imageItems.map((item: TaskImageItem) => item.previewUrl || item.fileID);
    taskImages.previewImages(urls, index);
  },

  removeImage(event: WxEvent<AnyRecord, { index?: number | string }>) {
    const index = Number(event.currentTarget.dataset.index);
    const imageItems = this.data.imageItems.filter((item: TaskImageItem, itemIndex: number) => item && itemIndex !== index);
    this.setData({
      imageItems,
      "form.images": imageItems.map((item: TaskImageItem) => item.fileID)
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
    if (this.data.isSubmitting) return;
    if (this.data.isUploadingImage) {
      wx.showToast({ title: "请等待图片上传完成", icon: "none" });
      return;
    }

    const { form } = this.data;
    if (!form.title.trim()) {
      wx.showToast({ title: "请填写约定名称", icon: "none" });
      return;
    }

    try {
      this.setData({ isSubmitting: true });
      const createdTask = await api.createTask({
        title: form.title.trim(),
        desc: form.desc.trim(),
        location: form.location,
        images: form.images,
        kind: this.data.selectedKind,
        appointmentAt: taskForm.buildAppointmentAt(form.date, form.time)
      });
      wx.showToast({ title: "约定已创建", icon: "success" });
      wx.redirectTo({ url: `/pages/task/detail?id=${createdTask._id}` });
    } catch (error) {
      wx.showToast({ title: error.message || "创建失败", icon: "none" });
    } finally {
      this.setData({ isSubmitting: false });
    }
  }
});
