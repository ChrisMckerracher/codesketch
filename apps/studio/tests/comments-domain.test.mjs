import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeComments, prepareComment, transitionComment, commentPoll, ControlGrant } from '../src/direction/feedback/index.mjs';

const GEN = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const rich = (overrides = {}) => ({ id: 'c1', number: 1, seq: 1, text: 'needs work', rect: null,
  status: 'open', cursor: 0, artRevision: 0, at: '2026-01-01T00:00:00.000Z',
  acknowledgedAt: null, addressedAt: null, resolvedAt: null, visibleLayers: [], request: null, ...overrides });

const document = () => ({ version: 1, width: 1000, height: 700, background: '#f7f3e8', marks: [], layers: [
  { id: 'paint', name: 'Painting', visible: true, opacity: 1 },
  { id: 'hidden', name: 'Hidden', visible: false, opacity: 1 },
  { id: 'faint', name: 'Faint', visible: true, opacity: 0 },
  { id: 'sketch', name: 'Sketch', visible: true, opacity: 0.5 } ] });

const context = (overrides = {}) => ({ docGeneration: GEN, artRevision: 7, cursor: 12, document: document(), ...overrides });

const input = (overrides = {}) => ({ requestId: 'req-1', text: '  check the sky  ',
  rect: { x: 10, y: 20, width: 30, height: 40 }, continuePlayback: false,
  expectedDocGeneration: GEN, expectedArtRevision: 7, ...overrides });

test('legacy nullable comment metadata is rejected', () => {
  assert.throws(() => normalizeComments([rich({ artRevision: null })]), /artRevision/);
  assert.throws(() => normalizeComments([rich({ visibleLayers: null })]), /visible layers/);
  assert.deepEqual(normalizeComments([rich({ visibleLayers: [] })])[0].visibleLayers, []);
});

test('normalizeComments validates the rich schema and rejects malformed sets', () => {
  const comments = normalizeComments([rich({ number: 5, seq: 9, visibleLayers:
    [{ id: 'paint', opacity: 1 }, { id: 'sketch', opacity: 0.25 }] })]);
  assert.equal(comments[0].number, 5);
  assert.throws(() => normalizeComments('nope'), /comment list/);
  assert.throws(() => normalizeComments([rich({ text: '   ' })]), /comment text/);
  assert.throws(() => normalizeComments([rich({ status: 'closed' })]), /status/);
  assert.throws(() => normalizeComments([rich({ cursor: 3001 })]), /cursor/);
  assert.throws(() => normalizeComments([rich({ cursor: 1.5 })]), /cursor/);
  assert.throws(() => normalizeComments([rich({ artRevision: -1 })]), /artRevision/);
  assert.throws(() => normalizeComments([rich(), rich()]), /Duplicate comment id/);
  assert.throws(() => normalizeComments([rich(), rich({ id: 'c2' })]), /Duplicate comment number/);
  assert.throws(() => normalizeComments([rich(), rich({ id: 'c2', number: 2 })]), /Duplicate comment seq/);
});

test('comment rects must be integer regions inside the 1000x700 canvas', () => {
  assert.deepEqual(normalizeComments([rich({ rect: { x: 0, y: 0, width: 1000, height: 700 } })])[0].rect,
    { x: 0, y: 0, width: 1000, height: 700 });
  assert.throws(() => normalizeComments([rich({ rect: { x: -1, y: 0, width: 10, height: 10 } })]), /rect x/);
  assert.throws(() => normalizeComments([rich({ rect: { x: 1.5, y: 0, width: 10, height: 10 } })]), /rect x/);
  assert.throws(() => normalizeComments([rich({ rect: { x: 0, y: 0, width: 0, height: 10 } })]), /rect width/);
  assert.throws(() => normalizeComments([rich({ rect: { x: 990, y: 0, width: 20, height: 10 } })]), /exceeds/);
  assert.throws(() => normalizeComments([rich({ rect: 'corner' })]), /rect/);
});

test('visible layers keep order, need unique ids and opacity in (0,1]', () => {
  const layers = [{ id: 'b', opacity: 0.25 }, { id: 'a', opacity: 1 }];
  assert.deepEqual(normalizeComments([rich({ visibleLayers: layers })])[0].visibleLayers, layers);
  assert.throws(() => normalizeComments([rich({ visibleLayers: [{ id: 'a', opacity: 0 }] })]), /opacity/);
  assert.throws(() => normalizeComments([rich({ visibleLayers: [{ id: 'a', opacity: 1.5 }] })]), /opacity/);
  assert.throws(() => normalizeComments([rich({ visibleLayers:
    [{ id: 'a', opacity: 1 }, { id: 'a', opacity: 0.5 }] })]), /Duplicate visible layer/);
});

