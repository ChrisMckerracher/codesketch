import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/direction/session.mjs';
import { normalizeComments, validateReplies, prepareReply, MAX_REPLIES } from '../src/direction/feedback/index.mjs';

const GEN = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const RAW_COMMENT = '  fix this stroke\nKeep the edge  ';
const RAW_REPLY = '  corrected the sky\nLeave the whitespace  ';
const stroke = (x, y) => ({ type: 'stroke', points: [[x, y], [x + 8, y + 8], [x + 16, y + 4]] });
const conflict = (fn) => assert.throws(fn, (error) => {
  assert.equal(error.statusCode, 409);
  return true;
});
const rich = (overrides = {}) => ({ id: 'c1', number: 1, seq: 1, text: 'needs work', rect: null,
  status: 'open', cursor: 0, artRevision: 0, at: '2026-01-01T00:00:00.000Z',
  acknowledgedAt: null, addressedAt: null, resolvedAt: null, visibleLayers: [], request: null, ...overrides });
const reply = (overrides = {}) => ({ id: 'r1', requestId: 'rr-1', author: 'agent',
  text: RAW_REPLY, at: '2026-01-02T00:00:00.000Z', ...overrides });
const context = (session) => ({ expectedDocGeneration: session.controlGrant.docGeneration,
  epoch: session.controlGrant.controlEpoch });
const commentInput = (session, overrides = {}) => ({
  text: RAW_COMMENT, rect: null, requestId: 'req-1',
  expectedDocGeneration: session.controlGrant.docGeneration,
  expectedArtRevision: session.artRevision, expectedControlEpoch: session.controlGrant.controlEpoch,
  ...overrides });
const replyInput = (session, overrides = {}) => ({
  id: session.comments[0].id, requestId: 'rr-1', text: RAW_REPLY, source: 'agent',
  expectedDocGeneration: session.controlGrant.docGeneration, expectedSeq: session.comments[0].seq,
  ...overrides });
const pausedWithComment = () => {
  const session = new Session();
  session.submit({ commands: [stroke(5, 5)], play: false, ...context(session) });
  session.addComment(commentInput(session));
  return session;
};

describe('reply schema validation', () => {
  test('absence of replies is preserved and provided arrays are normalized', () => {
    const bare = normalizeComments([rich()]);
    assert.equal(Object.hasOwn(bare[0], 'replies'), false, 'no replies key without messages');
    const listed = normalizeComments([rich({ replies: [reply()] })]);
    assert.deepEqual(listed[0].replies, [reply()]);
    assert.deepEqual(normalizeComments([rich({ replies: [] })])[0].replies, []);
  });

  test('raw text keeps whitespace while length is measured in UTF-16 units', () => {
    const text = ` ${'\u{1f600}'.repeat(999)} `;
    assert.equal(normalizeComments([rich({ text })])[0].text, text);
    assert.equal(validateReplies([reply({ text })])[0].text, text);
    assert.throws(() => normalizeComments([rich({ text: `${text}x` })]), /comment text/);
    assert.throws(() => validateReplies([reply({ text: `${text}x` })]), /reply text/);
  });

  test('reply validation keeps copies, never the provided array', () => {
    const source = [reply()];
    const validated = validateReplies(source)[0];
    assert.notEqual(validated, source[0]);
    source[0].text = 'tampered';
    const normalized = normalizeComments([rich({ replies: [reply()] })]);
    assert.equal(normalized[0].replies[0].text, RAW_REPLY);
    assert.notEqual(normalized[0].replies[0], source[0]);
  });

  test('malformed reply shapes, authors, duplicates and caps are rejected', () => {
    const withReplies = (replies) => normalizeComments([rich({ replies })]);
    for (const bad of [null, 'messages', {}, [null], [reply({ id: '' })], [reply({ id: 7 })],
      [reply({ author: 'robot' })], [reply({ author: undefined })], [reply({ text: '   ' })],
      [reply({ text: 'x'.repeat(2001) })], [reply({ at: null })], [reply({ requestId: null })],
      [reply({ requestId: '  ' })], [reply({ extra: true })],
      [reply(), reply({ id: 'r2' })],
      Array.from({ length: MAX_REPLIES + 1 }, (_, i) => reply({ id: `r${i}`, requestId: `q${i}` }))]) {
      assert.throws(() => withReplies(bad), error => error.statusCode === undefined,
        `expected rejection for ${JSON.stringify(bad)}`);
    }
    assert.throws(() => normalizeComments([rich({ replies: [reply()] }),
      rich({ id: 'c2', number: 2, seq: 2, replies: [reply()] })]), /Duplicate reply id/);
    assert.throws(() => normalizeComments([rich({ replies: [reply()] }),
      rich({ id: 'c2', number: 2, seq: 2, replies: [reply({ id: 'r2' })] })]),
      /Duplicate reply request id/);
  });
});

