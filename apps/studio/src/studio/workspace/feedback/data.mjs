import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  clampWorkspacePoint,
  clipRect,
  workspaceWidth,
} from "../geometry/index.mjs";

export const COMMENT_VIEWPORT = { x: 752, y: 514, width: 216, height: 140 };
export const COMMENT_CARD_HEIGHT = 35;
export const COMMENT_CARD_STEP = 38;
export const COMMENT_TRACK = { x: 994, y: 518, width: 0, height: 132 };
export const COMPOSER = { width: 248, height: 178 };

export function control(kind, id, rect, label, action, payload = null, extra = {}) {
  return {
    id,
    kind,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    label,
    action,
    payload,
    value: extra.value ?? null,
    min: extra.min ?? null,
    max: extra.max ?? null,
    step: extra.step ?? null,
    disabled: Boolean(extra.disabled),
    ...(extra.placeholder === undefined ? {} : { placeholder: extra.placeholder }),
    ...(extra.axis === undefined ? {} : { axis: extra.axis }),
    ...(extra.track === undefined ? {} : { track: extra.track }),
  };
}

export function clipControl(item, bounds) {
  const visible = clipRect(item, bounds);
  return visible ? { ...item, ...visible } : null;
}

export function drawableBounds(collapsed) {
  return { x: 0, y: 0, width: workspaceWidth(collapsed), height: DESIGN_HEIGHT };
}

export function commentState(model, ui) {
  const all = Array.isArray(model?.snapshot?.comments) ? model.snapshot.comments : [];
  const filter = ui.commentFilter === "active" ? "active" : "all";
  const visible = filter === "active" ? all.filter((item) => item?.status !== "resolved") : all;
  const totalHeight = visible.length * COMMENT_CARD_STEP;
  const maxScroll = Math.max(totalHeight - COMMENT_VIEWPORT.height, 0);
  const scroll = clamp(Number(ui.commentScroll) || 0, 0, maxScroll);
  return { all, visible, filter, allCount: all.length, activeCount: all.filter((item) => item?.status !== "resolved").length, scroll, maxScroll };
}

export function validRect(rect) {
  if (!rect || typeof rect !== "object") return null;
  const values = [rect.x, rect.y, rect.width, rect.height];
  if (!values.every((value) => Number.isFinite(value))) return null;
  if (rect.width <= 0 || rect.height <= 0 || rect.x < 0 || rect.y < 0) return null;
  if (rect.x + rect.width > DESIGN_WIDTH || rect.y + rect.height > DESIGN_HEIGHT) return null;
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

export function boundsText(rect) {
  const value = validRect(rect);
  return value ? `${value.x},${value.y} -> ${value.x + value.width},${value.y + value.height}` : "WHOLE CANVAS";
}

export function statusLabel(status) {
  if (status === "acknowledged") return "ACK";
  if (status === "open" || status === "addressed") return "ACTIVE";
  if (status === "resolved") return "RESOLVED";
  return "OPEN";
}

export function statusColors(status) {
  if (status === "acknowledged" || status === "resolved") return { fill: "#F1F5F9", text: "#64748B" };
  return { fill: "#E0F2FE", text: "#0284C7" };
}

export function composerAnchor(rect, collapsed) {
  const drawable = drawableBounds(collapsed);
  const target = validRect(rect);
  const rawX = target ? target.x + target.width + 12 : (drawable.width - COMPOSER.width) / 2;
  const rawY = target ? target.y - 4 : (drawable.height - COMPOSER.height) / 2;
  const bounded = clampWorkspacePoint([rawX, rawY], collapsed);
  return {
    x: Math.min(bounded[0], Math.max(drawable.width - COMPOSER.width, 0)),
    y: Math.min(bounded[1], drawable.height - COMPOSER.height),
  };
}

export function reviewDraft(model) {
  const review = model?.review;
  const phase = review?.phase;
  if (!phase || phase === "closed" || phase === "selecting" || phase === "pausing") return null;
  const rect = validRect(review.rect);
  const whole = rect ? null : { x: 0, y: 0, width: DESIGN_WIDTH, height: DESIGN_HEIGHT };
  return { phase, text: typeof review.text === "string" ? review.text : "", rect, canonicalRect: rect ?? whole };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
