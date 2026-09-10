export const CANVAS_WIDTH = 1000;
export const CANVAS_HEIGHT = 700;
export const MAX_POINTS = 2000;

export function clampPoint(point) {
  return [
    Math.max(0, Math.min(CANVAS_WIDTH, point[0])),
    Math.max(0, Math.min(CANVAS_HEIGHT, point[1])),
  ];
}

export function boundedPoints(points) {
  if (points.length <= MAX_POINTS) return points;
  const sampled = [points[0]];
  for (let index = 1; index < points.length - 1; index += 2) {
    sampled.push(points[index]);
  }
  sampled.push(points[points.length - 1]);
  return sampled;
}

export function buildStroke(frozen, points) {
  return {
    type: 'stroke',
    layer: frozen.layer,
    brush: frozen.brush,
    color: frozen.color,
    size: frozen.size,
    opacity: frozen.opacity,
    points: boundedPoints(points).map(clampPoint),
  };
}

export function buildShape(frozen, type, start, current) {
  const [ax, ay] = clampPoint(start);
  const [bx, by] = clampPoint(current);
  const x = Math.min(ax, bx);
  const y = Math.min(ay, by);
  let width = Math.abs(ax - bx);
  let height = Math.abs(ay - by);
  width = Math.min(width, CANVAS_WIDTH - x);
  height = Math.min(height, CANVAS_HEIGHT - y);
  if (width < 1 || height < 1) return null;
  return { type, layer: frozen.layer, color: frozen.color, opacity: frozen.opacity, x, y, width, height };
}
