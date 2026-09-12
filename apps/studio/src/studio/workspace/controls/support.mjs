// Small, control-specific value and geometry helpers shared by semantic DOM
// bindings. They do not hold state or touch the document.

export function elementTag(kind) {
  if (kind === "range") return "input";
  if (kind === "textarea") return "textarea";
  return "button";
}

export function rawPoint(point, event) {
  const value = point(event);
  if (!Array.isArray(value)) throw new TypeError("point must return [x, y]");
  return [number(value[0], 0), number(value[1], 0)];
}

export function trackLimits(descriptor, axis) {
  const startKey = axis === "y" ? "y" : "x";
  const sizeKey = axis === "y" ? "height" : "width";
  const track = descriptor.track && typeof descriptor.track === "object" ? descriptor.track : {};
  const start = number(track[startKey], number(descriptor[startKey], 0));
  const size = number(track[sizeKey], number(descriptor[sizeKey], 0));
  return [start, start + size];
}

export function setPlaneAria(record) {
  const { el, value } = record;
  el.setAttribute?.("aria-valuemin", "0");
  el.setAttribute?.("aria-valuemax", "1");
  el.setAttribute?.("aria-valuenow", `${value.x},${value.y}`);
}

export function planeValue(value) {
  return { x: clamp(number(value?.x, 0), 0, 1), y: clamp(number(value?.y, 0), 0, 1) };
}

export function number(value, fallback) {
  if (value == null || value === "") return fallback;
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

export function positive(value, fallback) {
  const result = number(value, fallback);
  return result > 0 ? result : fallback;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
