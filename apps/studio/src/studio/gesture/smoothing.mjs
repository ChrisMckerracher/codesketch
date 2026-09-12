const MAX_RADIUS = 5;

export function smoothPoints(points, strength) {
  const raw = points.map(([x, y]) => [x, y]);
  const amount = Number(strength);
  const mix = Number.isFinite(amount) ? Math.max(0, Math.min(100, amount)) / 100 : 0;
  if (mix === 0 || raw.length < 3) return raw;

  const last = raw.length - 1;
  const radius = Math.min(MAX_RADIUS, Math.max(1, Math.floor((last - 1) / 2)));
  return raw.map((point, index) => {
    if (index === 0 || index === last) return point;
    const from = Math.max(0, index - radius);
    const to = Math.min(last, index + radius);
    let x = 0;
    let y = 0;
    for (let neighbor = from; neighbor <= to; neighbor += 1) {
      x += raw[neighbor][0];
      y += raw[neighbor][1];
    }
    const count = to - from + 1;
    const averageX = x / count;
    const averageY = y / count;
    return [
      point[0] + (averageX - point[0]) * mix,
      point[1] + (averageY - point[1]) * mix,
    ];
  });
}
