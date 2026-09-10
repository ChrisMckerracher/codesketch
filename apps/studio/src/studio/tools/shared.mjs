export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.filter(Boolean));
  return node;
}

export function svgIcon(paths) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
}

export const TOOL_LABELS = {
  brush: 'Paintbrush',
  pencil: 'Pencil',
  marker: 'Marker',
  eraser: 'Eraser',
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  hand: 'Hand',
  comment: 'Comment',
};

export function canDispatchServer(value) {
  return Boolean(value.snapshot)
    && value.connection !== 'offline'
    && value.connection !== 'uncertain';
}
