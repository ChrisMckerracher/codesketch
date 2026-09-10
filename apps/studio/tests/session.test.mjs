import test from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/direction/index.mjs';

const stroke = (overrides = {}) => ({ type: 'stroke', layer: 'paint', color: '#253d38',
  points: [[10, 10], [400, 400]], size: 8, brush: 'brush', ...overrides });
const longStroke = () => stroke({ points: [[0, 0], [1000, 700]] });
const conflict = (fn) => assert.throws(fn, (error) => {
  assert.equal(error.statusCode, 409);
  return true;
});
const grant = (session) => ({ expectedDocGeneration: session.controlGrant.docGeneration,
  epoch: session.controlGrant.controlEpoch, grantToken: session.controlGrant.activeGrant?.grantToken });

test('progressive tick animates an active command partially, then commits it', () => {
  const session = new Session();
  session.submit({ commands: [longStroke()], play: true, ...grant(session) });
  assert.equal(session.status, 'playing');
  session.tick();
  assert.ok(session.active, 'first tick claims the command');
  assert.ok(session.active.progress > 0 && session.active.progress < 1, 'progress is partial');
  assert.equal(session.document.marks.length, 0, 'nothing committed while animating');
  session.tick(5000);
  assert.equal(session.active, null, 'active command completed');
  assert.equal(session.document.marks.length, 1, 'command committed on completion');
  assert.equal(session.status, 'idle', 'queue drained back to idle');
});

test('explicit human pause stays sticky for human batches while agents need grants', () => {
  const session = new Session();
  session.control('pause', 1, { source: 'human' });
  session.submit({ commands: [stroke()], play: true, source: 'human' });
  assert.equal(session.status, 'paused', 'explicit human pause survives a play:true submit');
  assert.equal(session.pending().length, 1, 'commands still queue while paused');
  conflict(() => session.submit({ commands: [stroke()], play: true }),
    'agents may not auto-play across a human pause');
  assert.equal(session.pending().length, 1);
});

test('comments land only while paused and record the painter cursor', () => {
  const session = new Session();
  session.submit({ commands: [stroke()], play: true, ...grant(session) });
  conflict(() => session.addComment({ requestId: 'req-early-1', text: 'slow down here', rect: null,
    expectedDocGeneration: session.controlGrant.docGeneration,
    expectedArtRevision: session.artRevision }), 'a comment cannot be added while playing');
  session.control('pause', 1, { source: 'human' });
  session.addComment({ requestId: 'req-slow-1', text: 'slow down here', rect: null,
    expectedDocGeneration: session.controlGrant.docGeneration,
    expectedArtRevision: session.artRevision });
  assert.equal(session.status, 'paused', 'a comment keeps the painter paused');
  assert.equal(session.comments.length, 1);
  assert.equal(session.comments[0].text, 'slow down here');
  assert.equal(session.comments[0].cursor, 0);
});

test('step commits exactly one pending command and stays paused', () => {
  const session = new Session();
  session.submit({ commands: [stroke(), stroke({ points: [[100, 100], [200, 200]] })],
    play: false, ...grant(session) });
  session.control('step', 1, { source: 'human' });
  assert.equal(session.document.marks.length, 1, 'exactly one command committed');
  assert.equal(session.pending().length, 1, 'one command remains queued');
  assert.equal(session.status, 'paused');
  assert.equal(session.controlGrant.requiresGrant, true, 'human step invalidates grants');
});

test('replace cancels old pending work but keeps already completed marks', () => {
  const session = new Session();
  session.submit({ commands: [stroke()], play: false, ...grant(session) });
  session.control('step', 1, { source: 'human' });
  session.submit({ commands: [stroke(), stroke()], play: true, source: 'human' });
  session.control('resume', 1, { source: 'human' });
  session.tick();
  assert.ok(session.active, 'painter is mid-stroke');
  session.submit({ commands: [stroke({ points: [[500, 500], [900, 100]] })], replace: true, ...grant(session) });
  assert.equal(session.active, null, 'partial stroke canceled');
  assert.equal(session.pending().length, 1, 'queue holds only the replacement');
  assert.deepEqual(session.pending()[0].points, [[500, 500], [900, 100]]);
  assert.equal(session.document.marks.length, 1, 'earlier completed mark retained');
});

test('invalid submit rejects the whole batch atomically', () => {
  const session = new Session();
  session.submit({ commands: [stroke()], immediate: true, ...grant(session) });
  const before = session.snapshot();
  assert.throws(() => session.submit({ commands: [stroke(), { type: 'stroke', points: [] }], source: 'human' }),
    /Stroke needs 1–2000 points/);
  const after = session.snapshot();
  assert.deepEqual(after.playback, before.playback, 'queue and playback untouched');
  assert.equal(after.history.cursor, before.history.cursor, 'history untouched');
  assert.equal(after.controlEpoch, before.controlEpoch, 'no grant bump on failure');
  assert.equal(after.document.marks.length, 1);
});

test('immediate submit commits everything at once and pauses', () => {
  const session = new Session();
  session.submit({ commands: [stroke(), stroke()], immediate: true, ...grant(session) });
  assert.equal(session.document.marks.length, 2, 'all commands committed instantly');
  assert.equal(session.pending().length, 0, 'nothing left queued');
  assert.equal(session.status, 'paused');
  assert.equal(session.active, null);
});

test('undo/redo moves the cursor and a v2 project roundtrips into a new session', () => {
  const source = new Session();
  source.submit({ commands: [stroke(), stroke()], immediate: true, ...grant(source) });
  source.control('undo', 1, { source: 'human' });
  assert.equal(source.document.marks.length, 1, 'undo reverts one mark');
  source.control('redo', 1, { source: 'human' });
  assert.equal(source.document.marks.length, 2, 'redo restores the mark');
  source.addComment({ requestId: 'req-ship-1', text: 'ship it', rect: null,
    expectedDocGeneration: source.controlGrant.docGeneration,
    expectedArtRevision: source.artRevision });
  const exported = source.project();
  assert.equal(exported.version, 2, 'projects export as v2 with comments');
  const restored = new Session();
  restored.load(exported, grant(restored));
  assert.deepEqual(restored.document, source.document);
  assert.equal(restored.history.cursor, 2);
  assert.deepEqual(restored.comments.map(item => item.text), ['ship it']);
  assert.equal(restored.comments[0].request, null, 'import clears request metadata');
  assert.equal(restored.controlGrant.requiresGrant, true, 'loaded sessions wait for the human');
  assert.equal(restored.status, 'paused', 'loaded projects wait for the human');
});
