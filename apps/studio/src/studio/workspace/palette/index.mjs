import { createVector } from "../vector/index.mjs";
import { hexToHsv, hsvToHex, samplePixel } from "./color.mjs";

export { hexToHsv, hsvToHex, samplePixel } from "./color.mjs";

const PICKER = { x: 476, y: 168, width: 248, height: 216 };
const FIELD = { x: 486, y: 202, width: 228, height: 62 };
const HUE = { x: 486, y: 268, width: 228, height: 12 };
const HEX = /^#[\da-f]{6}$/i;
const HUE_STOPS = [0, 60, 120, 180, 240, 300, 360].map((hue) => hsvToHex(hue, 1, 1));

export function renderPalette({ ctx, v, model, ui, artwork } = {}) {
  const vector = v ?? createVector(ctx);
  const picker = pickerState(model, ui?.picker ?? {});
  const controls = [];
  const collapsed = Boolean(ui?.collapsed);

  if (picker.open && !collapsed) renderPicker(ctx, vector, picker, controls);
  if (picker.picking && picker.point) renderLoupe(ctx, vector, artwork, picker.point, collapsed);
  return controls;
}

function pickerState(model, input = {}) {
  const applied = validHex(model?.color) ? model.color.toLowerCase() : "#000000";
  const fallback = hexToHsv(applied);
  const hue = bounded(input.hue, 0, 360, fallback.hue);
  const saturation = bounded(input.saturation, 0, 1, fallback.saturation);
  const value = bounded(input.value, 0, 1, fallback.value);
  const point = Array.isArray(input.point) && input.point.length >= 2
    && Number.isFinite(input.point[0]) && Number.isFinite(input.point[1])
    ? [input.point[0], input.point[1]] : null;
  return {
    open: Boolean(input.open),
    hue,
    saturation,
    value,
    color: hsvToHex(hue, saturation, value),
    recent: recentColors(input.recent),
    picking: Boolean(input.picking),
    point,
  };
}

