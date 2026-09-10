import { label, LIMITS } from '../../painting/index.mjs';
import { normalizeComments, validateRect, integer, conflict, notFound,
  TEXT_MAX, CURSOR_MAX } from './schema.mjs';

const TRANSITIONS = {
  ack: { from: 'open', to: 'acknowledged', stamp: 'acknowledgedAt' },
  address: { from: 'acknowledged', to: 'addressed', stamp: 'addressedAt' },
  resolve: { from: 'addressed', to: 'resolved', stamp: 'resolvedAt' },
};

function fingerprint(payload) {
  return JSON.stringify({ text: payload.text, rect: payload.rect,
    continuePlayback: payload.continuePlayback, expectedArtRevision: payload.expectedArtRevision });
}

function visibleLayersFrom(document) {
  if (!document || !Array.isArray(document.layers)) throw new Error('Comment context needs a document');
  if (document.layers.length > LIMITS.layers) throw new Error('Comment context has too many layers');
  return document.layers
    .filter(layer => layer && layer.visible === true && typeof layer.opacity === 'number' && layer.opacity > 0)
    .map(layer => ({ id: layer.id, opacity: layer.opacity }));
}

function nextSeq(items) {
  return items.reduce((max, current) => Math.max(max, current.seq), 0) + 1;
}

export function prepareComment(comments, input, context) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a comment request');
  if (!context || typeof context !== 'object') throw new Error('Expected a comment context');
  const items = normalizeComments(comments);
  const docGeneration = label(context.docGeneration, 'context docGeneration', 80);
  const artRevision = integer(context.artRevision, 'context artRevision', 0);
  const cursor = integer(context.cursor, 'context cursor', 0, CURSOR_MAX);
  const text = label(input.text, 'comment text', TEXT_MAX);
  const rect = validateRect(input.rect);
  if (input.continuePlayback !== undefined && typeof input.continuePlayback !== 'boolean') {
    throw new Error('continuePlayback must be boolean');
  }
  if (input.expectedDocGeneration !== docGeneration) {
    throw conflict('Document generation moved on; refresh and resubmit');
  }
  const payload = { text, rect, continuePlayback: input.continuePlayback === true,
    expectedArtRevision: input.expectedArtRevision ?? null };
  const mark = input.requestId === undefined || input.requestId === null
    ? null
    : label(input.requestId, 'request id', 80);
  if (mark !== null) {
    const existing = items.find(item => item.request !== null && item.request.id === mark);
    if (existing) {
      if (existing.request.fingerprint !== fingerprint(payload)) {
        throw conflict('A different payload already used this request id');
      }
      return { comments: items, item: existing, duplicate: true };
    }
  }
  if (input.expectedArtRevision !== artRevision) {
    throw conflict('Artwork revision moved on; refresh and resubmit');
  }
  const item = {
    id: globalThis.crypto.randomUUID(),
    number: items.reduce((max, current) => Math.max(max, current.number), 0) + 1,
    seq: nextSeq(items),
    text,
    rect,
    status: 'open',
    cursor,
    artRevision,
    at: new Date().toISOString(),
    acknowledgedAt: null,
    addressedAt: null,
    resolvedAt: null,
    visibleLayers: visibleLayersFrom(context.document),
    request: mark === null ? null : { id: mark, fingerprint: fingerprint(payload) },
  };
  const next = normalizeComments([...items, item]);
  return { comments: next, item: next[next.length - 1], duplicate: false };
}

export function transitionComment(comments, target) {
  if (!target || typeof target !== 'object') throw new Error('Expected a transition request');
  if (typeof target.id !== 'string' || !target.id.trim()) throw new Error('Expected a comment id');
  if (target.action !== 'reopen' && !TRANSITIONS[target.action]) {
    throw new Error(`Unknown comment action ${String(target.action)}`);
  }
  const expectedSeq = integer(target.expectedSeq, 'expectedSeq', 1);
  const items = normalizeComments(comments);
  const index = items.findIndex(item => item.id === target.id);
  if (index === -1) throw notFound(`Unknown comment ${target.id}`);
  const item = items[index];
  if (item.seq !== expectedSeq) throw conflict('Stale comment seq; reload and retry');
  const transition = TRANSITIONS[target.action];
  if (transition && item.status === transition.to) return { comments: items, item };
  if (target.action === 'reopen' && item.status === 'open') return { comments: items, item };
  if (transition && item.status !== transition.from) {
    throw conflict(`Cannot ${target.action} a comment in ${item.status} state`);
  }
  const updated = transition
    ? { ...item, seq: nextSeq(items), status: transition.to, [transition.stamp]: new Date().toISOString() }
    : { ...item, seq: nextSeq(items), status: 'open',
      acknowledgedAt: null, addressedAt: null, resolvedAt: null };
  const next = normalizeComments(items.map((current, i) => (i === index ? updated : current)));
  return { comments: next, item: next[index] };
}

function parseCursor(value) {
  if (typeof value !== 'string' || !value || value.length > 256) return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length !== 3) return null;
    const [id, generation, seq] = parsed;
    if (typeof id !== 'string' || !id || id.length > 80) return null;
    if (typeof generation !== 'string' || !generation || generation.length > 80) return null;
    if (!Number.isInteger(seq) || seq < 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function commentPoll(comments, since, instanceId, docGeneration) {
  if (typeof instanceId !== 'string' || !instanceId || instanceId.length > 80) {
    throw new Error('Expected a session instance id');
  }
  const generation = label(docGeneration, 'docGeneration', 80);
  const items = normalizeComments(comments);
  const maxSeq = items.reduce((max, current) => Math.max(max, current.seq), 0);
  const cursor = JSON.stringify([instanceId, generation, maxSeq]);
  const state = parseCursor(since);
  if (!state || state[0] !== instanceId || state[1] !== generation || state[2] > maxSeq) {
    return { cursor, comments: items, reset: true };
  }
  return { cursor, comments: items.filter(item => item.seq > state[2]), reset: false };
}
