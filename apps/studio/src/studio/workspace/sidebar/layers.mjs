// Layers panel: header, stacked layer rows inside a clipped 200px viewport,
// and the thin paint-stroke scrollbar. Rows render the real document layer
// array in reverse (topmost first) with actual ids, names, opacities, and
// visibility. Rows taller when active (50px) than inactive (30px).

import { clipRect } from "../geometry/index.mjs";

const VIEWPORT = { x: 748, y: 272, width: 248, height: 200 };
const HIT_BOUNDS = { x: 0, y: VIEWPORT.y, width: 1000, height: VIEWPORT.height };
const SCROLL_TRACK = { x: 994, y: 276, width: 0, height: 192 };
const SCROLL_HITBOX = { x: 980, y: SCROLL_TRACK.y, width: 20, height: SCROLL_TRACK.height };
const ACTIVE_ROW_HEIGHT = 50;
const INACTIVE_ROW_HEIGHT = 30;
const NAME_MAX_WIDTH = 144;
const ACCENT = "#0284C7";

function control(kind, x, y, width, height, label, action, payload, extra = {}) {
  return {
    id: extra.id ?? action,
    kind,
    x,
    y,
    width,
    height,
    label,
    action,
    payload: payload ?? null,
    value: extra.value ?? null,
    min: extra.min ?? null,
    max: extra.max ?? null,
    step: extra.step ?? null,
    disabled: extra.disabled ?? false,
    ...(extra.axis === undefined ? {} : { axis: extra.axis }),
    ...(extra.track === undefined ? {} : { track: extra.track }),
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function fitText(v, text, scale, maxWidth) {
  let out = String(text ?? "");
  if (v.measure(out, scale) <= maxWidth) return out;
  while (out.length > 1 && v.measure(`${out}..`, scale) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}..`;
}

function layerOpacityPercent(layer) {
  return clamp(Math.round((Number(layer?.opacity) || 0) * 100), 0, 100);
}

export function renderLayersPanel(v, ctx, model, ui, controls) {
  const layers = model?.snapshot?.document?.layers ?? [];
  const rows = layoutRows(layers, model?.targetLayer ?? null);
  const totalHeight = rows.reduce((sum, row) => sum + row.height, 0);
  const maxScroll = Math.max(0, totalHeight - VIEWPORT.height);
  const requestedScroll = ui?.layerScroll ?? 0;
  const scroll = clamp(Math.round(Number(requestedScroll) || 0), 0, maxScroll);

  v.text("LAYERS", 756, 256, 0.8, "#64748B", 1);
  v.text("+ NEW", 936, 256, 0.75, ACCENT, 1);
  controls.push(control("button", 930, 252, 56, 18, "New layer", "layer.add", null, { id: "layers.add" }));

  ctx.save();
  ctx.beginPath();
  ctx.rect(VIEWPORT.x, VIEWPORT.y, VIEWPORT.width, VIEWPORT.height);
  ctx.clip();

  let rowY = VIEWPORT.y - scroll;
  for (const row of rows) {
    const visible = clipRect({ x: VIEWPORT.x, y: rowY, width: VIEWPORT.width, height: row.height }, VIEWPORT);
    if (visible) renderRow(v, controls, row, rowY);
    rowY += row.height;
  }
  ctx.restore();

  if (maxScroll > 0) renderScrollbar(v, controls, totalHeight, maxScroll, scroll);
}

function layoutRows(layers, targetLayer) {
  return layers.map((layer, canonicalIndex) => ({
    layer,
    number: String(canonicalIndex).padStart(2, "0"),
    active: layer?.id != null && layer.id === targetLayer,
    height: layer?.id != null && layer.id === targetLayer ? ACTIVE_ROW_HEIGHT : INACTIVE_ROW_HEIGHT,
  })).reverse();
}

function renderRow(v, controls, row, rowTop) {
  const { layer, active, height } = row;
  const name = String(layer?.name ?? "Untitled");
  const textY = rowTop + 4;
  if (active) {
    v.roundRect(748, rowTop, 244, 46, 3, "#F0F9FF");
    v.rect(748, rowTop, 3, 46, ACCENT);
  }
  v.text(row.number, 756, textY, 0.85, active ? ACCENT : "#64748B", 1);
  v.text(fitText(v, name, 0.85, NAME_MAX_WIDTH), 786, textY, 0.85, active ? "#0F172A" : "#64748B", 1);
  v.text(`${layerOpacityPercent(layer)}%`, 932, textY, 0.75, active ? ACCENT : "#94A3B8", 1);
  renderEye(v, layer, rowTop);

  clippedControl(controls, "button", { x: 748, y: rowTop, width: 244, height }, name, "layer.select",
    { id: layer.id }, { id: `layer.${layer.id}.select` });

  if (active) {
    renderRowOpacity(v, controls, layer, name, rowTop);
  }
  clippedControl(controls, "button", { x: 964, y: rowTop + 2, width: 24, height: 20,
  }, `${name} visibility`, "layer.visibility", { id: layer.id, visible: !layer?.visible },
  { id: `layer.${layer.id}.visibility` });
}

function renderEye(v, layer, rowTop) {
  if (layer?.visible) {
    v.ellipse(976, rowTop + 8, 12, 6, "#64748B");
    v.ellipse(976, rowTop + 8, 4, 4, "#FFFFFF");
  } else {
    v.ellipse(976, rowTop + 8, 12, 6, "#CBD5E1");
    v.stroke([[970, rowTop + 4], [982, rowTop + 12]], "#94A3B8", 1.5);
  }
}

function renderRowOpacity(v, controls, layer, name, rowTop) {
  const percent = layerOpacityPercent(layer);
  const textY = rowTop + 22;
  v.text("OPACITY", 756, textY, 0.65, "#0369A1", 1);
  v.rect(810, rowTop + 26, 128, 2, "#E2E8F0");
  const fillWidth = Math.round((percent / 100) * 128);
  v.rect(810, rowTop + 26, fillWidth, 2, ACCENT);
  v.ellipse(810 + fillWidth, rowTop + 27, 6, 6, ACCENT);
  clippedControl(controls, "range", { x: 810, y: rowTop + 20, width: 128, height: 16 },
    `${name} opacity`, "layer.opacity", { id: layer.id },
    { id: `layer.${layer.id}.opacity`, value: percent, min: 0, max: 100, step: 1 });
}

function renderScrollbar(v, controls, totalHeight, maxScroll, scroll) {
  const trackHeight = SCROLL_TRACK.height;
  const thumbHeight = Math.max(20, Math.min(trackHeight - 10,
    Math.round((VIEWPORT.height / totalHeight) * trackHeight)));
  const thumbY = SCROLL_TRACK.y + Math.round((scroll / maxScroll) * (trackHeight - thumbHeight));
  v.stroke([[SCROLL_TRACK.x, thumbY], [SCROLL_TRACK.x, thumbY + thumbHeight]], "#94A3B8", 4);
  clippedControl(controls, "range", SCROLL_HITBOX, "Layers scrollbar", "layers.scroll", null,
    { id: "layers.scroll", value: scroll, min: 0, max: maxScroll, step: 1,
      axis: "y", track: SCROLL_TRACK });
}

function clippedControl(controls, kind, rect, label, action, payload, extra) {
  const clipped = clipRect(rect, HIT_BOUNDS);
  if (!clipped) return;
  controls.push(control(kind, clipped.x, clipped.y, clipped.width, clipped.height,
    label, action, payload, extra));
}
