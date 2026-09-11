// Canvas drawing primitives. Each call saves and restores the canvas state so
// callers never leak alpha, colors, or line settings between operations.

export function drawRect(ctx, x, y, w, h, color, opacity = 1) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

export function drawStroke(ctx, points, color, size = 1, opacity = 1) {
  if (!Array.isArray(points) || points.length === 0) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0], points[i][1]);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawEllipse(ctx, cx, cy, width, height, color, opacity = 1) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, width / 2, height / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawRoundRect(ctx, x, y, w, h, r, color, opacity = 1) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.restore();
}
