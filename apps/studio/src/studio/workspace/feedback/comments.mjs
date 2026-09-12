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
import { textWidth } from "./paint.mjs";

export function renderComments({ ctx, v, state, selectedId, descriptors }) {
  v.rect(756, 476, 228, 1, "#F1F5F9");
  v.text("COMMENTS", 756, 494, 0.85, "#0F172A", 1);
  const allRect = { x: 836, y: 488, width: 32, height: 16 };
  const activeRect = { x: 874, y: 488, width: 56, height: 16 };
  drawFilter(v, allRect, `${state.allCount}`, state.filter === "all");
  drawFilter(v, activeRect, `${state.activeCount} ACTIVE`, state.filter === "active");
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
     drawComment(v, comment, card, comment.id === selectedId);
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
  const base = text.endsWith("ACTIVE") ? 0.6 : 0.65;
  const width = textWidth(v, text, base);
  const scale = width > rect.width - 8 ? (base * (rect.width - 8)) / width * 0.98 : base;
  v.text(text, rect.x + (rect.width - textWidth(v, text, scale)) / 2, rect.y + 3, scale,
    selected ? "#FFFFFF" : "#64748B", 1);
}

function drawComment(v, comment, rect, selected) {
  if (selected) {
    v.roundRect(rect.x, rect.y - 2, rect.width, 35, 3, "#F0F9FF");
    v.rect(rect.x, rect.y - 2, 3, 35, "#0284C7");
  } else {
    v.rect(rect.x + 4, rect.y + 35, rect.width - 8, 1, "#F8FAFC");
  }
  const colors = statusColors(comment.status);
  const status = statusLabel(comment.status);
  const active = status === "ACTIVE";
  const title = truncate(v, `#${comment.number} ${String(comment.text ?? "").replace(/\s+/g, " ").trim()}`, 0.65, 138);
  v.ellipse(rect.x + 8, rect.y + 4, 8, 8, active ? "#0284C7" : "#94A3B8");
  v.text(title, rect.x + 22, rect.y + 2, 0.65, selected ? "#0F172A" : active ? "#1E293B" : "#64748B", 1);
  v.roundRect(rect.x + 168, rect.y, 44, 15, 2, colors.fill);
  v.text(status, rect.x + 168 + (44 - textWidth(v, status, 0.52)) / 2, rect.y + 3, 0.52, colors.text, 1);
  v.text(bounds(comment.rect), rect.x + 22, rect.y + 16, 0.52, "#64748B", 1);
}

function truncate(v, value, scale, width) {
  const text = String(value);
  if (textWidth(v, text, scale) <= width) return text;
  let result = "";
  for (const character of text) {
    const candidate = `${result}${character}...`;
    if (textWidth(v, candidate, scale) > width) break;
    result += character;
  }
  return `${result}...`;
}

function bounds(rect) {
  return rect && Number.isFinite(rect.x) ? `${rect.x},${rect.y} -> ${rect.x + rect.width},${rect.y + rect.height}` : "WHOLE CANVAS";
}
