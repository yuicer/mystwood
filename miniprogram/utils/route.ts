"use strict";

function decodeRouteValue(value: unknown) {
  if (typeof value !== "string") return "";
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return "";
  }
}

module.exports = {
  decodeRouteValue
};
