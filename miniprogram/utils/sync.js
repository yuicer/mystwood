"use strict";

const api = require("./api.js");

const EVENT_TYPES = {
  INVITE_CONFIRMED: "INVITE_CONFIRMED",
  SPACE_UPDATED: "SPACE_UPDATED",
  TASK_CREATED: "TASK_CREATED",
  TASK_UPDATED: "TASK_UPDATED",
  TASK_IMAGES_ADDED: "TASK_IMAGES_ADDED",
  TASK_COMPLETED: "TASK_COMPLETED",
  TASK_DELETED: "TASK_DELETED",
  SPACE_DISSOLVED: "SPACE_DISSOLVED"
};

const REFRESH_EVENT_TYPES = [
  EVENT_TYPES.INVITE_CONFIRMED,
  EVENT_TYPES.SPACE_UPDATED,
  EVENT_TYPES.TASK_CREATED,
  EVENT_TYPES.TASK_UPDATED,
  EVENT_TYPES.TASK_IMAGES_ADDED,
  EVENT_TYPES.TASK_COMPLETED,
  EVENT_TYPES.TASK_DELETED,
  EVENT_TYPES.SPACE_DISSOLVED
];

function getEventMessage(event) {
  if (!event) return "";

  const payload = event.payload || {};
  switch (event.type) {
    case EVENT_TYPES.INVITE_CONFIRMED:
      return "对方已确认加入";
    case EVENT_TYPES.SPACE_UPDATED:
      return "空间名称已更新";
    case EVENT_TYPES.TASK_CREATED:
      return payload.title ? `新任务：${payload.title}` : "对方创建了新任务";
    case EVENT_TYPES.TASK_UPDATED:
      return payload.title ? `任务已更新：${payload.title}` : "对方更新了任务";
    case EVENT_TYPES.TASK_IMAGES_ADDED:
      return payload.title ? `任务有新图片：${payload.title}` : "对方上传了任务图片";
    case EVENT_TYPES.TASK_COMPLETED:
      return "对方完成了任务";
    case EVENT_TYPES.TASK_DELETED:
      return "对方删除了任务";
    case EVENT_TYPES.SPACE_DISSOLVED:
      return "空间已解绑";
    default:
      return "";
  }
}

function shouldRefreshForEvents(events) {
  return (events || []).some(event => REFRESH_EVENT_TYPES.includes(event.type));
}

function getErrorText(error) {
  if (!error) return "";
  return [
    error.errCode,
    error.code,
    error.errMsg,
    error.message
  ].filter(Boolean).join(" ");
}

function isRetryableSyncError(error) {
  const errorText = getErrorText(error);
  return /504003|timeout|timed out|network|request:fail|callFunction:fail|ECONN|ETIMEDOUT|超时/i.test(errorText);
}

function isTerminalSyncError(error) {
  const errorText = getErrorText(error);
  return /(^|\s)404(\s|$)|请先创建空间/.test(errorText);
}

function normalizeEvents(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.events)) return payload.events;
  if (payload.type && typeof payload.v === "number") return [payload];
  return [];
}

function createSimulatedSocketClient(options) {
  const opts = options || {};
  const retryDelays = [5000, 10000, 20000, 40000];
  const timeoutMs = opts.timeoutMs || 12000;
  const intervalMs = opts.intervalMs || 2500;
  const emptyReconnectMinMs = opts.emptyReconnectMinMs || 1500;
  const emptyReconnectMaxMs = opts.emptyReconnectMaxMs || 4500;
  const limit = opts.limit || 20;

  let cursor = typeof opts.cursor === "number" ? opts.cursor : 0;
  let stopped = true;
  let running = false;
  let retryCount = 0;

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function getRetryDelay() {
    return retryDelays[Math.min(retryCount, retryDelays.length - 1)];
  }

  function getEmptyReconnectDelay() {
    const min = Math.max(0, emptyReconnectMinMs);
    const max = Math.max(min, emptyReconnectMaxMs);
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function updateCursor(nextCursor, events) {
    let updatedCursor = typeof nextCursor === "number" ? nextCursor : cursor;
    (events || []).forEach((event) => {
      updatedCursor = Math.max(updatedCursor, Number(event.v || 0));
    });
    cursor = updatedCursor;
  }

  async function loop() {
    if (running) return;
    running = true;

    while (!stopped) {
      try {
        const response = await api.waitSyncEvents({
          cursor,
          timeoutMs,
          intervalMs,
          limit
        });
        if (stopped) break;

        const events = normalizeEvents(response && response.events);
        updateCursor(response && response.cursor, events);
        retryCount = 0;

        if (events.length > 0 && opts.onEvents) {
          opts.onEvents(events);
        } else if (events.length === 0) {
          await sleep(getEmptyReconnectDelay());
        }
      } catch (error) {
        if (stopped) break;
        if (opts.onError) opts.onError(error);
        if (isTerminalSyncError(error)) break;
        await sleep(getRetryDelay());
        retryCount += 1;
      }
    }

    running = false;
  }

  function start() {
    if (!stopped) return;
    stopped = false;
    loop();
  }

  return {
    start,
    close() {
      stopped = true;
    },
    getCursor() {
      return cursor;
    }
  };
}

module.exports = {
  EVENT_TYPES,
  getEventMessage,
  shouldRefreshForEvents,
  isRetryableSyncError,
  isTerminalSyncError,
  createSimulatedSocketClient
};
