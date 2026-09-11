import {
  COMPOSER,
  boundsText,
  clipControl,
  composerAnchor,
  control,
  statusColors,
  statusLabel,
} from "./data.mjs";
import { buttonLabel, cardChrome, wrapped } from "./paint.mjs";
import { renderThread } from "./thread.mjs";
import { clipRect } from "../geometry/index.mjs";

export function renderComposer({ ctx, v, model, ui, comments, drawable, target, descriptors }) {
  if (target.draft) return renderDraft({ ctx, v, model, ui, drawable, target, descriptors });
  if (target.selected) return renderStored({ ctx, v, model, ui, comments, drawable, comment: target.selected, descriptors });
}

function renderDraft({ ctx, v, model, ui, drawable, target, descriptors }) {
  const review = model.review;
  const anchor = composerAnchor(target.draft.sourceRect ?? target.draft.rect, ui.collapsed);
  const x = anchor.x;
  const y = anchor.y;
  drawArrow(v, target.draft.rect, drawable, x, y);
  cardChrome(v, x, y, COMPOSER.width, COMPOSER.height);
  v.roundRect(x + 1, y + 1, COMPOSER.width - 2, 28, 5, "#F8FAFC");
  v.rect(x, y + 28, COMPOSER.width, 1, "#E2E8F0");
  v.ellipse(x + 12, y + 14, 8, 8, "#0284C7");
  v.roundRect(x + 22, y + 5, 72, 18, 3, "#E0F2FE");
  v.text("DRAFT", x + 31, y + 9, 0.55, "#0284C7", 1);
  drawPhase(v, review.phase, x + 102, y + 5);
  v.text("X", x + 226, y + 8, 0.75, "#94A3B8", 1);
  v.text(`BOUNDS: ${boundsText(review.rect)}`, x + 10, y + 34, 0.55, "#475569", 1);
  v.roundRect(x + 10, y + 60, 228, 76, 3, "#F8FAFC");
  v.rect(x + 10, y + 60, 228, 1, "#CBD5E1");
  v.rect(x + 10, y + 60, 1, 76, "#CBD5E1");
  v.rect(x + 237, y + 60, 1, 76, "#CBD5E1");
  v.rect(x + 10, y + 135, 228, 1, "#CBD5E1");
  v.roundRect(x + 110, y + 144, 58, 24, 3, "#F1F5F9");
  v.rect(x + 110, y + 144, 58, 1, "#CBD5E1");
  buttonLabel(v, "CANCEL", x + 110, y + 150, 58);
  const recovery = recoveryAction(review.phase);
  v.roundRect(x + 174, y + 144, 64, 24, 3, "#0284C7");
  buttonLabel(v, recovery?.label ?? "SEND", x + 174, y + 150, 64, "#FFFFFF");

  addComposerControl(descriptors, "button", "feedback.composer.close", { x: x + 220, y: y + 3, width: 24, height: 24 }, "Close feedback", "review.cancel", null, drawable);
  addComposerControl(descriptors, "textarea", "feedback.composer.text", { x: x + 10, y: y + 60, width: 228, height: 76 }, "Feedback draft", "review.text", null, drawable, {
    value: target.draft.comment.text ?? "",
    placeholder: "WRITE FEEDBACK",
    disabled: review.phase !== "composing",
  });
  addComposerControl(descriptors, "button", "feedback.composer.cancel", { x: x + 110, y: y + 144, width: 58, height: 24 }, "Cancel feedback", "review.cancel", null, drawable);
  if (recovery) {
    addComposerControl(descriptors, "button", recovery.id, { x: x + 174, y: y + 144, width: 64, height: 24 }, recovery.label, recovery.action, null, drawable);
  } else {
    addComposerControl(descriptors, "button", "feedback.composer.submit", { x: x + 174, y: y + 144, width: 64, height: 24 }, "Send feedback", "review.submit", null, drawable, { disabled: review.phase !== "composing" || !String(review.text ?? "").trim() });
  }
}