describe('prepareReply domain', () => {
  test('appends a reply, advances the comment seq with the global next seq, and never mutates inputs', () => {
    const base = normalizeComments([rich({ id: 'c1', number: 1, seq: 2 }),
      rich({ id: 'c2', number: 2, seq: 9 })]);
    const snapshot = structuredClone(base);
    const input = { id: 'c1', requestId: 'rr-1', text: RAW_REPLY, source: 'agent',
      expectedDocGeneration: GEN, expectedSeq: 2 };
    const prepared = prepareReply(base, input, GEN);
    assert.equal(prepared.duplicate, false);
    assert.equal(prepared.comment.seq, 10, 'the target comment takes the global next seq');
    assert.deepEqual(prepared.comment.replies, [{ id: prepared.reply.id, requestId: 'rr-1',
      author: 'agent', text: RAW_REPLY, at: prepared.reply.at }]);
    assert.equal(prepared.comments.find(item => item.id === 'c2').seq, 9, 'other comments stay put');
    assert.deepEqual(base, snapshot);
    assert.equal(prepared.reply.at, new Date(prepared.reply.at).toISOString());
    assert.deepEqual(Object.keys(prepared.reply), ['id', 'requestId', 'author', 'text', 'at']);
  });

  test('identical requestId retries stay idempotent even after the seq advances', () => {
    const base = normalizeComments([rich()]);
    const first = prepareReply(base, { id: 'c1', requestId: 'rr-1', text: 'corrected', source: 'agent',
      expectedDocGeneration: GEN, expectedSeq: 1 }, GEN);
    const retry = prepareReply(first.comments, { id: 'c1', requestId: 'rr-1', text: 'corrected',
      source: 'agent', expectedDocGeneration: GEN, expectedSeq: first.comment.seq }, GEN);
    assert.equal(retry.duplicate, true);
    assert.deepEqual(retry.reply, first.reply);
    assert.deepEqual(retry.comments, first.comments);
    const stale = prepareReply(first.comments, { id: 'c1', requestId: 'rr-1', text: 'corrected',
      source: 'agent', expectedDocGeneration: GEN, expectedSeq: 1 }, GEN);
    assert.equal(stale.duplicate, true, 'dedup precedes the seq guard');
  });

  test('reused request ids, stale guards and unknown targets fail loudly', () => {
    const base = normalizeComments([rich()]);
    const first = prepareReply(base, { id: 'c1', requestId: 'rr-1', text: 'corrected', source: 'agent',
      expectedDocGeneration: GEN, expectedSeq: 1 }, GEN);
    conflict(() => prepareReply(first.comments, { id: 'c1', requestId: 'rr-1', text: 'changed',
      source: 'agent', expectedDocGeneration: GEN, expectedSeq: first.comment.seq }, GEN));
    conflict(() => prepareReply(first.comments, { id: 'c1', requestId: 'rr-1', text: 'corrected',
      source: 'human', expectedDocGeneration: GEN, expectedSeq: first.comment.seq }, GEN));
    conflict(() => prepareReply(first.comments, { id: 'c1', requestId: 'rr-2', text: 'corrected',
      source: 'agent', expectedDocGeneration: GEN, expectedSeq: 1 }, GEN));
    conflict(() => prepareReply(first.comments, { id: 'c1', requestId: 'rr-2', text: 'corrected',
      source: 'agent', expectedDocGeneration: 'next-generation', expectedSeq: first.comment.seq }, GEN));
    assert.throws(() => prepareReply(first.comments, { id: 'c1', requestId: 'rr-2', text: 'x',
      source: 'ghost', expectedDocGeneration: GEN, expectedSeq: 1 }, GEN), /Reply author/);
    assert.throws(() => prepareReply(first.comments, { id: 'ghost', requestId: 'rr-2', text: 'x',
      source: 'agent', expectedDocGeneration: GEN, expectedSeq: 1 }, GEN), error => error.statusCode === 404);
    assert.throws(() => prepareReply(first.comments, { id: '', requestId: 'rr-2', text: 'x',
      source: 'agent', expectedDocGeneration: GEN, expectedSeq: 1 }, GEN), /comment id/);
  });

  test('a 33rd reply is rejected before mutation', () => {
    const replies = Array.from({ length: MAX_REPLIES }, (_, i) => reply({ id: `r${i}`, requestId: `q${i}` }));
    const full = normalizeComments([rich({ seq: 7, replies })]);
    const snapshot = structuredClone(full);
    assert.throws(() => prepareReply(full, { id: 'c1', requestId: 'rr-x', text: 'one too many',
      source: 'agent', expectedDocGeneration: GEN, expectedSeq: 7 }, GEN), /At most 32 replies/);
    assert.deepEqual(full, snapshot);
  });
});

