import { label, number, LIMITS } from '../../painting/index.mjs';

export const MAX_COMMENTS = 100;
export const TEXT_MAX = 2000;
export const CURSOR_MAX = 3000;
export const CANVAS_WIDTH = 1000;
export const CANVAS_HEIGHT = 700;
export const FINGERPRINT_MAX = 8192;

const STATUSES = new Set(['open', 'acknowledged', 'addressed', 'resolved']);
const STAMP_MAX = 40;
const SAFE_MAX = Number.MAX_SAFE_INTEGER;

export function conflict(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

export function notFound(message) {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}

export function integer(value, name, min, max = SAFE_MAX) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export function validateRect(value) {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Comment rect must be null or a canvas region');
  }
  const x = integer(value.x, 'rect x', 0, CANVAS_WIDTH);
  const y = integer(value.y, 'rect y', 0, CANVAS_HEIGHT);
  const width = integer(value.width, 'rect width', 1, CANVAS_WIDTH);
  const height = integer(value.height, 'rect height', 1, CANVAS_HEIGHT);
  if (x + width > CANVAS_WIDTH || y + height > CANVAS_HEIGHT) throw new Error('Comment rect exceeds the canvas');
  return { x, y, width, height };
}

function stamp(value, name, required = false) {
  if (value === null && !required) return null;
  return label(value, name, STAMP_MAX);
}

function validateVisibleLayers(value) {
  if (!Array.isArray(value) || value.length > LIMITS.layers) throw new Error('Comment visible layers must be a bounded list');
  const seen = new Set();
  return value.map(layer => {
    if (!layer || typeof layer !== 'object' || Array.isArray(layer)) throw new Error('Invalid visible layer');
    const id = label(layer.id, 'visible layer id', 80);
    if (seen.has(id)) throw new Error(`Duplicate visible layer ${id}`);
    seen.add(id);
    const opacity = number(layer.opacity, 'visible layer opacity', 0, 1);
    if (opacity <= 0) throw new Error('Visible layer opacity must be greater than 0');
    return { id, opacity };
  });
}

function validateRequest(value) {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid comment request metadata');
  return {
    id: label(value.id, 'request id', 80),
    fingerprint: label(value.fingerprint, 'request fingerprint', FINGERPRINT_MAX),
  };
}

export function assertComment(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Expected a comment object');
  if (!STATUSES.has(item.status)) throw new Error('Invalid comment status');
  return {
    id: label(item.id, 'comment id', 80),
    number: integer(item.number, 'comment number', 1),
    seq: integer(item.seq, 'comment seq', 1),
    text: label(item.text, 'comment text', TEXT_MAX),
    rect: validateRect(item.rect),
    status: item.status,
    cursor: integer(item.cursor, 'comment cursor', 0, CURSOR_MAX),
    artRevision: integer(item.artRevision, 'comment artRevision', 0),
    at: stamp(item.at, 'comment timestamp', true),
    acknowledgedAt: stamp(item.acknowledgedAt, 'acknowledgedAt'),
    addressedAt: stamp(item.addressedAt, 'addressedAt'),
    resolvedAt: stamp(item.resolvedAt, 'resolvedAt'),
    visibleLayers: validateVisibleLayers(item.visibleLayers),
    request: validateRequest(item.request),
  };
}

export function normalizeComments(items) {
  if (!Array.isArray(items)) throw new Error('Expected a comment list');
  if (items.length > MAX_COMMENTS) throw new Error(`At most ${MAX_COMMENTS} comments are allowed`);
  const ids = new Set();
  const numbers = new Set();
  const seqs = new Set();
  const marks = new Set();
  return items.map((item) => {
    const comment = assertComment(item);
    if (ids.has(comment.id)) throw new Error(`Duplicate comment id ${comment.id}`);
    if (numbers.has(comment.number)) throw new Error(`Duplicate comment number ${comment.number}`);
    if (seqs.has(comment.seq)) throw new Error(`Duplicate comment seq ${comment.seq}`);
    if (comment.request !== null) {
      if (marks.has(comment.request.id)) throw new Error(`Duplicate request id ${comment.request.id}`);
      marks.add(comment.request.id);
    }
    ids.add(comment.id);
    numbers.add(comment.number);
    seqs.add(comment.seq);
    return comment;
  });
}
