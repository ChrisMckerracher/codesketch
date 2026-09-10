export const MODEL_KEYS = Object.freeze([
  'snapshot',
  'tool',
  'size',
  'opacity',
  'color',
  'targetLayer',
  'draft',
  'context',
  'tab',
  'filename',
  'connection',
  'pending',
  'notice',
  'review',
  'viewport',
  'drawers',
]);

const DEFAULTS = Object.freeze({
  tool: 'brush',
  size: 12,
  opacity: 1,
  color: '#253d38',
  targetLayer: null,
  draft: null,
  context: 'tool',
  tab: 'layers',
  filename: 'Untitled',
  connection: 'connecting',
});

const DETACH_KEYS = new Set(['snapshot', 'draft', 'notice', 'review', 'viewport', 'drawers']);

function detachValue(incoming) {
  if (Array.isArray(incoming)) {
    return Object.freeze(incoming.map(detachValue));
  }
  if (!isPlainObject(incoming)) return incoming;
  const copy = {};
  for (const key of Object.keys(incoming)) {
    copy[key] = detachValue(incoming[key]);
  }
  return Object.freeze(copy);
}

export function detachFields(fields) {
  const normalized = { ...fields };
  for (const key of DETACH_KEYS) {
    if (key in normalized) normalized[key] = detachValue(normalized[key]);
  }
  return normalized;
}

export function topLayerId(layers) {
  if (!Array.isArray(layers) || layers.length === 0) return null;
  return layers[layers.length - 1].id;
}

export function createInitialValue(state) {
  const value = {
    ...DEFAULTS,
    snapshot: null,
    pending: [],
    notice: null,
    review: {
      phase: 'closed',
      rect: null,
      text: '',
      keepPaused: true,
      requestId: null,
      generation: null,
      artRevision: null,
    },
    viewport: { mode: 'fit', scale: 1, x: 0, y: 0 },
    drawers: { left: false, right: false },
  };
  if (state) {
    value.tool = state.tool ?? value.tool;
    value.size = state.size ?? value.size;
    value.opacity = state.opacity ?? value.opacity;
    value.color = state.color ?? value.color;
    value.targetLayer = state.targetLayer ?? topLayerId(state.snapshot?.document?.layers);
    value.draft = state.draft ?? null;
    value.notice = state.notification ?? null;
    value.connection = state.isOffline ? 'offline' : value.connection;
    value.snapshot = state.snapshot ?? null;
  }
  for (const key of DETACH_KEYS) value[key] = detachValue(value[key]);
  return freezeValue(value);
}

export function mergeFields(value, fields, { allowSnapshot = false } = {}) {
  const incoming = detachFields(fields);
  let changed = false;
  const next = { ...value };
  for (const key of Object.keys(incoming)) {
    if (!MODEL_KEYS.includes(key)) {
      throw new TypeError(`unknown model field: ${key}`);
    }
    if (key === 'snapshot' && !allowSnapshot) {
      throw new TypeError('model snapshot is applied only by the session coordinator');
    }
    if (sameValue(value[key], incoming[key])) continue;
    next[key] = incoming[key];
    changed = true;
  }
  if (!changed) return value;
  return freezeValue(next);
}

function sameValue(a, b) {
  if (a === b) return true;
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => sameValue(a[key], b[key]));
}

function isPlainObject(candidate) {
  return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
}

export function freezeValue(value) {
  if (Array.isArray(value.pending) && !Object.isFrozen(value.pending)) {
    value.pending = [...value.pending];
  }
  Object.freeze(value);
  Object.freeze(value.review);
  Object.freeze(value.viewport);
  Object.freeze(value.drawers);
  if (Array.isArray(value.pending)) Object.freeze(value.pending);
  return value;
}
