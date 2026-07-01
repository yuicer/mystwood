"use strict";

function createCallError(source: AnyRecord | null | undefined, fallbackMessage: string) {
  const error = new Error(
    (source && (source.message || source.errMsg)) || fallbackMessage || "微信云函数调用失败"
  );
  if (source && source.code) error.code = source.code;
  if (source && source.errCode) error.errCode = source.errCode;
  if (source && source.errMsg) error.errMsg = source.errMsg;
  error.raw = source;
  return error;
}

function callFunction(name: string, data?: AnyRecord) {
  return new Promise((resolve, reject) => {
    if (!wx.cloud) {
      reject(new Error("wx.cloud 未初始化，请先在小程序端初始化云环境"));
      return;
    }

    wx.cloud.callFunction({
      name,
      data: data || {},
      success(res: AnyRecord) {
        const payload = res && res.result;
        if (payload && payload.code && payload.code !== 0) {
          reject(createCallError(payload, "微信云函数调用失败"));
          return;
        }
        resolve(payload && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload);
      },
      fail(error: AnyRecord) {
        reject(createCallError(error, "微信云函数调用失败"));
      }
    });
  });
}

module.exports = {
  getState() {
    return callFunction("space-service", { action: "getState" });
  },
  createSpace(name: string) {
    return callFunction("space-service", { action: "createSpace", name });
  },
  renameSpace(name: string) {
    return callFunction("space-service", { action: "renameSpace", name });
  },
  getInvite(inviteToken: string) {
    return callFunction("space-service", { action: "getInvite", inviteToken });
  },
  acceptInvite(inviteToken: string) {
    return callFunction("space-service", { action: "acceptInvite", inviteToken });
  },
  dissolveSpace() {
    return callFunction("space-service", { action: "dissolveSpace" });
  },
  waitSyncEvents(options: AnyRecord) {
    const opts = options || {};
    return callFunction("space-service", {
      action: "waitSyncEvents",
      cursor: opts.cursor,
      timeoutMs: opts.timeoutMs,
      intervalMs: opts.intervalMs,
      limit: opts.limit
    });
  },
  createTask(payload: AnyRecord) {
    return callFunction("task-service", { action: "createTask", payload });
  },
  respondTask(id: string, decision: string, note: string) {
    return callFunction("task-service", {
      action: "respondTask",
      id,
      payload: { decision, note: note || "" }
    });
  },
  completeTask(id: string) {
    return callFunction("task-service", { action: "completeTask", id });
  },
  addTaskReply(id: string, payload: AnyRecord) {
    return callFunction("task-service", { action: "addTaskReply", id, payload: payload || {} });
  },
  deleteTask(id: string) {
    return callFunction("task-service", { action: "deleteTask", id });
  },
  resolveTaskShare(id: string, shareToken: string) {
    return callFunction("task-service", { action: "resolveTaskShare", id, shareToken });
  }
};
