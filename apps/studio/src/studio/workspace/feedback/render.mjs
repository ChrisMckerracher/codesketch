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
    renderComposer({ ctx, v, model, ui, comments: state.all, drawable, target, descriptors });
  }
  return descriptors;
}
