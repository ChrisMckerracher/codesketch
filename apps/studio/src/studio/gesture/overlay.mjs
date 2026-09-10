const SVG_NS = 'http://www.w3.org/2000/svg';

export function createBrushGuide(overlay) {
  if (!overlay) return { show() {}, hide() {}, destroy() {} };
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('data-overlay', 'brush');
  group.setAttribute('visibility', 'hidden');
  const outer = document.createElementNS(SVG_NS, 'circle');
  outer.setAttribute('stroke', 'rgba(255, 255, 255, 0.9)');
  const inner = document.createElementNS(SVG_NS, 'circle');
  inner.setAttribute('stroke', 'rgba(0, 0, 0, 0.9)');
  for (const circle of [outer, inner]) {
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke-width', '1');
    circle.setAttribute('pointer-events', 'none');
  }
  group.append(outer, inner);
  overlay.append(group);
  return {
    show(x, y, size) {
      const radius = Math.max(1, size / 2);
      for (const [circle, delta] of [[outer, 0.5], [inner, -0.5]]) {
        circle.setAttribute('cx', String(x));
        circle.setAttribute('cy', String(y));
        circle.setAttribute('r', String(radius + delta));
      }
      group.setAttribute('visibility', 'visible');
    },
    hide() {
      group.setAttribute('visibility', 'hidden');
    },
    destroy() {
      group.remove();
    },
  };
}
