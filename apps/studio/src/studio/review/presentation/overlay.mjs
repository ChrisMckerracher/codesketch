const SVG_NS = 'http://www.w3.org/2000/svg';

function svgElement(tag, className) {
  const node = document.createElementNS(SVG_NS, tag);
  if (className) node.setAttribute('class', className);
  return node;
}

function drawRect(group, rect, className) {
  const node = svgElement('rect', className);
  node.setAttribute('x', rect.x);
  node.setAttribute('y', rect.y);
  node.setAttribute('width', rect.width);
  node.setAttribute('height', rect.height);
  group.appendChild(node);
}

function createPin(comment, onSelect) {
  const node = svgElement('g', 'review-pin');
  node.setAttribute('tabindex', '0');
  node.setAttribute('role', 'button');
  node.setAttribute('aria-label', `Highlight feedback #${comment.number}`);
  const circle = svgElement('circle');
  const label = svgElement('text');
  label.setAttribute('text-anchor', 'middle');
  node.append(circle, label);
  const activate = () => onSelect(comment.id);
  node.addEventListener('click', activate);
  node.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate();
    }
  });
  return {
    element: node,
    update(current, selected) {
      node.classList.toggle('is-selected', selected);
      const rect = current.rect;
      circle.setAttribute('cx', rect.x + rect.width / 2);
      circle.setAttribute('cy', rect.y + rect.height / 2);
      circle.setAttribute('r', 10);
      label.setAttribute('x', rect.x + rect.width / 2);
      label.setAttribute('y', rect.y + rect.height / 2 + 4);
      label.textContent = `#${current.number}`;
    },
  };
}

export function renderReviewOverlay(svg, value, { dragRect, selectedId, onSelect, pins = new Map() }) {
  let group = svg.querySelector('[data-overlay="review"]');
  if (!group) {
    group = svgElement('g', 'review-overlay');
    group.setAttribute('data-overlay', 'review');
    svg.appendChild(group);
  }
  let rects = group.querySelector('[data-review-rects]');
  if (!rects) {
    rects = svgElement('g', 'review-rects');
    rects.setAttribute('data-review-rects', '');
    group.appendChild(rects);
  }
  let layer = group.querySelector('[data-review-pins]');
  if (!layer) {
    layer = svgElement('g', 'review-pins');
    layer.setAttribute('data-review-pins', '');
    group.appendChild(layer);
  }
  const review = value.review;
  const feedbackMode = value.tool === 'comment' || value.tab === 'feedback';
  if (!feedbackMode) {
    pins.clear();
    layer.replaceChildren();
    rects.replaceChildren();
    return pins;
  }
  rects.replaceChildren();
  if (review.phase === 'selecting') {
    pins.clear();
    layer.replaceChildren();
    if (dragRect) drawRect(rects, dragRect, 'review-selection');
    return pins;
  }
  if (review.rect) drawRect(rects, review.rect, 'review-rect');
  if (dragRect) drawRect(rects, dragRect, 'review-selection');
  const comments = value.snapshot?.comments ?? [];
  const seen = new Set();
  let index = 0;
  for (const comment of comments) {
    if (!comment.rect) continue;
    seen.add(comment.id);
    let pin = pins.get(comment.id);
    if (!pin) {
      pin = createPin(comment, onSelect);
      pins.set(comment.id, pin);
    }
    pin.update(comment, comment.id === selectedId);
    const target = layer.children[index];
    if (target !== pin.element) layer.insertBefore(pin.element, target ?? null);
    index += 1;
  }
  for (const [id, pin] of pins) {
    if (!seen.has(id)) {
      pin.element.remove();
      pins.delete(id);
    }
  }
  const selected = comments.find((comment) => comment.id === selectedId && comment.rect);
  if (selected) drawRect(rects, selected.rect, 'review-highlight');
  return pins;
}

export function destroyReviewOverlay(svg) {
  svg.querySelector('[data-overlay="review"]')?.remove();
}