test('stored request metadata is validated and request ids stay unique per set', () => {
  assert.deepEqual(normalizeComments([rich({ request: { id: 'req-9', fingerprint: '{"text":"hi"}' } })])[0].request,
    { id: 'req-9', fingerprint: '{"text":"hi"}' });
  assert.throws(() => normalizeComments([rich({ request: { id: '  ', fingerprint: 'x' } })]), /request id/);
  assert.throws(() => normalizeComments([rich({ request: { id: 'req-9' } })]), /fingerprint/);
  assert.throws(() => normalizeComments([rich({ request: { id: 'req-9', fingerprint: 'a' } }),
    rich({ id: 'c2', number: 2, seq: 2, request: { id: 'req-9', fingerprint: 'b' } })]), /Duplicate request id/);
});

test('comment sets are capped at 100 items', () => {
  const items = Array.from({ length: 101 }, (_, i) => rich({ id: `c${i}`, number: i + 1, seq: i + 1 }));
  assert.throws(() => normalizeComments(items), /At most 100/);
});

test('prepareComment appends a normalized open comment with server-side visible layers', () => {
  const base = normalizeComments([rich({ id: 'c0', number: 3, seq: 5 })]);
  const { comments, item, duplicate } = prepareComment(base, input(), context());
  assert.equal(duplicate, false);
  assert.equal(comments.length, 2);
  assert.equal(comments, base.length ? comments : null);
  assert.deepEqual(item, {
    id: item.id, number: 4, seq: 6, text: 'check the sky',
    rect: { x: 10, y: 20, width: 30, height: 40 },
    status: 'open', cursor: 12, artRevision: 7, at: item.at,
    acknowledgedAt: null, addressedAt: null, resolvedAt: null,
    visibleLayers: [{ id: 'paint', opacity: 1 }, { id: 'sketch', opacity: 0.5 }],
    request: { id: 'req-1', fingerprint: item.request.fingerprint } });
  assert.equal(item.at, new Date(item.at).toISOString());
});

test('prepareComment builds a deterministic fingerprint covering the captured context', () => {
  const base = normalizeComments([rich({ id: 'c0', number: 3, seq: 5 })]);
  const first = prepareComment(base, input(), context());
  const second = prepareComment(base, input(), context());
  assert.equal(first.item.request.fingerprint, second.item.request.fingerprint);
  const omitted = prepareComment(base, input({ continuePlayback: undefined }), context());
  assert.equal(omitted.item.request.fingerprint, first.item.request.fingerprint);
  const sameArt = prepareComment(base, input({ continuePlayback: undefined, expectedArtRevision: 7 }), context());
  assert.equal(sameArt.item.request.fingerprint, first.item.request.fingerprint);
});

test('prepareComment never mutates its inputs', () => {
  const base = normalizeComments([rich({ id: 'c0', number: 1, seq: 1 })]);
  const baseSnapshot = structuredClone(base);
  const ctx = context();
  const ctxSnapshot = structuredClone(ctx);
  const request = input();
  const requestSnapshot = structuredClone(request);
  prepareComment(base, request, ctx);
  assert.deepEqual(base, baseSnapshot);
  assert.deepEqual(ctx, ctxSnapshot);
  assert.deepEqual(request, requestSnapshot);
});

test('a repeated request id dedupes after the generation check but before the art check', () => {
  const base = normalizeComments([rich({ id: 'c0', number: 1, seq: 1 })]);
  const first = prepareComment(base, input(), context());
  const retry = prepareComment(first.comments, input(), context({ artRevision: 8 }));
  assert.equal(retry.duplicate, true);
  assert.deepEqual(retry.comments, first.comments);
  assert.deepEqual(retry.item, first.item);
  assert.throws(() => prepareComment(first.comments, input(), context({ docGeneration: 'next-generation' })),
    error => error.statusCode === 409);
});

test('a repeated request id with a changed payload is a 409 conflict', () => {
  const base = normalizeComments([rich({ id: 'c0', number: 1, seq: 1 })]);
  const first = prepareComment(base, input(), context());
  assert.throws(() => prepareComment(first.comments, input({ text: 'changed text' }), context()),
    error => error.statusCode === 409);
  assert.throws(() => prepareComment(first.comments, input({ rect: null }), context()),
    error => error.statusCode === 409);
  assert.throws(() => prepareComment(first.comments, input({ continuePlayback: true }), context()),
    error => error.statusCode === 409);
  assert.throws(() => prepareComment(first.comments, input({ expectedArtRevision: 8 }), context({ artRevision: 8 })),
    error => error.statusCode === 409);
});

