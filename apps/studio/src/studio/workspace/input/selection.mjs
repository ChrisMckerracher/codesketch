// Selection geometry stays in canonical document units.  The visible width is
// supplied by the caller so a draft never has to be rewritten when the
// inspector is collapsed or expanded.
export const DESIGN_BOUNDS = Object.freeze({ x: 0, y: 0, width: 1000, height: 700 });
export const HANDLE_SIZE = 8;
export function visibleBounds(collapsed = false) {
  return { x: 0, y: 0, width: collapsed ? 1000 : 740, height: 700 };
}
export function clampPoint(point, bounds = DESIGN_BOUNDS) {
  const x = finite(point?.[0], bounds.x);
  const y = finite(point?.[1], bounds.y);
  return [
    clamp(x, bounds.x, bounds.x + bounds.width),
    clamp(y, bounds.y, bounds.y + bounds.height),
  ];
}
export function canonicalRect(rect, bounds = DESIGN_BOUNDS) {
  if (!rect || typeof rect !== "object") return null;
  const x = integer(rect.x);
  const y = integer(rect.y);
  const width = integer(rect.width);
  const height = integer(rect.height);
  if (width < 1 || height < 1 || x < bounds.x || y < bounds.y) return null;
  if (x + width > bounds.x + bounds.width || y + height > bounds.y + bounds.height) return null;
  return { x, y, width, height };
}
export function rectFromPoints(start, end, bounds = DESIGN_BOUNDS) {
  const a = clampPoint(start, bounds);
  const b = clampPoint(end, bounds);
  const rect = {
    x: Math.min(Math.round(a[0]), Math.round(b[0])),
    y: Math.min(Math.round(a[1]), Math.round(b[1])),
    width: Math.abs(Math.round(a[0]) - Math.round(b[0])),
    height: Math.abs(Math.round(a[1]) - Math.round(b[1])),
  };
  return canonicalRect(rect, bounds);
}
export function handleAtPoint(rect, point, size = HANDLE_SIZE) {
  const source = canonicalRect(rect);
  if (!source) return null;
  const half = Math.max(1, Number(size) || HANDLE_SIZE) / 2;
  const corners = {
    nw: [source.x, source.y],
    ne: [source.x + source.width, source.y],
    sw: [source.x, source.y + source.height],
    se: [source.x + source.width, source.y + source.height],
  };
  for (const [name, corner] of Object.entries(corners)) {
    if (Math.abs(point?.[0] - corner[0]) <= half && Math.abs(point?.[1] - corner[1]) <= half) return name;
  }
  return null;
}
export function containsPoint(rect, point) {
  const source = canonicalRect(rect);
  if (!source) return false;
  return point?.[0] >= source.x && point?.[0] <= source.x + source.width
    && point?.[1] >= source.y && point?.[1] <= source.y + source.height;
}
export function moveRect(rect, point, anchor, bounds = DESIGN_BOUNDS) {
  const source = canonicalRect(rect);
  if (!source) return null;
  const maxX = Math.max(bounds.x, bounds.x + bounds.width - source.width);
  const maxY = Math.max(bounds.y, bounds.y + bounds.height - source.height);
  return {
    x: Math.round(clamp(point[0] - anchor[0], bounds.x, maxX)),
    y: Math.round(clamp(point[1] - anchor[1], bounds.y, maxY)),
    width: source.width,
    height: source.height,
  };
}
export function resizeRect(rect, handle, point, bounds = DESIGN_BOUNDS) {
  const source = canonicalRect(rect);
  if (!source || !Object.prototype.hasOwnProperty.call(CORNERS, handle)) return null;
  const opposite = CORNERS[oppositeHandle(handle)];
  const fixed = [source.x + (opposite[0] ? source.width : 0), source.y + (opposite[1] ? source.height : 0)];
  const active = clampPoint(point, bounds);
  const candidate = {
    x: Math.min(Math.round(active[0]), fixed[0]),
    y: Math.min(Math.round(active[1]), fixed[1]),
    width: Math.abs(Math.round(active[0]) - fixed[0]),
    height: Math.abs(Math.round(active[1]) - fixed[1]),
  };
  if (candidate.width < 1 || candidate.height < 1) return source;
  return canonicalRect(candidate);
}
const CORNERS = Object.freeze({ nw: [0, 0], ne: [1, 0], sw: [0, 1], se: [1, 1] });

function oppositeHandle(handle) {
  return handle.replace("n", "x").replace("s", "n").replace("x", "s")
    .replace("w", "x").replace("e", "w").replace("x", "e");
}
function finite(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}
function integer(value) {
  return Number.isSafeInteger(Math.round(Number(value))) ? Math.round(Number(value)) : -1;
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
