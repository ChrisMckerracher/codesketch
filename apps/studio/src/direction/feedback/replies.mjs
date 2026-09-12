import { label } from '../../painting/index.mjs';
import { normalizeComments, conflict, notFound, integer,
  MAX_REPLIES, REPLY_AUTHORS, validateText } from './schema.mjs';

const REPLY_INPUT_FIELDS = new Set([
  'id', 'requestId', 'text', 'source', 'expectedDocGeneration', 'expectedSeq',
]);

function nextSeq(items) {
  return items.reduce((max, current) => Math.max(max, current.seq), 0) + 1;
}

export function prepareReply(comments, input, docGeneration) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a reply request');
  const fields = Object.keys(input);
  if (fields.length !== REPLY_INPUT_FIELDS.size || fields.some(field => !REPLY_INPUT_FIELDS.has(field))) {
    throw new Error('Reply request must contain id, requestId, text, source, expectedDocGeneration, and expectedSeq');
  }
  if (!REPLY_AUTHORS.has(input.source)) throw new Error('Reply author must be human or agent');
  const text = validateText(input.text, 'reply text');
  const mark = label(input.requestId, 'reply request id', 80);
  const commentId = label(input.id, 'comment id', 80);
  const generation = label(docGeneration, 'context docGeneration', 80);
  if (input.expectedDocGeneration !== generation) {
    throw conflict('Document generation moved on; refresh and resubmit');
  }
  const expectedSeq = integer(input.expectedSeq, 'expectedSeq', 1);
  const items = normalizeComments(comments);
  const index = items.findIndex(item => item.id === commentId);
  if (index === -1) throw notFound(`Unknown comment ${commentId}`);
  const item = items[index];
  const replies = item.replies ?? [];
  let existing = null;
  let existingComment = null;
  for (const candidate of items) {
    existing = candidate.replies?.find(reply => reply.requestId === mark) ?? null;
    if (existing) {
      existingComment = candidate;
      break;
    }
  }
  if (existing) {
    if (existingComment.id !== commentId || existing.author !== input.source || existing.text !== text) {
      throw conflict('A different reply already used this request id');
    }
    return { comments: items, reply: existing, comment: item, duplicate: true };
  }
  if (item.seq !== expectedSeq) throw conflict('Stale comment seq; reload and retry');
  if (replies.length >= MAX_REPLIES) throw new Error(`At most ${MAX_REPLIES} replies are allowed per comment`);
  const reply = {
    id: globalThis.crypto.randomUUID(),
    requestId: mark,
    author: input.source,
    text,
    at: new Date().toISOString(),
  };
  const updated = { ...item, seq: nextSeq(items), replies: [...replies, reply] };
  const next = normalizeComments(items.map((current, i) => (i === index ? updated : current)));
  return { comments: next, reply: next[index].replies[next[index].replies.length - 1],
    comment: next[index], duplicate: false };
}
