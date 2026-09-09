function partialPoints(points, progress) {
  if (progress >= 1 || points.length === 1) return points;
  const lengths = points.slice(1).map((point, i) => Math.hypot(point[0] - points[i][0], point[1] - points[i][1]));
  let remaining = lengths.reduce((sum, value) => sum + value, 0) * progress;
  const result = [points[0]];
  for (let i = 0; i < lengths.length; i++) {
    if (remaining >= lengths[i]) { result.push(points[i + 1]); remaining -= lengths[i]; }
    else {
      const ratio = remaining / lengths[i];
      result.push(points[i].map((value, axis) => value + (points[i + 1][axis] - value) * ratio));
      break;
    }
  }
  return result;
}

function path(context, points, size) {
  context.beginPath();
  if (points.length === 1) {
    context.arc(points[0][0], points[0][1], size / 2, 0, Math.PI * 2);
    context.fill();
    return;
  }
  context.moveTo(...points[0]);
  for (let i = 1; i < points.length; i++) context.lineTo(...points[i]);
  context.stroke();
}

export function drawStroke(context, mark, progress = 1) {
  const points = partialPoints(mark.points, progress);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = mark.color;
  context.fillStyle = mark.color;
  context.globalAlpha = mark.opacity;
  context.lineWidth = mark.size;
  if (mark.brush === 'eraser') context.globalCompositeOperation = 'destination-out';
  if (mark.brush === 'marker') { context.globalAlpha *= 0.45; context.lineCap = 'square'; }
  if (mark.brush === 'pencil') {
    context.globalAlpha *= 0.85;
    context.lineWidth = Math.max(1, mark.size * 0.35);
  }
  if (mark.brush === 'brush') {
    context.globalAlpha *= 0.16;
    for (const width of [1.18, 1, 0.82, 0.64, 0.46]) {
      context.lineWidth = mark.size * width;
      path(context, points, context.lineWidth);
    }
  } else path(context, points, context.lineWidth);
}
