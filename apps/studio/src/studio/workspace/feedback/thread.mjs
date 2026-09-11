import { clipControl, control } from "./data.mjs";

const BLOCK_GAP = 3;
const SCROLLBAR_X = 243;

// Coordinates are local to the fixed 248x178 composer card. Consumers can use
// threadViewport(anchor) to route wheel input in design space.
export const THREAD_VIEWPORT = Object.freeze({ x: 10, y: 44, width: 228, height: 64 });

export function threadViewport(anchor = {}) {
  const x = Number(anchor.x) || 0;
  const y = Number(anchor.y) || 0;
  return {
    x: x + THREAD_VIEWPORT.x,
    y: y + THREAD_VIEWPORT.y,
    width: THREAD_VIEWPORT.width,
    height: THREAD_VIEWPORT.height,
  };
}

export function renderThread({ ctx, v, x, y, comment, scroll, descriptors, drawable }) {
  const viewport = threadViewport({ x, y });
  const blocks = layoutBlocks(v, comment, viewport.width);
  const maxScroll = maxScrollFor(blocks.height, viewport.height);
  const offset = clamp(Number(scroll) || 0, 0, maxScroll);

  ctx.save();
  ctx.beginPath();
  ctx.rect(viewport.x, viewport.y, viewport.width, viewport.height);
  ctx.clip();
  drawBlocks(v, blocks.items, viewport, offset);
  ctx.restore();

  const range = control(
    "range",
    `feedback.thread.${comment.id}.scroll`,
    { x: x + SCROLLBAR_X - 5, y: viewport.y, width: 10, height: viewport.height },
    `Scroll comment ${comment.number ?? "thread"}`,
    "comments.thread.scroll",
    { id: comment.id },
    {
      value: offset,
      min: 0,
      max: maxScroll,
      step: 1,
      axis: "y",
      track: { x: x + SCROLLBAR_X, y: viewport.y + 2, width: 0, height: viewport.height - 4 },
      disabled: maxScroll === 0,
    },
  );
  const clipped = clipControl(range, drawable);
  if (clipped) descriptors.push(clipped);
  if (maxScroll > 0) drawScrollbar(v, x + SCROLLBAR_X, viewport.y, viewport.height, offset, maxScroll, blocks.height);

  return { viewport, contentHeight: blocks.height, scroll: offset, maxScroll };
}

export function threadMetrics(v, comment) {
  const blocks = layoutBlocks(v, comment, THREAD_VIEWPORT.width);
  return { contentHeight: blocks.height, maxScroll: maxScrollFor(blocks.height, THREAD_VIEWPORT.height) };
}

function layoutBlocks(v, comment, width) {
  const blocks = [];
  const stack = stackText(comment);
  if (stack) blocks.push({ text: stack, scale: 0.42, color: "#94A3B8" });
  blocks.push({ text: String(comment?.text ?? ""), scale: 0.5, color: "#334155" });
  for (const reply of Array.isArray(comment?.replies) ? comment.replies : []) {
    blocks.push({ text: replyText(reply), scale: 0.42, color: "#64748B" });
  }

  let height = 0;
  const items = blocks.map((block, index) => {
    const layout = layoutText(v, block.text, width, block.scale);
    if (index > 0) height += BLOCK_GAP;
    const item = { ...block, lines: layout.lines, top: height, lineHeight: layout.lineHeight };
    height += layout.height;
    return item;
  });
  return { items, height: height + 2 };
}

function drawBlocks(v, blocks, viewport, scroll) {
  const top = viewport.y + 1;
  const bottom = viewport.y + viewport.height;
  for (const block of blocks) {
    for (let index = 0; index < block.lines.length; index += 1) {
      const lineY = top + block.top + index * block.lineHeight - scroll;
      if (lineY + block.lineHeight <= viewport.y || lineY >= bottom) continue;
      const line = block.lines[index];
      if (line) v.text(line, viewport.x, lineY, block.scale, block.color, 1);
    }
  }
}

function drawScrollbar(v, x, y, height, scroll, maxScroll, contentHeight) {
  const thumbHeight = Math.max(12, Math.min(height - 4, Math.round((height / contentHeight) * height)));
  const thumbY = y + Math.round((scroll / maxScroll) * (height - thumbHeight));
  v.stroke([[x, thumbY], [x, thumbY + thumbHeight]], "#94A3B8", 2);
}

function layoutText(v, text, width, scale) {
  if (typeof v?.layout !== "function" || typeof v.wrap !== "function") {
    throw new TypeError("feedback threads require the supplied vector layout and wrap APIs");
  }
  const layout = v.layout(text, width, scale);
  const lines = v.wrap(text, width, scale);
  if (!layout || !Array.isArray(layout.lines) || !Array.isArray(lines) || lines.length === 0 ||
      lines.length !== layout.lines.length || !Number.isFinite(layout.height) ||
      !Number.isFinite(layout.lineHeight) || layout.lineHeight <= 0) {
    throw new TypeError("feedback threads require a valid vector text layout");
  }
  return { lines, height: layout.height, lineHeight: layout.lineHeight };
}

function stackText(comment) {
  const layers = Array.isArray(comment?.visibleLayers) ? comment.visibleLayers : [];
  if (layers.length === 0) return "";
  return `STACK: ${layers.map((layer) => String(layer?.id ?? "").toUpperCase()).filter(Boolean).join(", ")}`;
}

function replyText(reply) {
  const at = String(reply?.at ?? "").toUpperCase();
  return `${String(reply?.author ?? "").toUpperCase()}: ${String(reply?.text ?? "")}${at ? ` [${at}]` : ""}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function maxScrollFor(contentHeight, viewportHeight) {
  return Math.ceil(Math.max(contentHeight - viewportHeight, 0));
}
