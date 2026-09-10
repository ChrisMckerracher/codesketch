export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.filter(Boolean));
  return node;
}

export function findLayer(value, id) {
  const layers = value?.snapshot?.document?.layers;
  return Array.isArray(layers) ? layers.find((layer) => layer?.id === id) ?? null : null;
}

export function canDispatchServer(value) {
  return Boolean(value?.snapshot) && value.connection !== 'offline' && value.connection !== 'uncertain';
}

export function toPercent(fraction) {
  return String(Math.round(fraction * 100));
}

export function fromPercent(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, value)) / 100;
}

export function fromSize(text) {
  const value = Number(text);
  if (!Number.isInteger(value) || value < 1 || value > 100) return null;
  return value;
}

export function syncField(input, next, format = String) {
  const text = format(next);
  if (document.activeElement === input || input.dataset.held === 'true') return;
  if (input.dataset.dirty === 'true') {
    if (input.value === text) delete input.dataset.dirty;
    return;
  }
  if (input.value !== text) input.value = text;
}

export function run(dispatch, intent, report, onAccepted) {
  return dispatch(intent).then(
    () => {
      if (onAccepted) onAccepted();
      return true;
    },
    (error) => {
      report(error && error.message ? String(error.message) : 'Action failed');
      return false;
    },
  );
}

export function documentColors(value, limit = 7) {
  const marks = value?.snapshot?.document?.marks;
  const colors = [];
  if (!Array.isArray(marks)) return colors;
  for (let index = marks.length - 1; index >= 0 && colors.length < limit; index -= 1) {
    const color = typeof marks[index]?.color === 'string' ? marks[index].color.toLowerCase() : null;
    if (color && HEX_COLOR.test(color) && !colors.includes(color)) colors.push(color);
  }
  return colors;
}
