// Small, control-specific value and geometry helpers shared by semantic DOM
// bindings. They do not hold state or touch the document.

export function elementTag(kind) {
  if (kind === "range") return "input";
  if (kind === "textarea") return "textarea";
  return "button";
}

export function rawPoint(point, event) {
  const value = point(event);
  if (Array.isArray(value)) return [number(value[0], 0), number(value[1], 0)];
  return [number(value?.x, 0), number(value?.y, 0)];
}

export function trackLimits(descriptor, axis) {
  const track = descriptor.track;
  const startKey = axis === "y" ? "y" : "x";
  const sizeKey = axis === "y" ? "height" : "width";
  const fallbackStart = descriptor[startKey];
  const fallbackEnd = fallbackStart + descriptor[sizeKey];
  if (Array.isArray(track)) {
    if (track.length >= 4) {
      return [number(track[axis === "y" ? 1 : 0], fallbackStart), number(track[axis === "y" ? 3 : 2], fallbackEnd)];
    }
    if (track.length >= 2) return [number(track[0], fallbackStart), number(track[1], fallbackEnd)];
  }
  if (!track || typeof track !== "object") return [fallbackStart, fallbackEnd];
  const start = number(
    track[startKey]
      ?? track[startKey === "y" ? "top" : "left"]
      ?? track[startKey + "1"]
      ?? track.from
      ?? track.start,
    fallbackStart,
  );
  const end = number(
    track[axis === "y" ? "y2" : "x2"]
      ?? track[axis === "y" ? "bottom" : "right"]
      ?? track.to
      ?? track.end,
    start + number(track[sizeKey], descriptor[sizeKey]),
  );
  return [start, end];
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
