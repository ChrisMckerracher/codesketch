import { COMPOSER, composerAnchor, reviewDraft } from "./data.mjs";
import { threadMetrics, threadViewport } from "./thread.mjs";

// Integration geometry is derived from the same target, anchor, and vector
// layout as the feedback renderer. The optional vector context keeps scroll
// limits identical when callers use a custom layout context.
export function feedbackRegions({ model = {}, ui = {}, v } = {}) {
  if (!ui.feedbackOpen) return { composer: null, thread: null };
  const value = typeof model?.get === "function" ? model.get() ?? {} : model;
  const target = feedbackTarget(value, ui);
  if (!target) return { composer: null, thread: null };

  const anchor = composerAnchor(target.rect, Boolean(ui.collapsed));
  const composer = { x: anchor.x, y: anchor.y, width: COMPOSER.width, height: COMPOSER.height };
  if (!target.comment) return { composer, thread: null };

  const viewport = threadViewport(anchor);
  const metrics = threadMetrics(v, target.comment);
  return {
    composer,
    thread: { id: target.comment.id, ...viewport, maxScroll: metrics.maxScroll },
  };
}

function feedbackTarget(model, ui) {
  const phase = model.review?.phase;
  if (ui.selection && (phase === "selecting" || phase === "composing" || phase === "pausing")) return null;
  const draft = reviewDraft(model);
  const recovery = new Set(["submitting", "uncertain", "stale"]).has(phase);
  if (draft && (draft.rect || recovery)) return { rect: draft.canonicalRect, comment: null };
  if (new Set(["selecting", "composing", "pausing"]).has(phase)) return null;
  const comments = Array.isArray(model?.snapshot?.comments) ? model.snapshot.comments : [];
  const comment = comments.find((item) => item?.id === ui.selectedCommentId);
  return comment ? { rect: comment.rect, comment } : null;
}