function renderPicker(ctx, v, picker, controls) {
  const { x, y, width, height } = PICKER;
  v.roundRect(x + 3, y + 3, width, height, 6, "rgba(0,0,0,0.25)");
  v.roundRect(x, y, width, height, 6, "#FFFFFF");
  v.rect(x, y, width, 1, "#CBD5E1");
  v.rect(x, y, 1, height, "#CBD5E1");
  v.rect(x + width - 1, y, 1, height, "#CBD5E1");
  v.rect(x, y + height - 1, width, 1, "#CBD5E1");
  v.roundRect(x + 1, y + 1, width - 2, 28, 5, "#F8FAFC");
  v.rect(x, y + 28, width, 1, "#E2E8F0");
  v.roundRect(x + 8, y + 5, 94, 18, 3, "#E0F2FE");
  v.text("COLOR PICKER", x + 14, y + 9, 0.65, "#0284C7", 1);
  v.text("X", x + width - 18, y + 8, 0.75, "#94A3B8", 1);

  drawSvField(ctx, v, picker.hue);
  const reticleX = FIELD.x + Math.round(picker.saturation * FIELD.width);
  const reticleY = FIELD.y + Math.round((1 - picker.value) * FIELD.height);
  v.ellipse(reticleX, reticleY, 12, 12, "#FFFFFF");
  v.ellipse(reticleX, reticleY, 8, 8, "#0F172A");
  v.stroke([[reticleX - 8, reticleY], [reticleX + 8, reticleY]], "#FFFFFF", 1);
  v.stroke([[reticleX, reticleY - 8], [reticleX, reticleY + 8]], "#FFFFFF", 1);

  drawHueField(ctx, v);
  const hueX = HUE.x + Math.round((picker.hue / 360) * HUE.width);
  v.ellipse(hueX, HUE.y + 6, 12, 12, "#FFFFFF");
  v.ellipse(hueX, HUE.y + 6, 8, 8, "#0F172A");

  v.roundRect(x + 10, y + 118, 56, 24, 3, picker.picking ? "#0284C7" : "#F0F9FF");
  v.rect(x + 10, y + 118, 56, 1, "#BAE6FD");
  v.text("PICK", x + 22, y + 124, 0.7, picker.picking ? "#FFFFFF" : "#0284C7", 1);
  v.roundRect(x + 72, y + 118, 90, 24, 3, "#F8FAFC");
  v.rect(x + 72, y + 118, 90, 1, "#CBD5E1");
  v.text(picker.color.toUpperCase(), x + 80, y + 124, 0.7, "#0F172A", 1);
  v.roundRect(x + 168, y + 118, 70, 24, 3, picker.color);
  v.text("NEW", x + 190, y + 124, 0.7, "#FFFFFF", 1);

  v.roundRect(x + 10, y + 150, 228, 26, 3, "#0284C7");
  v.text("APPLY PIGMENT", x + 68, y + 156, 0.75, "#FFFFFF", 1);
  v.text("RECENT", x + 10, y + 186, 0.65, "#94A3B8", 1);
  for (let index = 0; index < picker.recent.length; index += 1) {
    const centerX = x + 68 + index * 28;
    v.ellipse(centerX, y + 190, 14, 14, picker.recent[index]);
  }

  controls.push(control("plane", FIELD.x, FIELD.y, FIELD.width, FIELD.height,
    "Saturation and value", "pigment.sv", null,
    { id: "palette.picker.sv", value: { x: picker.saturation, y: inverseUnit(picker.value) }, step: 0.01 }));
  controls.push(control("range", HUE.x, HUE.y, HUE.width, HUE.height,
    "Hue", "pigment.hue", null,
    { id: "palette.picker.hue", value: picker.hue, min: 0, max: 360, step: 1 }));
  controls.push(control("button", x + 10, y + 118, 56, 24,
    "Pick color from artwork", "pigment.pick", null, { id: "palette.picker.pick" }));
  controls.push(control("button", x + 10, y + 150, 228, 26,
    "Apply pigment", "pigment.apply", null, { id: "palette.picker.apply" }));
  controls.push(control("button", x + 228, y + 2, 20, 20,
    "Close color picker", "pigment.close", null, { id: "palette.picker.close" }));
  for (let index = 0; index < picker.recent.length; index += 1) {
    controls.push(control("button", x + 60 + index * 28, y + 182, 20, 20,
      `Recent color ${index + 1}`, "pigment.recent", { color: picker.recent[index] },
      { id: `palette.picker.recent.${index}` }));
  }
}

function drawSvField(ctx, v, hue) {
  const color = hsvToHex(hue, 1, 1);
  if (!drawGradient(ctx, FIELD.x, FIELD.y, FIELD.width, FIELD.height, [
    [0, "#FFFFFF"], [1, color],
  ], false)) v.rect(FIELD.x, FIELD.y, FIELD.width, FIELD.height, color);
  if (!drawGradient(ctx, FIELD.x, FIELD.y, FIELD.width, FIELD.height, [
    [0, "rgba(0,0,0,0)"], [1, "#000000"],
  ], true)) v.rect(FIELD.x, FIELD.y, FIELD.width, FIELD.height, "rgba(0,0,0,0.35)");
  v.stroke([[FIELD.x, FIELD.y], [FIELD.x + FIELD.width, FIELD.y],
    [FIELD.x + FIELD.width, FIELD.y + FIELD.height], [FIELD.x, FIELD.y + FIELD.height],
    [FIELD.x, FIELD.y]], "#CBD5E1", 1);
}

function drawHueField(ctx, v) {
  const stops = HUE_STOPS.map((color, index) => [index / (HUE_STOPS.length - 1), color]);
  if (!drawGradient(ctx, HUE.x, HUE.y, HUE.width, HUE.height, stops, false)) {
    v.rect(HUE.x, HUE.y, HUE.width, HUE.height, "#FF0000");
  }
  v.stroke([[HUE.x, HUE.y], [HUE.x + HUE.width, HUE.y],
    [HUE.x + HUE.width, HUE.y + HUE.height], [HUE.x, HUE.y + HUE.height],
    [HUE.x, HUE.y]], "#CBD5E1", 1);
}

