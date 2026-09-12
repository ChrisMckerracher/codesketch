import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/direction/session.mjs';

const stroke = (x, y) => ({ type: 'stroke', points: [[x, y], [x + 8, y + 8], [x + 16, y + 4]] });
const conflict = (fn) => assert.throws(fn, (error) => {
  assert.equal(error.statusCode, 409);
  return true;
});
const pausedWithLayers = () => {
  const session = new Session();
  session.submit({ commands: [
    { type: 'layer.add', id: 'notes', name: 'Notes' },
    { type: 'layer.update', id: 'notes', opacity: 0.5 },
    stroke(5, 5),
  ], immediate: true, ...context(session) });
  return session;
};
const commentInput = (session, overrides = {}) => ({
  text: 'fix this stroke', rect: null, requestId: 'req-1',
  expectedDocGeneration: session.controlGrant.docGeneration,
  expectedArtRevision: session.artRevision, expectedControlEpoch: session.controlGrant.controlEpoch,
  ...overrides,
});

describe('session comments integration', () => {
  test('comment metadata records the visible composite, not just the active layer', () => {
    const session = pausedWithLayers();
    const item = session.addComment(commentInput(session));
    assert.deepEqual(item.visibleLayers, [
      { id: 'paint', opacity: 1 }, { id: 'notes', opacity: 0.5 },
    ]);
    assert.equal(item.status, 'open');
    assert.equal(item.number, 1);
    assert.equal(item.seq, 1);
    assert.equal(session.comments.length, 1);
  });

  test('hidden and zero-opacity layers are excluded from comment metadata', () => {
    const session = pausedWithLayers();
    session.submit({ commands: [
      { type: 'layer.update', id: 'notes', visible: false },
      { type: 'layer.update', id: 'paint', opacity: 0 },
    ], immediate: true, ...context(session) });
    const item = session.addComment(commentInput(session));
    assert.deepEqual(item.visibleLayers, []);
  });

  test('paused create then duplicate is entirely side-effect free', () => {
    const session = new Session();
    session.submit({ commands: [stroke(5, 5)], play: false, ...context(session) });
    let emissions = 0;
    session.onChange = () => emissions++;
    const before = session.controlGrant.snapshot();
    const input = commentInput(session);
    const item = session.addComment(input);
    assert.equal(emissions, 1);
    assert.equal(session.controlGrant.requiresGrant, true);
    const revisions = session.revision;
    const epochs = session.controlGrant.controlEpoch;
    const duplicate = session.addComment(input);
    assert.deepEqual(duplicate, item);
    assert.equal(session.comments.length, 1);
    assert.equal(session.revision, revisions, 'duplicate adds no revision');
    assert.equal(session.controlGrant.controlEpoch, epochs, 'duplicate bumps no epoch');
    assert.deepEqual(session.controlGrant.snapshot().activeGrant, before.activeGrant);
    assert.equal(emissions, 1, 'duplicate never notifies');
    conflict(() => session.submit({ commands: [stroke(9, 9)] }));
  });

  test('stale context after a visibility mutation is rejected with 409', () => {
    const session = pausedWithLayers();
    const staleGeneration = session.controlGrant.docGeneration;
    const staleArt = session.artRevision;
    session.submit({ commands: [{ type: 'layer.update', id: 'notes', visible: false }],
      immediate: true, ...context(session) });
    conflict(() => session.addComment(commentInput(session, { expectedArtRevision: staleArt })));
    session.controlGrant.reset();
    conflict(() => session.addComment(commentInput(session, { expectedDocGeneration: staleGeneration })));
    assert.equal(session.comments.length, 0, 'failed comments never mutate');
  });

  test('continuePlayback comment clears active and queue and authorizes once', () => {
    const session = pausedWithLayers();
    session.submit({ commands: [stroke(30, 30), stroke(60, 60)], ...context(session) });
    session.tick(40);
    assert.ok(session.active, 'partial stroke exists');
    session.control('pause', 1, { source: 'human' });
    const art = session.artRevision;
    const item = session.addComment(commentInput(session, { requestId: 'apply', continuePlayback: true }));
    assert.equal(item.request.id, 'apply');
    assert.equal(session.queue.length, 0);
    assert.equal(session.active, null);
    assert.equal(session.status, 'paused');
    assert.equal(session.controlGrant.controlEpoch, 2, 'authorize increments epoch exactly once');
    assert.ok(session.controlGrant.activeGrant, 'grant is authorized for the next batch');
    assert.equal(session.artRevision, art + 1, 'removed active emits an art revision');
    session.submit({ commands: [stroke(90, 90)], play: true, ...context(session),
      grantToken: session.controlGrant.activeGrant.grantToken });
    assert.equal(session.status, 'playing');
  });

  test('duplicate comment retry after playback resumed returns the original untouched', () => {
    const session = new Session();
    session.submit({ commands: [stroke(5, 5)], play: false, ...context(session) });
    const input = commentInput(session, { requestId: 'retry' });
    const item = session.addComment(input);
    session.control('resume', 1, { source: 'human' });
    assert.equal(session.status, 'playing');
    const revisions = session.revision;
    const epochs = session.controlGrant.controlEpoch;
    const count = session.comments.length;
    const retry = session.addComment(input);
    assert.deepEqual(retry, item);
    assert.equal(session.comments.length, count);
    assert.equal(session.revision, revisions);
    assert.equal(session.controlGrant.controlEpoch, epochs);
    assert.equal(session.status, 'playing', 'duplicate retry does not pause playback');
  });

  test('a later human pause cancels the grant and old batches fail with 409', () => {
    const session = pausedWithLayers();
    session.control('pause', 1, { source: 'human' });
    session.addComment(commentInput(session, { requestId: 'apply', continuePlayback: true }));
    const issued = session.controlGrant.activeGrant;
    const granted = { expectedDocGeneration: issued.docGeneration, epoch: issued.controlEpoch,
      grantToken: issued.grantToken };
    session.submit({ commands: [stroke(30, 30)], play: true, ...granted });
    session.control('pause', 1, { source: 'human' });
    conflict(() => session.submit({ commands: [stroke(60, 60)], play: true, ...granted }));
    assert.equal(session.status, 'paused');
    assert.equal(session.controlGrant.activeGrant, null);
  });

  test('lifecycle transitions, project v2, and load rotate generation and clear requests', () => {
    const session = new Session();
    session.submit({ commands: [stroke(5, 5)], play: false, ...context(session) });
    const created = session.addComment(commentInput(session, { requestId: 'life' }));
    const gen = (extra = {}) => ({ expectedDocGeneration: session.controlGrant.docGeneration, ...extra });
    const acknowledged = session.updateComment('ack', gen({ id: created.id, expectedSeq: created.seq }));
    assert.equal(acknowledged.status, 'acknowledged');
    const revisions = session.revision;
    const idempotent = session.updateComment('ack', gen({ id: created.id, expectedSeq: acknowledged.seq }));
    assert.deepEqual(idempotent, acknowledged);
    assert.equal(session.revision, revisions, 'idempotent transition does not emit');
    conflict(() => session.updateComment('ack', gen({ id: created.id, expectedSeq: created.seq })));
    const addressed = session.updateComment('address', gen({ id: created.id, expectedSeq: acknowledged.seq }));
    const resolved = session.updateComment('resolve', gen({ id: created.id, expectedSeq: addressed.seq }));
    assert.equal(resolved.status, 'resolved');
    session.controlGrant.authorize();
    const reopened = session.updateComment('reopen', gen({ id: created.id, expectedSeq: resolved.seq }));
    assert.equal(reopened.status, 'open');
    assert.equal(session.status, 'paused', 'reopen pauses for later human direction');
    assert.equal(session.controlGrant.requiresGrant, true, 'reopen invalidates grants');
    conflict(() => session.updateComment('resolve', { id: created.id, expectedSeq: reopened.seq,
      expectedDocGeneration: 'stale-generation' }));

    const project = session.project();
    assert.deepEqual(Object.keys(project).sort(),
      ['commands', 'comments', 'cursor', 'format', 'queue', 'version']);
    assert.equal(project.version, 2);
    assert.equal(project.comments.length, 1);
    assert.ok(project.comments[0].request.id.startsWith('req-') || project.comments[0].request.id.length > 0);

    const restored = new Session();
    const oldGeneration = restored.controlGrant.docGeneration;
    restored.load(project, { source: 'human' });
    assert.notEqual(restored.controlGrant.docGeneration, oldGeneration);
    assert.equal(restored.status, 'paused');
    assert.equal(restored.controlGrant.requiresGrant, true);
    assert.equal(restored.comments.length, 1);
    assert.equal(restored.comments[0].request, null, 'import clears request metadata');
    assert.equal(restored.comments[0].text, created.text);
    assert.throws(() => restored.load({ format: 'codesketch', version: 1, commands: [], cursor: 0,
      queue: [], feedback: [] }, { source: 'human' }), /Expected a Codesketch v2 project/);
    assert.equal(restored.comments[0].text, created.text, 'a rejected legacy load changes nothing');
  });

  test('comment projection, unique requestIds, and capacity stay atomic', () => {
    const session = new Session();
    session.submit({ commands: [stroke(5, 5)], play: true, ...context(session) });
    conflict(() => session.addComment(commentInput(session, { requestId: 'req-playing-1' })),
      'comments cannot be sent while playing');
    session.control('pause', 1, { source: 'human' });
    const item = session.addComment(commentInput(session, { requestId: 'req-1', text: 'whole canvas note' }));
    assert.equal(session.status, 'paused', 'a comment keeps the painter paused');
    assert.equal(session.controlGrant.requiresGrant, true);
    assert.equal(session.comments.length, 1);
    const snap = session.snapshot();
    assert.deepEqual(Object.keys(snap.comments[0]).sort(), ['acknowledgedAt', 'addressedAt',
      'artRevision', 'at', 'cursor', 'id', 'number', 'rect', 'request', 'resolvedAt', 'seq',
      'status', 'text', 'visibleLayers']);
    assert.equal(snap.comments[0].text, 'whole canvas note');
    assert.equal(snap.comments.length, 1);
    const revisions = session.revision;
    const second = session.addComment(commentInput(session, { requestId: 'req-2', text: 'whole canvas note' }));
    assert.notEqual(second.id, item.id, 'a repeated note is a new instruction');
    assert.equal(session.comments.length, 2);
    assert.equal(session.revision, revisions + 1);
    for (let i = 3; i <= 100; i++) {
      session.addComment(commentInput(session, { requestId: `req-${i}`, text: `note ${i}` }));
    }
    assert.equal(session.comments.length, 100);
    session.controlGrant.authorize();
    assert.ok(session.controlGrant.activeGrant);
    const capacityBefore = session.controlGrant.snapshot();
    const capacityRevision = session.revision;
    assert.throws(() => session.addComment(commentInput(session, { requestId: 'req-over', text: 'one too many' })),
      /At most 100/);
    assert.equal(session.status, 'paused', 'a capacity failure keeps the paused state');
    assert.deepEqual(session.controlGrant.snapshot(), capacityBefore, 'a capacity failure invalidates nothing');
    assert.ok(session.controlGrant.activeGrant, 'the authorized grant survives a failed comment');
    assert.equal(session.revision, capacityRevision, 'a capacity failure never emits');
  });

  test('pollComments returns cursor, comments, and grant fields without emitting', () => {
    const session = new Session();
    session.submit({ commands: [stroke(5, 5)], play: false, ...context(session) });
    session.addComment(commentInput(session, { requestId: 'poll-1' }));
    const revisions = session.revision;
    const fresh = session.pollComments(undefined);
    assert.equal(fresh.reset, true);
    assert.equal(fresh.comments.length, 1);
    assert.equal(fresh.docGeneration, session.controlGrant.docGeneration);
    assert.equal(fresh.controlEpoch, session.controlGrant.controlEpoch);
    assert.ok('requiresGrant' in fresh && 'activeGrant' in fresh);
    const state = JSON.parse(fresh.cursor);
    assert.deepEqual(state, [session.instanceId, session.controlGrant.docGeneration, 1]);
    const incremental = session.pollComments(fresh.cursor);
    assert.equal(incremental.reset, false);
    assert.deepEqual(incremental.comments, []);
    assert.equal(session.revision, revisions, 'poll never emits');
  });
});

function context(session) {
  return { expectedDocGeneration: session.controlGrant.docGeneration, epoch: session.controlGrant.controlEpoch };
}
