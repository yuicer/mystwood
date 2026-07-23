"use strict";

const lbs = require("./lbs.js");
const time = require("./time.js");

const APPOINTMENT_DAY_COUNT = 180;
const APPOINTMENT_HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const APPOINTMENT_MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
const DEFAULT_APPOINTMENT_TIME = "10:00";
const DEFAULT_APPOINTMENT_INDEX = [0, 10, 0];

interface TaskFormData {
  title: string;
  desc: string;
  location: TaskLocation | null;
  images: string[];
  date: string;
  time: string;
}

function getEmptyForm() {
  return {
    title: "",
    desc: "",
    location: null,
    images: [],
    date: "",
    time: DEFAULT_APPOINTMENT_TIME
  } as TaskFormData;
}

function padNumber(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateValue(date: Date) {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function formatDateLabel(date: Date, offset: number, currentYear: number) {
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const monthDay = `${padNumber(date.getMonth() + 1)}月${padNumber(date.getDate())}日`;
  const dateText = date.getFullYear() === currentYear
    ? monthDay
    : `${date.getFullYear()}年${monthDay}`;

  if (offset === 0) return `今天 ${dateText}`;
  if (offset === 1) return `明天 ${dateText}`;
  return `${dateText} ${weekdays[date.getDay()]}`;
}

function createAppointmentConfig() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const dates = Array.from({ length: APPOINTMENT_DAY_COUNT }, (_, offset) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    return {
      label: formatDateLabel(date, offset, currentYear),
      value: formatDateValue(date)
    };
  });

  return {
    dates,
    range: [
      dates.map((date) => date.label),
      APPOINTMENT_HOURS,
      APPOINTMENT_MINUTES
    ],
    defaultIndex: DEFAULT_APPOINTMENT_INDEX
  };
}

function getAppointmentSelection(dateValues: string[], dateLabels: string[], index: number[] = []) {
  const dateIndex = Number(index[0]) || 0;
  const hourIndex = Number(index[1]) || 0;
  const minuteIndex = Number(index[2]) || 0;
  const date = dateValues[dateIndex] || dateValues[0] || "";
  const dateLabel = dateLabels[dateIndex] || date;
  const hour = APPOINTMENT_HOURS[hourIndex] || "10";
  const minute = APPOINTMENT_MINUTES[minuteIndex] || "00";
  const dateParts = date.split("-").map(Number);
  const timestamp = dateParts.length === 3
    ? new Date(dateParts[0], dateParts[1] - 1, dateParts[2], Number(hour), Number(minute), 0, 0).getTime()
    : null;

  return {
    date,
    label: dateLabel,
    time: `${hour}:${minute}`,
    text: timestamp ? time.formatAppointmentTime(timestamp) : ""
  };
}

function getAppointmentSelectionFromTimestamp(timestamp: number | string | null | undefined, dateValues: string[], dateLabels: string[]) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return null;

  const date = new Date(value);
  const dateValue = formatDateValue(date);
  const hour = padNumber(date.getHours());
  const minute = padNumber(date.getMinutes());
  const dateIndex = dateValues.indexOf(dateValue);
  const hourIndex = APPOINTMENT_HOURS.indexOf(hour);
  const minuteIndex = APPOINTMENT_MINUTES.indexOf(minute);

  return {
    date: dateValue,
    time: `${hour}:${minute}`,
    text: time.formatAppointmentTime(value),
    index: [
      dateIndex >= 0 ? dateIndex : 0,
      hourIndex >= 0 ? hourIndex : DEFAULT_APPOINTMENT_INDEX[1],
      minuteIndex >= 0 ? minuteIndex : DEFAULT_APPOINTMENT_INDEX[2]
    ]
  };
}

function getAppointmentData(timestamp: number | string | null | undefined) {
  const config = createAppointmentConfig();
  const dateValues = config.dates.map((date) => date.value);
  const dateLabels = config.dates.map((date) => date.label);
  const selection = getAppointmentSelectionFromTimestamp(timestamp, dateValues, dateLabels);

  return {
    appointmentRange: config.range,
    appointmentDateLabels: dateLabels,
    appointmentDateValues: dateValues,
    appointmentIndex: selection ? selection.index : config.defaultIndex,
    appointmentText: selection ? selection.text : ""
  };
}

function buildAppointmentAt(date: string, timeValue: string) {
  if (!date) return null;
  const dateParts = date.split("-").map(Number);
  const timeParts = (timeValue || DEFAULT_APPOINTMENT_TIME).split(":").map(Number);
  if (dateParts.length !== 3 || timeParts.length < 2) return null;

  const [year, month, day] = dateParts;
  const [hour, minute] = timeParts;
  const appointmentAt = new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
  return Number.isFinite(appointmentAt) ? appointmentAt : null;
}

function chooseTaskLocation(currentLocation: TaskLocation | null | undefined) {
  return new Promise<TaskLocation>((resolve, reject) => {
    if (!wx.chooseLocation) {
      reject(new Error("当前微信版本不支持位置选择"));
      return;
    }

    const point = lbs.normalizePoint(currentLocation);
    const options = lbs.isValidPoint(point)
      ? {
        latitude: point.latitude,
        longitude: point.longitude
      }
      : {};

    wx.chooseLocation({
      ...options,
      success(res: TaskLocation) {
        const location = lbs.normalizeChooseLocation(res);
        if (location) {
          resolve(location);
          return;
        }
        reject(new Error("地点坐标无效"));
      },
      fail: reject
    });
  });
}

module.exports = {
  getEmptyForm,
  getAppointmentData,
  getAppointmentSelection,
  buildAppointmentAt,
  chooseTaskLocation
};
