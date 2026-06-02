"use strict";

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
          reject(new Error(payload.message || "微信云函数调用失败"));
          return;
        }
        resolve(payload && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload);
      },
      fail: reject
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
  completeTask(id) {
    return callFunction("task-service", { action: "completeTask", id });
  }
};