function renderStored({ ctx, v, model, ui, comments, drawable, comment, descriptors }) {
  const anchor = composerAnchor(comment.rect, ui.collapsed);
  const x = anchor.x;
  const y = anchor.y;
  drawArrow(v, comment.rect, drawable, x, y);
  cardChrome(v, x, y, COMPOSER.width, COMPOSER.height, true);
  v.roundRect(x + 1, y + 1, COMPOSER.width - 2, 28, 5, "#F8FAFC");
  v.rect(x, y + 28, COMPOSER.width, 1, "#E2E8F0");
  const stepper = drawStepper(v, x, y, comment, comments);
  v.text(stepper.frame, x + 38, y + 9, 0.6, "#0284C7", 1);
  const colors = statusColors(comment.status);
  v.roundRect(x + 126, y + 5, 64, 18, 3, colors.fill);
  wrapped(v, statusLabel(comment.status), x + 132, y + 9, 54, 0.5, colors.text, 1);
  v.text("X", x + 226, y + 8, 0.75, "#94A3B8", 1);
  v.text(`BOUNDS: ${boundsText(comment.rect)}`, x + 10, y + 34, 0.55, "#475569", 1);
  renderThread({ ctx, v, x, y, comment, scroll: ui.threadScroll?.[comment.id], descriptors, drawable });
  v.roundRect(x + 10, y + 112, 160, 30, 3, "#F8FAFC");
  v.rect(x + 10, y + 112, 160, 1, "#CBD5E1");
  v.roundRect(x + 178, y + 112, 60, 30, 3, "#E0F2FE");
  const draft = replyDraft(ui, comment.id);
  const replyPending = pendingMapValue(ui.replyPending, comment.id);
  buttonLabel(v, "REPLY", x + 178, y + 121, 60, replyPending || !draft.trim() ? "#64748B" : "#0284C7");

  if (stepper.previous) addComposerControl(descriptors, "button", `feedback.comment.${stepper.previous.id}.previous`, { x: x + 20, y: y + 3, width: 18, height: 24 }, "Previous comment", "comments.select", { id: stepper.previous.id }, drawable);
  if (stepper.next) addComposerControl(descriptors, "button", `feedback.comment.${stepper.next.id}.next`, { x: x + 108, y: y + 3, width: 18, height: 24 }, "Next comment", "comments.select", { id: stepper.next.id }, drawable);
  addComposerControl(descriptors, "button", "feedback.stored.close", { x: x + 220, y: y + 3, width: 24, height: 24 }, "Close comment", "comments.select", { id: null }, drawable);
  addComposerControl(descriptors, "textarea", `feedback.reply.${comment.id}.text`, { x: x + 10, y: y + 112, width: 160, height: 30 }, `Reply to comment ${comment.number}`, "comments.reply.text", { id: comment.id }, drawable, { value: draft, placeholder: "REPLY" });
  addComposerControl(descriptors, "button", `feedback.reply.${comment.id}.send`, { x: x + 178, y: y + 112, width: 60, height: 30 }, "Send reply", "comments.reply.submit", { id: comment.id }, drawable, { disabled: replyPending || !draft.trim() });
  if (comment.status === "addressed") {
    const pending = transitionPending(model, ui, comment.id);
    v.roundRect(x + 178, y + 146, 60, 24, 3, pending ? "#E2E8F0" : "#0284C7");
    buttonLabel(v, "RESOLVE", x + 178, y + 152, 60, pending ? "#94A3B8" : "#FFFFFF");
    addComposerControl(descriptors, "button", `feedback.comment.${comment.id}.resolve`, { x: x + 178, y: y + 146, width: 60, height: 24 }, "Resolve comment", "review.transition", { id: comment.id }, drawable, { disabled: pending });
  }
}

function drawStepper(v, x, y, current, comments) {
  const ordered = Array.isArray(comments) ? comments : [];
  const index = ordered.findIndex((item) => item?.id === current.id);
  const previous = index > 0 ? ordered[index - 1] : null;
  const next = index >= 0 && index + 1 < ordered.length ? ordered[index + 1] : null;
  if (previous) buttonLabel(v, "<", x + 20, y + 9, 18, "#0284C7");
  if (next) buttonLabel(v, ">", x + 108, y + 9, 18, "#0284C7");
  const position = index >= 0 ? index + 1 : 0;
  return { previous, next, frame: `#${String(position).padStart(2, "0")}/${String(ordered.length).padStart(2, "0")}` };
}

function drawPhase(v, phase, x, y) {
  const label = phase === "submitting" ? "SENDING" : phase === "uncertain" ? "UNCERTAIN" : phase === "stale" ? "STALE" : "DRAFT";
  v.roundRect(x, y, 86, 18, 3, "#F1F5F9");
  wrapped(v, label, x + 6, y + 5, 76, 0.45, "#64748B", 1);
}

function drawArrow(v, rect, drawable, x, y) {
  const visible = rect ? clipRect(rect, drawable) : null;
  if (!visible) return;
  const fromX = visible.x + visible.width;
  const fromY = visible.y + Math.min(visible.height / 2, 200);
  const toX = x;
  const toY = Math.min(Math.max(fromY, y + 20), y + COMPOSER.height - 20);
  v.stroke([[fromX, fromY], [toX, toY]], "#0284C7", 1.5);
}

function recoveryAction(phase) {
  if (phase === "uncertain") return { id: "feedback.composer.retry", label: "RETRY", action: "review.retry" };
  if (phase === "stale") return { id: "feedback.composer.reselect", label: "RESELECT", action: "review.reselect" };
  return null;
}

function replyDraft(ui, id) {
  const value = ui.replyDrafts?.[id];
  return typeof value === "string" ? value : "";
}

function pendingMapValue(map, id) {
  return Boolean(map && typeof map === "object" && map[id]);
}

function transitionPending(model, ui, id) {
  const pending = [model?.pending, ui.pending, ui.transitionPending];
  return pending.some((value) => Array.isArray(value)
    ? value.includes("review.transition") || value.includes(id) || value.includes(`review.transition:${id}`)
    : pendingMapValue(value, id));
}

function addComposerControl(descriptors, kind, id, rect, label, action, payload, drawable, extra = {}) {
  const item = control(kind, id, rect, label, action, payload, extra);
  const clipped = clipControl(item, drawable);
  if (clipped) descriptors.push(clipped);
}
