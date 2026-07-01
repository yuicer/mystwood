"use strict";

const MAX_TASK_IMAGE_COUNT = 9;
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp"];

function isCancelError(error: Error | AnyRecord | null | undefined) {
  const message = String((error && (error.errMsg || error.message)) || "");
  return message.includes("cancel") || message.includes("取消");
}

function getImageExtension(filePath: string) {
  const cleanPath = String(filePath || "").split("?")[0];
  const extension = cleanPath.split(".").pop().toLowerCase();
  return IMAGE_EXTENSIONS.includes(extension) ? extension : "jpg";
}

function createImageCloudPath(filePath: string) {
  const extension = getImageExtension(filePath);
  const random = Math.random().toString(36).slice(2, 8);
  return `task-images/${Date.now()}-${random}.${extension}`;
}

function uniqueUrls(urls: unknown[]) {
  const seen: Record<string, boolean> = {};
  const result: string[] = [];
  (urls || []).forEach((url) => {
    const text = typeof url === "string" ? url.trim() : "";
    if (!text || seen[text]) return;
    seen[text] = true;
    result.push(text);
  });
  return result;
}

function normalizeImageUrls(images: Array<string | TaskImageItem> | null | undefined, fallbackImageUrl = "") {
  const urls: string[] = [];
  if (Array.isArray(images)) {
    images.forEach((image) => {
      if (typeof image === "string") {
        urls.push(image);
        return;
      }
      if (image && typeof image === "object") {
        urls.push(image.fileID || image.url || image.imageUrl || "");
      }
    });
  }
  if (fallbackImageUrl) urls.push(fallbackImageUrl);
  return uniqueUrls(urls).slice(0, MAX_TASK_IMAGE_COUNT);
}

function createImageItems(images: Array<string | TaskImageItem> | null | undefined, fallbackImageUrl: string | null | undefined) {
  return normalizeImageUrls(images, fallbackImageUrl).map((url) => ({
    fileID: url,
    previewUrl: url
  }));
}

function chooseImages(count: number) {
  return new Promise<string[]>((resolve, reject) => {
    if (!wx.chooseImage) {
      reject(new Error("当前微信版本不支持选择图片"));
      return;
    }

    wx.chooseImage({
      count: Math.max(1, Math.min(MAX_TASK_IMAGE_COUNT, Number(count) || 1)),
      sizeType: ["original", "compressed"],
      sourceType: ["album", "camera"],
      success(res: AnyRecord) {
        resolve(Array.isArray(res.tempFilePaths) ? res.tempFilePaths : []);
      },
      fail: reject
    });
  });
}

function compressImage(filePath: string, quality: number | undefined) {
  if (!wx.compressImage) return Promise.resolve(filePath);

  return new Promise<string>((resolve) => {
    wx.compressImage({
      src: filePath,
      quality: Math.max(1, Math.min(100, Number(quality) || 72)),
      success(res: AnyRecord) {
        resolve(res.tempFilePath || filePath);
      },
      fail() {
        resolve(filePath);
      }
    });
  });
}

async function chooseAndCompressImages(options: { count: number; quality?: number }) {
  const opts = options;
  const paths = await chooseImages(opts.count);
  const compressedPaths: string[] = [];
  for (let index = 0; index < paths.length; index += 1) {
    compressedPaths.push(await compressImage(paths[index], opts.quality));
  }
  return compressedPaths;
}

function uploadImage(filePath: string) {
  return new Promise<string>((resolve, reject) => {
    if (!wx.cloud || !wx.cloud.uploadFile) {
      reject(new Error("云存储未初始化"));
      return;
    }

    wx.cloud.uploadFile({
      cloudPath: createImageCloudPath(filePath),
      filePath,
      success(res: AnyRecord) {
        if (res && res.fileID) {
          resolve(res.fileID);
          return;
        }
        reject(new Error("图片上传失败"));
      },
      fail: reject
    });
  });
}

async function uploadImages(filePaths: string[]) {
  const fileIDs: string[] = [];
  for (let index = 0; index < filePaths.length; index += 1) {
    fileIDs.push(await uploadImage(filePaths[index]));
  }
  return fileIDs;
}

function previewImages(urls: Array<string | TaskImageItem> | null | undefined, currentIndex: number) {
  const imageUrls = normalizeImageUrls(urls);
  if (imageUrls.length === 0 || !wx.previewImage) return;
  const index = Math.max(0, Math.min(imageUrls.length - 1, Number(currentIndex) || 0));
  wx.previewImage({
    current: imageUrls[index],
    urls: imageUrls
  });
}

module.exports = {
  MAX_TASK_IMAGE_COUNT,
  isCancelError,
  normalizeImageUrls,
  createImageItems,
  chooseAndCompressImages,
  uploadImages,
  previewImages
};
