// Public entrypoint for the vector drawing context. Wraps a Canvas 2D context
// with bounded primitives and path-only text rendering.

import { GLYPHS } from "./glyphs.mjs";
import { drawRect, drawStroke, drawEllipse, drawRoundRect } from "./primitives.mjs";
import { drawText, measureText, wrapText, layoutText } from "./text.mjs";

export { GLYPHS };

export function createVector(ctx) {
  return {
    rect(x, y, w, h, color, opacity = 1) {
      drawRect(ctx, x, y, w, h, color, opacity);
    },
    stroke(points, color, size = 1, opacity = 1) {
      drawStroke(ctx, points, color, size, opacity);
    },
    ellipse(cx, cy, width, height, color, opacity = 1) {
      drawEllipse(ctx, cx, cy, width, height, color, opacity);
    },
    roundRect(x, y, w, h, r, color, opacity = 1) {
      drawRoundRect(ctx, x, y, w, h, r, color, opacity);
    },
    text(text, x, y, scale = 1, color = "#1E293B", size = 1, opacity = 1) {
      drawText(ctx, text, x, y, scale, color, size, opacity);
    },
    wrap(text, maxWidth, scale = 1) {
      return wrapText(text, maxWidth, scale);
    },
    layout(text, maxWidth = Infinity, scale = 1) {
      return layoutText(text, maxWidth, scale);
    },
    measure(text, scale = 1) {
      return measureText(text, scale);
    },
  };
}