test('new requests must match the current generation and art revision', () => {
  const base = normalizeComments([]);
  assert.throws(() => prepareComment(base, input({ expectedDocGeneration: 'next-generation' }), context()),
    error => error.statusCode === 409);
  assert.throws(() => prepareComment(base, input({ expectedDocGeneration: undefined }), context()),
    error => error.statusCode === 409);
  assert.throws(() => prepareComment(base, input({ expectedArtRevision: 6 }), context()),
    error => error.statusCode === 409);
});

test('prepareComment rejects a 101st comment', () => {
  const base = normalizeComments(Array.from({ length: 100 }, (_, i) =>
    rich({ id: `c${i}`, number: i + 1, seq: i + 1 })));
  assert.throws(() => prepareComment(base, input(), context()), /At most 100/);
});

test('comments move ack -> address -> resolve with fresh seq and timestamps', () => {
  const base = normalizeComments([rich({ id: 'c1', number: 1, seq: 2 })]);
  const acked = transitionComment(base, { id: 'c1', action: 'ack', expectedSeq: 2 });
  assert.equal(acked.item.status, 'acknowledged');
  assert.equal(acked.item.seq, 3);
  assert.ok(acked.item.acknowledgedAt);
  assert.equal(acked.item.addressedAt, null);
  const addressed = transitionComment(acked.comments, { id: 'c1', action: 'address', expectedSeq: 3 });
  assert.equal(addressed.item.status, 'addressed');
  assert.equal(addressed.item.seq, 4);
  assert.ok(addressed.item.addressedAt);
  const resolved = transitionComment(addressed.comments, { id: 'c1', action: 'resolve', expectedSeq: 4 });
  assert.equal(resolved.item.status, 'resolved');
  assert.equal(resolved.item.seq, 5);
  assert.ok(resolved.item.resolvedAt);
  const reopened = transitionComment(resolved.comments, { id: 'c1', action: 'reopen', expectedSeq: 5 });
  assert.equal(reopened.item.status, 'open');
  assert.equal(reopened.item.seq, 6);
  assert.deepEqual([reopened.item.acknowledgedAt, reopened.item.addressedAt, reopened.item.resolvedAt],
    [null, null, null]);
});

test('repeated same-state actions are idempotent when the seq matches', () => {
  const base = normalizeComments([rich({ id: 'c1', number: 1, seq: 2, status: 'acknowledged',
    acknowledgedAt: '2026-01-02T00:00:00.000Z' })]);
  const repeat = transitionComment(base, { id: 'c1', action: 'ack', expectedSeq: 2 });
  assert.deepEqual(repeat, { comments: base, item: base[0] });
  const again = transitionComment(repeat.comments, { id: 'c1', action: 'ack', expectedSeq: 2 });
  assert.equal(again.item.seq, 2);
  const open = normalizeComments([rich({ id: 'c2', number: 1, seq: 4 })]);
  const reopenRepeat = transitionComment(open, { id: 'c2', action: 'reopen', expectedSeq: 4 });
  assert.deepEqual(reopenRepeat, { comments: open, item: open[0] });
});

test('stale seqs, unknown ids and invalid transitions fail loudly', () => {
  const base = normalizeComments([rich({ id: 'c1', number: 1, seq: 2 })]);
  assert.throws(() => transitionComment(base, { id: 'c1', action: 'ack', expectedSeq: 1 }),
    error => error.statusCode === 409);
  assert.throws(() => transitionComment(base, { id: 'ghost', action: 'ack', expectedSeq: 2 }),
    error => error.statusCode === 404);
  assert.throws(() => transitionComment(base, { id: 'c1', action: 'resolve', expectedSeq: 2 }),
    error => error.statusCode === 409);
  assert.throws(() => transitionComment(base, { id: 'c1', action: 'shred', expectedSeq: 2 }),
    /Unknown comment action/);
});

test('transitions never mutate the source comments and bump seq past every item', () => {
  const base = normalizeComments([rich({ id: 'c1', number: 1, seq: 2 }), rich({ id: 'c2', number: 2, seq: 9 })]);
  const snapshot = structuredClone(base);
  const { comments, item } = transitionComment(base, { id: 'c2', action: 'ack', expectedSeq: 9 });
  assert.deepEqual(base, snapshot);
  assert.equal(item.seq, 10);
  assert.equal(comments.find(entry => entry.id === 'c1').seq, 2);
});