describe('session replies integration', () => {
  test('replying changes only the comment set and the session revision', () => {
    const session = pausedWithComment();
    session.control('resume', 1, { source: 'human' });
    session.tick(40);
    assert.ok(session.active, 'a partial stroke is in flight');
    const before = {
      artRevision: session.artRevision, status: session.status, queue: session.queue,
      active: structuredClone(session.active), grant: session.controlGrant.snapshot(),
    };
    let emissions = 0;
    session.onChange = () => emissions++;
    const revision = session.revision;
    const stored = session.replyComment(replyInput(session));
    assert.equal(emissions, 1);
    assert.equal(session.revision, revision + 1);
    assert.equal(session.artRevision, before.artRevision, 'artwork revision never moves');
    assert.equal(session.status, before.status, 'playback status is untouched');
    assert.deepEqual(session.queue, before.queue);
    assert.deepEqual(session.active, before.active, 'active progress is untouched');
    assert.deepEqual(session.controlGrant.snapshot(), before.grant, 'grants and epochs are untouched');
    assert.equal(session.comments[0].replies.length, 1);
    assert.deepEqual(session.comments[0].replies[0], stored);
    const duplicate = session.replyComment(replyInput(session));
    assert.deepEqual(duplicate, stored);
    assert.equal(emissions, 1, 'duplicate replies never notify');
    assert.equal(session.revision, revision + 1);
  });

  test('a reply during playback communicates without pausing or invalidating grants', () => {
    const session = pausedWithComment();
    session.control('resume', 1, { source: 'human' });
    const grant = session.controlGrant.snapshot();
    assert.ok(grant.activeGrant, 'human resume issued a continuation grant');
    session.tick(40);
    session.replyComment(replyInput(session, { source: 'human', requestId: 'rr-human' }));
    assert.equal(session.status, 'playing');
    assert.deepEqual(session.controlGrant.snapshot(), grant);
    assert.equal(session.comments[0].replies[0].author, 'human');
  });

  test('stale generation and seq guards reject atomically before any mutation', () => {
    const session = pausedWithComment();
    const first = session.replyComment(replyInput(session));
    const snapshot = structuredClone(session.comments);
    const revision = session.revision;
    let emissions = 0;
    session.onChange = () => emissions++;
    conflict(() => session.replyComment(replyInput(session, {
      requestId: 'rr-2', expectedDocGeneration: 'stale-generation' })));
    conflict(() => session.replyComment(replyInput(session, { requestId: 'rr-3', expectedSeq: 1 })));
    assert.throws(() => session.replyComment(replyInput(session, { id: 'ghost', requestId: 'rr-4' })),
      error => error.statusCode === 404);
    assert.throws(() => session.replyComment(replyInput(session, { requestId: 'rr-5', text: '' })), /reply text/);
    assert.deepEqual(session.comments, snapshot);
    assert.equal(session.revision, revision);
    assert.equal(emissions, 0);
    assert.equal(first.seq, undefined, 'replies are messages, not comments');
  });

  test('replies ride poll deltas through the advanced comment seq', () => {
    const session = pausedWithComment();
    const baseline = session.pollComments(null);
    assert.deepEqual(baseline.comments[0].replies, undefined);
    session.replyComment(replyInput(session));
    const delta = session.pollComments(baseline.cursor);
    assert.equal(delta.reset, false);
    assert.deepEqual(delta.comments.map(item => item.id), [session.comments[0].id]);
    assert.equal(delta.comments[0].replies.length, 1);
    const settled = session.pollComments(delta.cursor);
    assert.deepEqual(settled.comments, []);
    assert.equal(settled.reset, false);
    assert.equal(JSON.parse(delta.cursor)[2], session.comments[0].seq, 'the cursor tracks the new seq');
  });

  test('replies survive project save/load and recovery without adapters', () => {
    const session = pausedWithComment();
    session.replyComment(replyInput(session));
    session.replyComment(replyInput(session, { requestId: 'rr-2', text: 'again', source: 'human',
      expectedSeq: session.comments[0].seq }));
    const replies = structuredClone(session.comments[0].replies);
    const project = session.project();
    assert.equal(project.comments[0].text, RAW_COMMENT);
    assert.deepEqual(project.comments[0].replies, replies);
    const loaded = new Session();
    loaded.load(project, { source: 'human' });
    assert.equal(loaded.comments[0].text, RAW_COMMENT);
    assert.deepEqual(loaded.comments[0].replies, replies, 'load preserves reply request ids');
    const recovered = new Session();
    recovered.restoreRecovery(session.recovery());
    assert.equal(recovered.comments[0].text, RAW_COMMENT);
    assert.deepEqual(recovered.comments[0].replies, replies);
    const validated = normalizeComments(project.comments);
    assert.deepEqual(validated[0].replies, replies);
  });

  test('reply capacity failures leave the session untouched', () => {
    const session = pausedWithComment();
    for (let i = 0; i < MAX_REPLIES; i++) {
      session.replyComment(replyInput(session, { requestId: `rr-${i}`, text: `note ${i}`,
        expectedSeq: session.comments[0].seq }));
    }
    assert.equal(session.comments[0].replies.length, MAX_REPLIES);
    const snapshot = structuredClone(session.comments);
    const revision = session.revision;
    const grant = session.controlGrant.snapshot();
    assert.throws(() => session.replyComment(replyInput(session, { requestId: 'rr-over',
      text: 'one too many', expectedSeq: session.comments[0].seq })), /At most 32 replies/);
    assert.deepEqual(session.comments, snapshot);
    assert.equal(session.revision, revision);
    assert.deepEqual(session.controlGrant.snapshot(), grant);
  });
});
