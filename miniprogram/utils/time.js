"use strict";

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function getPeriod(hour) {
  if (hour < 6) return "凌晨";
  if (hour < 12) return "上午";
  if (hour < 14) return "中午";
  if (hour < 18) return "下午";
  return "晚上";
}

function formatAppointmentTime(timestamp, options = {}) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return options.emptyText || "未约定";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return options.emptyText || "未约定";

  const now = options.now ? new Date(options.now) : new Date();
  const currentYear = now.getFullYear();
  const yearPrefix = date.getFullYear() === currentYear
    ? ""
    : `${String(date.getFullYear()).slice(-2)}年`;
  const hour = date.getHours();
  const minute = date.getMinutes();

  return `${yearPrefix}${date.getMonth() + 1}月${date.getDate()}号${getPeriod(hour)}${hour % 12 || 12}点${padNumber(minute)}分`;
}

module.exports = {
  formatAppointmentTime
};
