// Comment geometry: viewport-to-document coordinate conversion and drag rects

// Converts a viewport point into integer document coordinates, clamped to the
// document bounds. `rect` is the canvas DOMRect; defaults match the document.
export function canvasPoint(clientX, clientY, rect, width = 1000, height = 700) {
  const scaleX = rect.width > 0 ? width / rect.width : 1;
  const scaleY = rect.height > 0 ? height / rect.height : 1;
  const x = Math.round((clientX - rect.left) * scaleX);
  const y = Math.round((clientY - rect.top) * scaleY);
  return [
    Math.max(0, Math.min(width, x)),
    Math.max(0, Math.min(height, y)),
  ];
}

// Normalizes two drag corner points into an integer rect, or null when the
// drag covers zero area (a click or a straight horizontal/vertical line).
export function selectionRect(a, b) {
  const x = Math.min(a[0], b[0]);
  const y = Math.min(a[1], b[1]);
  const width = Math.abs(a[0] - b[0]);
  const height = Math.abs(a[1] - b[1]);
  if (width === 0 || height === 0) return null;
  return { x, y, width, height };
}
