import {
  COMMENT_CARD_HEIGHT,
  COMMENT_CARD_STEP,
  COMMENT_TRACK,
  COMMENT_VIEWPORT,
  clipControl,
  control,
  statusColors,
  statusLabel,
} from "./data.mjs";
import { cardChrome, textWidth, wrapped } from "./paint.mjs";

export function renderComments({ ctx, v, state, selectedId, descriptors }) {
  v.rect(756, 476, 228, 1, "#F1F5F9");
  v.text("COMMENTS", 756, 494, 0.85, "#0F172A", 1);
  const allRect = { x: 836, y: 488, width: 32, height: 16 };
  const activeRect = { x: 874, y: 488, width: 56, height: 16 };
  drawFilter(v, allRect, `ALL ${state.allCount}`, state.filter === "all");
  drawFilter(v, activeRect, ` ${state.activeCount} ACTIVE`, state.filter === "active");
  descriptors.push(control("button", "feedback.filter.all", allRect, "All comments", "comments.filter", { filter: "all" }));
  descriptors.push(control("button", "feedback.filter.active", activeRect, "Active comments", "comments.filter", { filter: "active" }));

  const scroll = control("range", "feedback.comments.scroll", { x: 980, y: 514, width: 20, height: 140 }, "Comments scrollbar", "comments.scroll", null, {
    value: state.scroll,
    min: 0,
    max: state.maxScroll,
    step: 1,
    axis: "y",
    track: COMMENT_TRACK,
    disabled: state.maxScroll === 0,
  });
  descriptors.push(scroll);

  ctx.save();
  ctx.beginPath();
  ctx.rect(COMMENT_VIEWPORT.x, COMMENT_VIEWPORT.y, COMMENT_VIEWPORT.width, COMMENT_VIEWPORT.height);
  ctx.clip();
  for (let index = 0; index < state.visible.length; index += 1) {
    const comment = state.visible[index];
    if (!comment || typeof comment.id !== "string") continue;
    const card = { x: COMMENT_VIEWPORT.x, y: COMMENT_VIEWPORT.y + 2 + index * COMMENT_CARD_STEP - state.scroll, width: 216, height: COMMENT_CARD_HEIGHT };
    const visible = clipControl(card, COMMENT_VIEWPORT);
    if (!visible) continue;
    drawComment(ctx, v, comment, card, comment.id === selectedId);
    descriptors.push(control("button", `feedback.comment.${comment.id}`, visible, `Select comment ${comment.number}`, "comments.select", { id: comment.id }));
  }
  ctx.restore();

  if (state.maxScroll > 0) {
    const trackHeight = COMMENT_TRACK.height;
    const thumbHeight = Math.max(26, Math.min(trackHeight - 10, Math.round((COMMENT_VIEWPORT.height / Math.max(state.visible.length * COMMENT_CARD_STEP, 1)) * trackHeight)));
    const thumbY = COMMENT_TRACK.y + Math.round((state.scroll / state.maxScroll) * (trackHeight - thumbHeight));
    v.stroke([[COMMENT_TRACK.x, thumbY], [COMMENT_TRACK.x, thumbY + thumbHeight]], "#94A3B8", 4);
  }
}

function drawFilter(v, rect, label, selected) {
  v.roundRect(rect.x, rect.y, rect.width, rect.height, 3, selected ? "#0284C7" : "#F1F5F9");
  if (!selected) v.rect(rect.x, rect.y, rect.width, 1, "#CBD5E1");
  const text = label.trim();
  const base = 0.6;
  const width = textWidth(v, text, base);
  const scale = width > rect.width - 8 ? (base * (rect.width - 8)) / width * 0.98 : base;
  wrapped(v, text, rect.x + 5, rect.y + 3, rect.width - 8, scale, selected ? "#FFFFFF" : "#64748B", 1);
}

function drawComment(ctx, v, comment, rect, selected) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  cardChrome(v, rect.x, rect.y, rect.width, rect.height, selected);
  const colors = statusColors(comment.status);
  v.ellipse(rect.x + 8, rect.y + 7, 8, 8, comment.status === "resolved" ? "#94A3B8" : "#0284C7");
  v.text(`#${comment.number}`, rect.x + 15, rect.y + 3, 0.5, selected ? "#0F172A" : "#64748B", 1);
  v.roundRect(rect.x + 168, rect.y + 1, 44, 15, 2, colors.fill);
  wrapped(v, statusLabel(comment.status), rect.x + 172, rect.y + 4, 38, 0.45, colors.text, 1);
  wrapped(v, comment.text, rect.x + 8, rect.y + 16, 204, 0.4, "#334155", 1);
  wrapped(v, bounds(comment.rect), rect.x + 8, rect.y + 24, 204, 0.36, "#64748B", 1);
  const replies = Array.isArray(comment.replies) ? comment.replies : [];
  if (replies.length > 0) {
    wrapped(v, replies.map(replyText).join(" | "), rect.x + 8, rect.y + 30, 204, 0.32, "#475569", 1);
  }
  ctx.restore();
}

function bounds(rect) {
  return rect && Number.isFinite(rect.x) ? `${rect.x},${rect.y} -> ${rect.x + rect.width},${rect.y + rect.height}` : "WHOLE CANVAS";
}

function replyText(reply) {
  const at = String(reply.at ?? "").toUpperCase();
  return `${String(reply.author ?? "").toUpperCase()}: ${String(reply.text ?? "")}${at ? ` [${at}]` : ""}`;
}
