import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/direction/session.mjs';

const stroke = (x, y) => ({ type: 'stroke', points: [[x, y], [x + 8, y + 8], [x + 16, y + 4]] });
const conflict = (fn) => assert.throws(fn, (error) => {
  assert.equal(error.statusCode, 409);
  return true;
});
const context = (session) => ({
  expectedDocGeneration: session.controlGrant.docGeneration,
  epoch: session.controlGrant.controlEpoch,
});
const grant = (session) => ({ ...context(session), grantToken: session.controlGrant.activeGrant?.grantToken });

describe('session playback control guard', () => {
  test('fresh sessions submit with current context and auto-play', () => {
    const session = new Session();
    conflict(() => session.submit({ commands: [stroke(5, 5)] }), 'missing context is a conflict even while fresh');
    session.submit({ commands: [stroke(5, 5)], ...context(session) });
    assert.equal(session.status, 'playing');
    const snap = session.snapshot();
    assert.equal(snap.controlEpoch, 0);
    assert.equal(snap.requiresGrant, false);
    assert.equal(snap.activeGrant, null);
    assert.match(snap.docGeneration, /^[0-9a-f-]{36}$/);
    const staged = new Session();
    staged.submit({ commands: [stroke(1, 1)], play: false, ...context(staged) });
    assert.equal(staged.status, 'paused');
    const manual = new Session();
    manual.submit({ commands: [stroke(2, 2)], immediate: true, ...context(manual) });
    assert.equal(manual.status, 'paused');
    assert.equal(manual.history.commands.length, 1);
  });

  test('human pause invalidates and rejects contextless agent batches', () => {
    const session = new Session();
    session.submit({ commands: [stroke(5, 5), stroke(30, 30)], ...context(session) });
    session.control('pause', 1, { source: 'human' });
    assert.equal(session.status, 'paused');
    assert.equal(session.controlGrant.requiresGrant, true);
    assert.equal(session.controlGrant.controlEpoch, 1);
    assert.equal(session.controlGrant.activeGrant, null);
    conflict(() => session.submit({ commands: [stroke(60, 60)] }));
    conflict(() => session.control('pause', 1, { source: 'robot' }));
    assert.equal(session.controlGrant.controlEpoch, 1, 'failed actions never bump epochs');
  });

  test('staging with current context works, never commits or bumps', () => {
    const session = new Session();
    session.submit({ commands: [stroke(5, 5), stroke(30, 30)], ...context(session) });
    session.control('pause', 1, { source: 'human' });
    session.submit({ commands: [stroke(60, 60)], play: false, ...context(session) });
    assert.equal(session.status, 'paused');
    assert.equal(session.queue.length, 3);
    assert.equal(session.history.commands.length, 0);
    assert.equal(session.controlGrant.controlEpoch, 1);
    conflict(() => session.submit({
      commands: [stroke(90, 90)], play: false, expectedDocGeneration: session.controlGrant.docGeneration,
    }));
  });

  test('authorized agent play:true continues from paused; stale epoch fails while playing', () => {
    const session = new Session();
    session.submit({ commands: [stroke(5, 5)], play: false, ...context(session) });
    session.control('pause', 1, { source: 'human' });
    session.controlGrant.authorize();
    const issued = session.controlGrant.activeGrant;
    session.submit({ commands: [stroke(30, 30)], play: true, ...grant(session) });
    assert.equal(session.status, 'playing');
    assert.equal(session.queue.length, 2);
    conflict(() => session.submit({
      commands: [stroke(60, 60)], play: true, expectedDocGeneration: issued.docGeneration,
      epoch: issued.controlEpoch - 1, grantToken: issued.grantToken,
    }));
    assert.equal(session.status, 'playing', 'rejected stale batch does not stop playback');
  });

  test('human source submissions stay paused and keep the pause sticky', () => {
    const session = new Session();
    session.submit({ commands: [stroke(5, 5)], play: false, source: 'human' });
    session.submit({ commands: [stroke(30, 30)], play: true, source: 'human' });
    assert.equal(session.status, 'paused');
    assert.equal(session.controlGrant.controlEpoch, 2, 'each human submit invalidates before state emits');
  });

  test('human resume authorizes pending and the grant spans batches while playing', () => {
    const session = new Session();
    session.submit({ commands: [stroke(5, 5), stroke(30, 30)], ...context(session) });
    session.control('pause', 1, { source: 'human' });
    session.submit({ commands: [stroke(60, 60)], play: false, ...context(session) });
    session.control('resume', 1, { source: 'human' });
    assert.equal(session.status, 'playing');
    assert.equal(session.controlGrant.requiresGrant, true);
    const issued = session.controlGrant.activeGrant;
    assert.equal(issued.controlEpoch, 2);
    session.submit({ commands: [stroke(100, 100)], ...grant(session) });
    session.submit({ commands: [stroke(120, 120)], ...grant(session) });
    assert.equal(session.queue.length, 5);
    conflict(() => session.submit({
      commands: [stroke(140, 140)],
      expectedDocGeneration: session.controlGrant.docGeneration,
      epoch: issued.controlEpoch - 1,
      grantToken: issued.grantToken,
    }));
    assert.equal(session.queue.length, 5, 'rejected batch mutates nothing');
  });

  test('manual human immediate supersedes and revokes the agent grant', () => {
    const session = new Session();
    session.submit({ commands: [stroke(5, 5), stroke(30, 30)], ...context(session) });
    session.control('pause', 1, { source: 'human' });
    session.control('resume', 1, { source: 'human' });
    const issued = session.controlGrant.activeGrant;
    session.submit({ commands: [stroke(140, 140)], immediate: true, source: 'human' });
    assert.equal(session.status, 'paused');
    assert.equal(session.history.commands.length, 1);
    assert.equal(session.queue.length, 2);
    assert.equal(session.controlGrant.activeGrant, null);
    assert.equal(session.controlGrant.requiresGrant, true);
    conflict(() => session.submit({
      commands: [stroke(160, 160)],
      expectedDocGeneration: issued.docGeneration,
      epoch: issued.controlEpoch,
      grantToken: issued.grantToken,
    }));
  });

  test('agent pause is a sticky stop; agent resume and undo need execution grants, clear needs staging context', () => {
    const session = new Session();
    session.submit({ commands: [stroke(5, 5)], ...context(session) });
    session.control('pause', 1, { source: 'human' });
    conflict(() => session.control('resume', 1, { ...context(session) }));
    session.control('resume', 1, { source: 'human' });
    session.control('pause', 1);
    assert.equal(session.status, 'paused');
    assert.equal(session.controlGrant.requiresGrant, true);
    conflict(() => session.control('resume', 1, { ...context(session) }));
    session.control('resume', 1, { source: 'human' });
    session.control('resume', 1, { ...grant(session) });
    assert.equal(session.status, 'playing');
    assert.equal(session.controlGrant.controlEpoch, 4, 'agent resume never auto-authorizes');
    conflict(() => session.control('clear'));
    session.control('clear', 1, { ...context(session) });
    assert.equal(session.queue.length, 0);
    assert.equal(session.status, 'paused');
    conflict(() => session.control('undo', 1, { ...context(session) }),
      'agent undo is an execution change and needs the grant token');
    session.controlGrant.authorize();
    session.control('undo', 1, { ...grant(session) });
    assert.equal(session.history.commands.length, 0);
    assert.equal(session.controlGrant.controlEpoch, 7);
  });

  test('human and agent step commit one command with distinct grant effects', () => {
    const session = new Session();
    session.submit({ commands: [stroke(5, 5), stroke(30, 30)], play: false, ...context(session) });
    session.control('step', 1, { source: 'human' });
    assert.equal(session.history.commands.length, 1);
    assert.equal(session.status, 'paused');
    assert.equal(session.controlGrant.requiresGrant, true);
    assert.equal(session.controlGrant.controlEpoch, 1);
    session.control('resume', 1, { source: 'human' });
    session.control('step', 1, { ...grant(session) });
    assert.equal(session.history.commands.length, 2);
    assert.equal(session.status, 'paused');
    assert.equal(session.controlGrant.controlEpoch, 2, 'agent step keeps the grant usable');
    assert.ok(session.controlGrant.activeGrant);
    session.control('step', 1, { ...grant(session) });
  });

  test('failed batches leave epoch and history untouched', () => {
    const session = new Session();
    session.submit({ commands: [stroke(5, 5)], play: false, source: 'human' });
    const before = session.controlGrant.snapshot();
    assert.equal(before.controlEpoch, 1);
    assert.throws(() => session.submit({ commands: [{ type: 'bogus' }], play: false, ...context(session) }),
      /Unknown command type/);
    assert.deepEqual(session.controlGrant.snapshot(), before);
    assert.equal(session.history.commands.length, 0);
    assert.throws(() => session.submit({ commands: [{ type: 'bogus' }], play: false, source: 'human' }),
      /Unknown command type/);
    assert.deepEqual(session.controlGrant.snapshot(), before);
    assert.equal(session.history.commands.length, 0);
  });

  test('new and load rotate generation with the documented grant state', () => {
    const session = new Session();
    session.submit({ commands: [stroke(5, 5)], play: false, source: 'human' });
    session.addComment({ requestId: 'req-new-1', text: 'slow down here', rect: null,
      expectedDocGeneration: session.controlGrant.docGeneration, expectedArtRevision: session.artRevision });
    const stale = session.controlGrant.docGeneration;
    session.control('new', undefined, { source: 'human' });
    assert.notEqual(session.controlGrant.docGeneration, stale);
    assert.equal(session.controlGrant.controlEpoch, 0);
    assert.equal(session.controlGrant.requiresGrant, false);
    assert.equal(session.controlGrant.activeGrant, null);
    assert.equal(session.comments.length, 0);
    session.load({ format: 'codesketch', version: 2, commands: [stroke(5, 5)], cursor: 1, queue: [], comments: [] },
      { source: 'human' });
    assert.notEqual(session.controlGrant.docGeneration, stale);
    assert.equal(session.controlGrant.requiresGrant, true);
    assert.equal(session.controlGrant.controlEpoch, 0);
    assert.equal(session.status, 'paused');
    conflict(() => session.submit({ commands: [stroke(9, 9)], play: false, expectedDocGeneration: stale, epoch: 0 }));
  });

  test('comments pause and invalidate; capacity failures stay atomic', () => {
    const session = new Session();
    session.submit({ commands: [stroke(5, 5)], ...context(session) });
    session.control('pause', 1, { source: 'human' });
    session.addComment({ requestId: 'req-note-1', text: 'note', rect: null,
      expectedDocGeneration: session.controlGrant.docGeneration, expectedArtRevision: session.artRevision });
    assert.equal(session.status, 'paused');
    assert.equal(session.controlGrant.requiresGrant, true);
    conflict(() => session.submit({ commands: [stroke(7, 7)] }));
    for (let i = 2; i <= 100; i++) {
      session.addComment({ requestId: `req-note-${i}`, text: `note ${i}`, rect: null,
        expectedDocGeneration: session.controlGrant.docGeneration, expectedArtRevision: session.artRevision });
    }
    assert.equal(session.comments.length, 100);
    const before = session.controlGrant.snapshot();
    const revisions = session.revision;
    assert.throws(() => session.addComment({ requestId: 'req-note-over', text: 'one too many', rect: null,
      expectedDocGeneration: session.controlGrant.docGeneration, expectedArtRevision: session.artRevision }),
      /At most 100/);
    assert.equal(session.status, 'paused');
    assert.deepEqual(session.controlGrant.snapshot(), before, 'a capacity failure invalidates nothing');
    assert.equal(session.revision, revisions, 'a capacity failure never emits');
  });

  test('artRevision tracks rendered artwork, not control traffic', () => {
    const session = new Session();
    session.submit({ commands: [stroke(5, 5), stroke(30, 30)], play: false, ...context(session) });
    const start = session.artRevision;
    let emissions = 0;
    session.onChange = () => emissions++;
    session.control('pause', 1, { source: 'human' });
    session.control('resume', 1, { source: 'human' });
    session.control('pause', 1, { source: 'human' });
    session.control('speed', 2);
    session.submit({ commands: [stroke(60, 60)], play: false, ...context(session) });
    session.addComment({ requestId: 'req-art-1', text: 'send only pauses', rect: null,
      expectedDocGeneration: session.controlGrant.docGeneration, expectedArtRevision: session.artRevision });
    assert.equal(session.artRevision, start, 'controls, staging and Send never move artRevision');
    assert.ok(emissions > 0 && session.revision > 0, 'ordinary revision and onChange still advance');
    session.addComment({ text: 'go fresh', rect: null, requestId: 'apply-idle', continuePlayback: true,
      expectedDocGeneration: session.controlGrant.docGeneration, expectedArtRevision: session.artRevision });
    assert.equal(session.artRevision, start, 'Apply without an active preview keeps artRevision');
    session.submit({ commands: [{ type: 'layer.update', id: 'paint', opacity: 0.5 }],
      immediate: true, source: 'human' });
    assert.ok(session.artRevision > start, 'a committed visibility mutation advances artRevision');
    session.submit({ commands: [stroke(90, 90)], play: false, ...context(session) });
    session.control('resume', 1, { source: 'human' });
    session.tick(40);
    assert.ok(session.active, 'a partial preview exists');
    session.control('pause', 1, { source: 'human' });
    const beforePreview = session.artRevision;
    session.addComment({ text: 'clear preview', rect: null, requestId: 'apply-active', continuePlayback: true,
      expectedDocGeneration: session.controlGrant.docGeneration, expectedArtRevision: session.artRevision });
    assert.equal(session.active, null);
    assert.equal(session.queue.length, 0);
    assert.equal(session.artRevision, beforePreview + 1, 'Apply removing an active preview advances artRevision');
  });
});
