"use strict";

function createCallError(source, fallbackMessage) {
  const error = new Error(
    (source && (source.message || source.errMsg)) || fallbackMessage || "微信云函数调用失败"
  );
  if (source && source.code) error.code = source.code;
  if (source && source.errCode) error.errCode = source.errCode;
  if (source && source.errMsg) error.errMsg = source.errMsg;
  error.raw = source;
  return error;
}

function callFunction(name, data) {
  return new Promise((resolve, reject) => {
    if (!wx.cloud) {
      reject(new Error("wx.cloud 未初始化，请先在小程序端初始化云环境"));
      return;
    }

    wx.cloud.callFunction({
      name,
      data: data || {},
      success(res) {
        const payload = res && res.result;
        if (payload && payload.code && payload.code !== 0) {
          reject(createCallError(payload, "微信云函数调用失败"));
          return;
        }
        resolve(payload && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload);
      },
      fail(error) {
        reject(createCallError(error, "微信云函数调用失败"));
      }
    });
  });
}

module.exports = {
  getState() {
    return callFunction("space-service", { action: "getState" });
  },
  createSpace(name) {
    return callFunction("space-service", { action: "createSpace", name });
  },
  renameSpace(name) {
    return callFunction("space-service", { action: "renameSpace", name });
  },
  getInvite(inviteToken) {
    return callFunction("space-service", { action: "getInvite", inviteToken });
  },
  acceptInvite(inviteToken) {
    return callFunction("space-service", { action: "acceptInvite", inviteToken });
  },
  dissolveSpace() {
    return callFunction("space-service", { action: "dissolveSpace" });
  },
  waitSyncEvents(options) {
    const opts = options || {};
    return callFunction("space-service", {
      action: "waitSyncEvents",
      cursor: opts.cursor,
      timeoutMs: opts.timeoutMs,
      intervalMs: opts.intervalMs,
      limit: opts.limit
    });
  },
  createTask(payload) {
    return callFunction("task-service", { action: "createTask", payload });
  },
  respondTask(id, decision, note) {
    return callFunction("task-service", {
      action: "respondTask",
      id,
      payload: { decision, note: note || "" }
    });
  },
  completeTask(id) {
    return callFunction("task-service", { action: "completeTask", id });
  },
  deleteTask(id) {
    return callFunction("task-service", { action: "deleteTask", id });
  },
  resolveTaskShare(id, shareToken) {
    return callFunction("task-service", { action: "resolveTaskShare", id, shareToken });
  }
};
