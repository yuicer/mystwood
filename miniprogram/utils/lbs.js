"use strict";

const COORDINATE_TYPE = "gcj02";
const LOCATION_SOURCES = {
  CHOOSE: "wx-choose-location",
  POI: "qqmap-poi",
  CENTER: "qqmap-center"
};

function toText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function getLocationValue(location, primaryKey, fallbackKey) {
  if (!location) return null;
  const primary = toNumber(location[primaryKey]);
  if (primary !== null) return primary;
  return toNumber(location[fallbackKey]);
}

function normalizePoint(point) {
  const latitude = getLocationValue(point, "latitude", "lat");
  const longitude = getLocationValue(point, "longitude", "lng");
  if (latitude === null || longitude === null) return null;
  return { latitude, longitude };
}

function isValidPoint(point) {
  return point &&
    typeof point.latitude === "number" &&
    typeof point.longitude === "number" &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180;
}

function normalizeChooseLocation(result) {
  const point = normalizePoint(result);
  if (!isValidPoint(point)) return null;
  const name = toText(result && result.name) || toText(result && result.address) || "地图选点";

  return {
    source: LOCATION_SOURCES.CHOOSE,
    name,
    address: toText(result && result.address),
    latitude: point.latitude,
    longitude: point.longitude,
    coordinateType: COORDINATE_TYPE,
    poiId: ""
  };
}

function getLocationName(location) {
  return toText(location && (location.name || location.address));
}

function canOpenLocation(location) {
  const point = normalizePoint(location);
  return isValidPoint(point);
}

function openLocation(location) {
  const point = normalizePoint(location);
  if (!isValidPoint(point)) {
    wx.showToast({ title: "地点坐标不可用", icon: "none" });
    return;
  }

  wx.openLocation({
    latitude: point.latitude,
    longitude: point.longitude,
    scale: 16,
    name: getLocationName(location) || "任务地点",
    address: toText(location && location.address)
  });
}

module.exports = {
  COORDINATE_TYPE,
  LOCATION_SOURCES,
  canOpenLocation,
  getLocationName,
  isValidPoint,
  normalizeChooseLocation,
  normalizePoint,
  openLocation
};
