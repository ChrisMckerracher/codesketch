// Canvas presentation for semantic controls. Native nodes remain invisible;
// textarea content, selection, carets, and focus rings are vector graphics.

import { cellWidth, caretPosition, layoutText } from "./layout.mjs";

const GLYPH_HEIGHT = 7;
const PADDING = 4;
const TEXT_COLOR = "#1E293B";
const PLACEHOLDER_COLOR = "#64748B";
const CARET_COLOR = "#2563EB";
const ACCENT = "#0284C7";
const SELECTION_OPACITY = 0.3;
const DISABLED_OPACITY = 0.45;

export function paint(ctx, v, entries, scrolls) {
  for (const entry of entries) {
    if (entry.descriptor.kind === "textarea") paintArea(ctx, v, entry, scrolls);
  }
  for (const entry of entries) {
    if (entry.focused) paintRing(v, entry.descriptor);
  }
}

function paintRing(v, descriptor) {
  const x = descriptor.x + 1;
  const y = descriptor.y + 1;
  const right = descriptor.x + descriptor.width - 1;
  const bottom = descriptor.y + descriptor.height - 1;
  v.stroke([[x, y], [right, y], [right, bottom], [x, bottom], [x, y]], ACCENT, 2);
}

function paintArea(ctx, v, entry, scrolls) {
  const d = entry.descriptor;
  const innerX = d.x + PADDING;
  const innerY = d.y + PADDING;
  const innerWidth = Math.max(d.width - PADDING * 2, 8);
  const innerHeight = Math.max(d.height - PADDING * 2, 11);
  const empty = String(entry.value ?? "").length === 0;
  const source = empty ? String(d.placeholder ?? "") : String(entry.value ?? "");
  const layout = layoutText(v, source, innerWidth, 1, d.singleLine);
  const cells = [...layout.cells].sort((a, b) => a.y - b.y || a.x - b.x || a.start - b.start);
  const selectionStart = finiteOffset(entry.selectionStart);
  const selectionEnd = finiteOffset(entry.selectionEnd, selectionStart);
  const activeOffset = entry.selectionDirection === "backward" ? selectionStart : selectionEnd;
  const caret = caretPosition(v, source, layout, activeOffset, 1);
  const maxScroll = d.singleLine ? Math.max(layout.width - innerWidth, 0) : Math.max(layout.height - innerHeight, 0);
  let scroll = Math.max(Number(scrolls.get(d.id)) || 0, 0);
  if (entry.focused) scroll = d.singleLine
    ? reveal(caret.x, cells.length ? cellWidth(v, cells, cells.length - 1) : 0, innerWidth, scroll)
    : reveal(caret.y, layout.lineHeight, innerHeight, scroll);
  scroll = Math.min(scroll, maxScroll);
  scrolls.set(d.id, scroll);

  ctx.save();
  ctx.beginPath();
  ctx.rect(d.x, d.y, d.width, d.height);
  ctx.clip();
  if (!empty && entry.focused && selectionEnd > selectionStart) {
    paintSelection(v, cells, selectionStart, selectionEnd, innerX, innerY, scroll, layout.lineHeight, d.singleLine);
  }
  const opacity = d.disabled ? DISABLED_OPACITY : 1;
  const color = empty ? PLACEHOLDER_COLOR : TEXT_COLOR;
  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index];
    if (cell.char === "\n") continue;
    const position = d.singleLine ? cell.x - scroll : cell.y - scroll;
    if (!d.singleLine && cell.y + layout.lineHeight < scroll) continue;
    if (d.singleLine ? position > innerWidth : position > innerHeight) break;
    if (cell.char) v.text(cell.char, innerX + (d.singleLine ? position : cell.x),
      innerY + (d.singleLine ? cell.y : position), 1, color, 1, opacity);
  }
  if (entry.focused && !d.disabled) {
    paintCaret(v, caret, innerX, innerY, scroll, layout.lineHeight, d);
  }
  ctx.restore();
}

function paintSelection(v, cells, start, end, innerX, innerY, scroll, lineHeight, singleLine) {
  for (let index = 0; index < cells.length; index += 1) {
    const cell = cells[index];
    if (cell.char === "\n" || cell.end <= start || cell.start >= end) continue;
    const width = cellWidth(v, cells, index);
    v.rect(
      innerX + cell.x - (singleLine ? scroll : 0),
      innerY + cell.y - (singleLine ? 0 : scroll),
      width,
      lineHeight,
      ACCENT,
      SELECTION_OPACITY,
    );
  }
}

function paintCaret(v, caret, innerX, innerY, scroll, lineHeight, descriptor) {
  const y = innerY + caret.y - (descriptor.singleLine ? 0 : scroll);
  if (y + GLYPH_HEIGHT < descriptor.y || y > descriptor.y + descriptor.height) return;
  const x = innerX + caret.x - (descriptor.singleLine ? scroll : 0);
  v.stroke([[x, y], [x, y + GLYPH_HEIGHT]], CARET_COLOR, 1);
}

function reveal(y, lineHeight, height, scroll) {
  if (y < scroll) return y;
  if (y + lineHeight > scroll + height) return y + lineHeight - height;
  return scroll;
}

function finiteOffset(value, fallback = 0) {
  return Number.isFinite(value) ? Math.max(value, 0) : fallback;
}