function drawGradient(ctx, x, y, width, height, stops, vertical) {
  if (typeof ctx?.createLinearGradient !== "function" || typeof ctx?.fillRect !== "function") return false;
  try {
    const gradient = ctx.createLinearGradient(x, y, vertical ? x : x + width, vertical ? y + height : y);
    if (typeof gradient.addColorStop !== "function") return false;
    for (const [position, color] of stops) gradient.addColorStop(position, color);
    ctx.save?.();
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);
    ctx.restore?.();
    return true;
  } catch {
    return false;
  }
}

function renderLoupe(ctx, v, artwork, point, collapsed) {
  const [x, y] = point;
  const color = samplePixel(artwork, x, y);
  const clip = typeof ctx?.save === "function" && typeof ctx?.restore === "function"
    && typeof ctx?.beginPath === "function" && typeof ctx?.rect === "function"
    && typeof ctx?.arc === "function" && typeof ctx?.clip === "function";
  if (clip) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, collapsed ? 1000 : 740, 700);
    ctx.clip();
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.clip();
    drawZoom(ctx, artwork, x, y, color);
    ctx.restore();
    drawLoupeMarks(v, x, y, color);
    ctx.restore();
  } else {
    drawLoupeMarks(v, x, y, color);
  }
}

function drawZoom(ctx, artwork, x, y, fallback) {
  if (typeof ctx?.drawImage !== "function" || !artwork) {
    if (typeof ctx?.fillRect === "function") {
      ctx.fillStyle = fallback;
      ctx.fillRect(x - 14, y - 14, 28, 28);
    }
    return;
  }
  const width = Math.max(1, Math.floor(Number(artwork.width) || 1));
  const height = Math.max(1, Math.floor(Number(artwork.height) || 1));
  const sx = Math.min(width - 1, Math.max(0, Math.round(x)));
  const sy = Math.min(height - 1, Math.max(0, Math.round(y)));
  const sourceLeft = sx - 3;
  const sourceTop = sy - 3;
  const sourceRight = sourceLeft + 7;
  const sourceBottom = sourceTop + 7;
  const left = Math.max(0, sourceLeft);
  const top = Math.max(0, sourceTop);
  const right = Math.min(width, sourceRight);
  const bottom = Math.min(height, sourceBottom);
  const scale = 4;
  const destinationLeft = x - 14 + (left - sourceLeft) * scale;
  const destinationTop = y - 14 + (top - sourceTop) * scale;
  ctx.imageSmoothingEnabled = false;
  if (typeof ctx.fillRect === "function") {
    ctx.fillStyle = fallback;
    ctx.fillRect(x - 14, y - 14, 28, 28);
  }
  try {
    if (right > left && bottom > top) {
      ctx.drawImage(artwork, left, top, right - left, bottom - top,
        destinationLeft, destinationTop, (right - left) * scale, (bottom - top) * scale);
    }
  } catch {
    if (typeof ctx?.fillRect === "function") {
      ctx.fillStyle = fallback;
      ctx.fillRect(x - 14, y - 14, 28, 28);
    }
  }
}

function drawLoupeMarks(v, x, y, color) {
  const circle = [];
  for (let index = 0; index <= 20; index += 1) {
    const angle = (index / 20) * Math.PI * 2;
    circle.push([x + Math.cos(angle) * 14, y + Math.sin(angle) * 14]);
  }
  v.stroke(circle, "#FFFFFF", 2);
  v.stroke([[x - 14, y], [x + 14, y]], "#FFFFFF", 1);
  v.stroke([[x, y - 14], [x, y + 14]], "#FFFFFF", 1);
  v.roundRect(x - 24, y + 18, 48, 14, 2, "#1E293B");
  v.text(color.toUpperCase(), x - 20, y + 20, 0.5, "#FFFFFF", 1);
}

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
  };
}

function bounded(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function inverseUnit(value) {
  return Number((1 - value).toFixed(6));
}

function validHex(value) {
  return typeof value === "string" && HEX.test(value);
}

function recentColors(values) {
  return Array.isArray(values) ? values.filter(validHex).slice(0, 6).map((color) => color.toLowerCase()) : [];
}
