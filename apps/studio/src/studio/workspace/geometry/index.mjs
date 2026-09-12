// Public entrypoint for workspace geometry: the fixed 1000x700 design space,
// collapse-aware canvas bounds, pointer-to-design mapping, and rectangle
// clipping. Document coordinates are never remapped; viewport scaling maps
// linearly back onto design units.

export const DESIGN_WIDTH = 1000;
export const DESIGN_HEIGHT = 700;
export const CANVAS_WIDTH = 740;

// The workspace width is 740 with the inspector expanded and the full 1000
// design units when the sidebar is collapsed.
export function workspaceWidth(collapsed = false) {
  return collapsed ? DESIGN_WIDTH : CANVAS_WIDTH;
}

function clientPoint(event) {
  if (typeof event.clientX === "number" && typeof event.clientY === "number") {
    return [event.clientX, event.clientY];
  }
  const touch = event.touches?.[0] ?? event.changedTouches?.[0];
  return touch ? [touch.clientX, touch.clientY] : [0, 0];
}

// Maps a pointer-like event onto 1000x700 design coordinates using the
// element bounding rect. The result intentionally remains unbounded so a
// caller can distinguish an edge crossing from a point on the edge.
export function designPoint(event = {}, element) {
  const [clientX, clientY] = clientPoint(event);
  const rect = element.getBoundingClientRect();
  const width = rect.width > 0 ? rect.width : DESIGN_WIDTH;
  const height = rect.height > 0 ? rect.height : DESIGN_HEIGHT;
  return [
    ((clientX - rect.left) * DESIGN_WIDTH) / width,
    ((clientY - rect.top) * DESIGN_HEIGHT) / height,
  ];
}

// Clamps a design-space point into the drawable workspace: x within the
// canvas width for the current collapse state, y within the design height.
export function clampWorkspacePoint(point, collapsed = false) {
  const x = finite(point?.[0], 0);
  const y = finite(point?.[1], 0);
  const limit = workspaceWidth(collapsed);
  return [
    Math.min(Math.max(x, 0), limit),
    Math.min(Math.max(y, 0), DESIGN_HEIGHT),
  ];
}

// Intersects two rects ({x, y, width, height}); returns null when the
// intersection is empty.
export function clipRect(rect, bounds) {
  const x = Math.max(rect.x, bounds.x);
  const y = Math.max(rect.y, bounds.y);
  const right = Math.min(rect.x + rect.width, bounds.x + bounds.width);
  const bottom = Math.min(rect.y + rect.height, bounds.y + bounds.height);
  const width = right - x;
  const height = bottom - y;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
