import { renderPalette } from "./palette/index.mjs";
import { renderFeedback } from "./feedback/index.mjs";
import { renderSidebar } from "./sidebar/index.mjs";

const NOTICE = { x: 16, y: 16, width: 380, height: 42 };
const TRANSIENT_REVIEW_PHASES = new Set(["selecting", "composing"]);

export function feedbackModel(value = {}, ui = {}) {
  const review = value.review;
  if (!TRANSIENT_REVIEW_PHASES.has(review?.phase) || !ui.selection) return value;
  return { ...value, review: { ...review, rect: ui.selection } };
}

export function artworkSignature(value = {}) {
  const snapshot = value.snapshot;
  if (!snapshot) return null;
  const active = snapshot.playback?.active;
  return JSON.stringify([
    snapshot.instanceId ?? null,
    snapshot.docGeneration ?? null,
    snapshot.artRevision ?? JSON.stringify(snapshot.document),
    active?.command?.id ?? null,
    active?.progress ?? null,
    value.draft ?? null,
  ]);
}

export function renderWorkspace({ ctx, v, model = {}, ui = {}, controls, artwork } = {}) {
  if (!ctx || !v) return [];
  clear(ctx);
  const descriptors = [];
  descriptors.push(...renderSidebar({ ctx, v, model, ui }));
  descriptors.push(...renderFeedback({ ctx, v, model, ui }));
  descriptors.push(...renderPalette({ ctx, v, model, ui, artwork }));
  renderNotice(v, model.notice);
  controls?.update(descriptors);
  controls?.draw(ctx, v);
  return descriptors;
}

function clear(ctx) {
  ctx.save?.();
  if (typeof ctx.setTransform === "function") ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect?.(0, 0, ctx.canvas?.width ?? 1000, ctx.canvas?.height ?? 700);
  ctx.restore?.();
}

function renderNotice(v, notice) {
  const message = typeof notice?.message === "string" ? notice.message.trim() : "";
  if (!message) return;
  const color = notice.tone === "error" ? "#B91C1C" : "#92400E";
  const lines = typeof v.wrap === "function" ? v.wrap(message, NOTICE.width - 24, 0.55) : [message];
  const shown = lines.slice(0, 3);
  const height = Math.max(NOTICE.height, 14 + shown.length * 9);
  v.roundRect(NOTICE.x, NOTICE.y, NOTICE.width, height, 4, "#FFF7ED");
  v.rect(NOTICE.x, NOTICE.y, 3, height, color);
  for (let index = 0; index < shown.length; index += 1) {
    v.text(shown[index], NOTICE.x + 12, NOTICE.y + 10 + index * 9, 0.55, color, 1);
  }
}
