import { renderCanvas } from "./canvas.mjs";
import { renderComments } from "./comments.mjs";
import { commentState, drawableBounds } from "./data.mjs";
import { renderComposer } from "./composer.mjs";

export function renderFeedback({ ctx, v, model = {}, ui = {} } = {}) {
  if (!ctx || !v) return [];
  const state = commentState(model, ui);
  const drawable = drawableBounds(Boolean(ui.collapsed));
  const descriptors = [];
  if (!ui.collapsed) {
    renderComments({ ctx, v, state, selectedId: ui.selectedCommentId, descriptors });
  }
  if (ui.feedbackOpen) {
    const target = renderCanvas({ ctx, v, model, ui, comments: state.all, descriptors, drawable });
    const phase = model.review?.phase;
    const activeGesture = Boolean(ui.selection) && (phase === "selecting" || phase === "pausing" || phase === "composing");
    const hideComposer = phase === "selecting" || activeGesture;
    if (!hideComposer && (target.draft || target.selected)) {
      renderComposer({ ctx, v, model, ui, comments: state.all, drawable, target, descriptors });
    }
  }
  return descriptors;
}