test('polling without a cursor returns everything with reset', () => {
  const base = normalizeComments([rich({ id: 'c1', number: 1, seq: 2 }), rich({ id: 'c2', number: 2, seq: 5 })]);
  const result = commentPoll(base, null, 'session-1', GEN);
  assert.equal(result.reset, true);
  assert.deepEqual(result.comments, base);
  assert.equal(result.cursor, JSON.stringify(['session-1', GEN, 5]));
});

test('an empty set polls cleanly', () => {
  const result = commentPoll([], null, 'session-1', GEN);
  assert.deepEqual(result, { cursor: JSON.stringify(['session-1', GEN, 0]), comments: [], reset: true });
  const next = commentPoll([], result.cursor, 'session-1', GEN);
  assert.deepEqual(next, { cursor: result.cursor, comments: [], reset: false });
});

test('a matching cursor returns only later comments and keeps reset false', () => {
  const base = normalizeComments([rich({ id: 'c1', number: 1, seq: 2 }), rich({ id: 'c2', number: 2, seq: 5 })]);
  const first = commentPoll(base, null, 'session-1', GEN);
  const unchanged = commentPoll(base, first.cursor, 'session-1', GEN);
  assert.deepEqual(unchanged, { cursor: first.cursor, comments: [], reset: false });
  const grown = normalizeComments([...base, rich({ id: 'c3', number: 3, seq: 8 })]);
  const later = commentPoll(grown, first.cursor, 'session-1', GEN);
  assert.deepEqual(later.comments.map(item => item.id), ['c3']);
  assert.equal(later.reset, false);
  assert.equal(later.cursor, JSON.stringify(['session-1', GEN, 8]));
});

test('mismatched instance, generation, ahead seq or malformed cursors reset the full list', () => {
  const base = normalizeComments([rich({ id: 'c1', number: 1, seq: 2 })]);
  const cursor = commentPoll(base, null, 'session-1', GEN).cursor;
  assert.equal(commentPoll(base, cursor, 'session-2', GEN).reset, true);
  assert.equal(commentPoll(base, cursor, 'session-1', 'other-generation').reset, true);
  assert.equal(commentPoll(base, JSON.stringify(['session-1', GEN, 9]), 'session-1', GEN).reset, true);
  assert.equal(commentPoll(base, 'not-json', 'session-1', GEN).reset, true);
  assert.equal(commentPoll(base, '["session-1",3,2]', 'session-1', GEN).reset, true);
  assert.equal(commentPoll(base, '["session-1","",2]', 'session-1', GEN).reset, true);
  assert.equal(commentPoll(base, '["session-1",3]', 'session-1', GEN).reset, true);
  const match = commentPoll(base, JSON.stringify(['session-1', GEN, 2]), 'session-1', GEN);
  assert.deepEqual(match, { cursor, comments: [], reset: false });
});

test('ControlGrant docGeneration drives prepareComment and polling end to end', () => {
  const grant = new ControlGrant();
  const live = context({ docGeneration: grant.docGeneration });
  const first = prepareComment([], input({ expectedDocGeneration: grant.docGeneration,
    requestId: 'grant-req-1' }), live);
  assert.equal(first.duplicate, false);
  const poll = commentPoll(first.comments, null, 'session-1', grant.docGeneration);
  assert.deepEqual(poll.comments.map(item => item.id), [first.item.id]);
  assert.equal(poll.cursor, JSON.stringify(['session-1', grant.docGeneration, first.item.seq]));
  const again = commentPoll(first.comments, poll.cursor, 'session-1', grant.docGeneration);
  assert.deepEqual(again.comments, []);
  assert.equal(again.reset, false);
  const settled = prepareComment(first.comments, input({ expectedDocGeneration: grant.docGeneration,
    requestId: 'grant-req-1' }), context({ docGeneration: grant.docGeneration, artRevision: 9 }));
  assert.equal(settled.duplicate, true);
  grant.reset();
  assert.notEqual(grant.docGeneration, live.docGeneration);
  assert.throws(() => prepareComment(first.comments,
    input({ expectedDocGeneration: live.docGeneration, requestId: 'grant-req-1' }),
    context({ docGeneration: grant.docGeneration })), error => error.statusCode === 409);
  const resetPoll = commentPoll(first.comments, poll.cursor, 'session-1', grant.docGeneration);
  assert.equal(resetPoll.reset, true);
  assert.deepEqual(resetPoll.comments, first.comments);
});
