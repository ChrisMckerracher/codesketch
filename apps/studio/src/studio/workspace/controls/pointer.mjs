import { layoutText, offsetAtPoint } from "./layout.mjs";
import { clamp, rawPoint } from "./support.mjs";

const TEXT_PADDING = 4;

export function textOffset(record, event, vector, scrolls, locate) {
  const d = record.descriptor;
  const value = String(record.el.value ?? "");
  if (value.length === 0) return 0;
  const width = Math.max(d.width - TEXT_PADDING * 2, 8);
  const height = Math.max(d.height - TEXT_PADDING * 2, 11);
  const layout = layoutText(vector, value, width, 1, d.singleLine);
  const maxScroll = d.singleLine ? Math.max(layout.width - width, 0) : Math.max(layout.height - height, 0);
  const scroll = clamp(Number(scrolls?.get(d.id)) || 0, 0, maxScroll);
  const [px, py] = rawPoint(locate, event);
  return offsetAtPoint(vector, value, layout,
    px - d.x - TEXT_PADDING + (d.singleLine ? scroll : 0),
    py - d.y - TEXT_PADDING + (d.singleLine ? 0 : scroll), 1);
}

export function selectionAnchor(el) {
  const start = boundedOffset(el.selectionStart, el.value.length);
  const end = boundedOffset(el.selectionEnd, el.value.length);
  if (start === end) return start;
  return el.selectionDirection === "backward" ? end : start;
}

export function setSelection(el, anchor, focusOffset) {
  const focus = boundedOffset(focusOffset, el.value.length);
  const fixed = boundedOffset(anchor, el.value.length);
  const start = Math.min(fixed, focus);
  const end = Math.max(fixed, focus);
  const direction = focus < fixed ? "backward" : focus > fixed ? "forward" : "none";
  el.setSelectionRange(start, end, direction);
}

export function focus(el) {
  el.focus?.({ preventScroll: true });
}

export function primary(event) {
  return event?.isPrimary !== false && (event?.button == null || event.button === 0);
}

export function owns(record, event, activeDrag) {
  return activeDrag?.record === record && activeDrag.pointerId === event.pointerId;
}

function boundedOffset(value, max) {
  const offset = Number.isFinite(value) ? Math.floor(value) : 0;
  return Math.min(Math.max(offset, 0), max);
}
