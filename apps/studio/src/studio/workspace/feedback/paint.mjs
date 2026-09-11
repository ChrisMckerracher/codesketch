const ADVANCE = 8;
const LINE_HEIGHT = 11;
const DASH_ON = 8;
const DASH_PERIOD = 14;

export function wrapped(v, text, x, y, maxWidth, scale, color, maxLines = Infinity, opacity = 1) {
  const source = String(text ?? "");
  const lines = typeof v.wrap === "function" ? v.wrap(source, maxWidth, scale) : [source];
  const shown = lines.slice(0, maxLines);
  for (let index = 0; index < shown.length; index += 1) {
    v.text(shown[index], x, y + index * LINE_HEIGHT * scale, scale, color, 1, opacity);
  }
  return shown.length;
}

export function textWidth(v, text, scale) {
  const value = typeof v.measure === "function" ? v.measure(String(text), scale) : 0;
  return typeof value === "number" && Number.isFinite(value) ? value : String(text).length * ADVANCE * scale;
}

export function dashedRect(v, rect, first = "#0284C7", second = "#FFFFFF") {
  const edges = [
    { from: [rect.x, rect.y], to: [rect.x + rect.width, rect.y], length: rect.width },
    { from: [rect.x + rect.width, rect.y], to: [rect.x + rect.width, rect.y + rect.height], length: rect.height },
    { from: [rect.x + rect.width, rect.y + rect.height], to: [rect.x, rect.y + rect.height], length: rect.width },
    { from: [rect.x, rect.y + rect.height], to: [rect.x, rect.y], length: rect.height },
  ];
  const total = edges.reduce((sum, edge) => sum + edge.length, 0);
  drawDashPhase(v, edges, total, first, 0, rect);
  drawDashPhase(v, edges, total, second, DASH_ON - 1, rect);
}

function drawDashPhase(v, edges, total, color, offset, rect) {
  let distance = 0;
  let pattern = ((offset % DASH_PERIOD) + DASH_PERIOD) % DASH_PERIOD;
  while (distance < total) {
    const on = pattern < DASH_ON;
    const length = Math.min((on ? DASH_ON : DASH_PERIOD) - pattern, total - distance);
    if (on && length > 0) v.stroke(perimeterSegment(edges, distance, distance + length, rect), color, 1.5);
    distance += length;
    pattern = (pattern + length) % DASH_PERIOD;
  }
}

function perimeterSegment(edges, start, end, rect) {
  const points = [perimeterPoint(edges, start, rect)];
  let distance = 0;
  for (const edge of edges) {
    distance += edge.length;
    if (distance > start && distance < end) points.push(perimeterPoint(edges, distance, rect));
  }
  points.push(perimeterPoint(edges, end, rect));
  return points;
}

function perimeterPoint(edges, distance, rect) {
  let remaining = Math.max(distance, 0);
  for (const edge of edges) {
    if (remaining <= edge.length) {
      const ratio = edge.length > 0 ? remaining / edge.length : 0;
      return [edge.from[0] + (edge.to[0] - edge.from[0]) * ratio, edge.from[1] + (edge.to[1] - edge.from[1]) * ratio];
    }
    remaining -= edge.length;
  }
  return [rect.x, rect.y];
}

export function cardChrome(v, x, y, width, height, selected = false) {
  v.roundRect(x + 3, y + 3, width, height, 6, "rgba(0, 0, 0, 0.18)");
  v.roundRect(x, y, width, height, 6, selected ? "#F0F9FF" : "#FFFFFF");
  v.rect(x, y, width, 1, selected ? "#0284C7" : "#CBD5E1");
  v.rect(x, y, 1, height, selected ? "#0284C7" : "#CBD5E1");
  v.rect(x + width - 1, y, 1, height, "#CBD5E1");
  v.rect(x, y + height - 1, width, 1, "#CBD5E1");
  if (selected) v.rect(x, y, 3, height, "#0284C7");
}

export function buttonLabel(v, label, x, y, width, color = "#64748B") {
  const measured = textWidth(v, label, 0.55);
  const left = x + Math.max((width - measured) / 2, 3);
  v.text(label, left, y, 0.55, color, 1);
}
