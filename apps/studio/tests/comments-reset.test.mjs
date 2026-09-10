import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/direction/index.mjs';

const stroke = (x, y) => ({ type: 'stroke', points: [[x, y], [x + 8, y + 8], [x + 16, y + 4]] });
const conflict = (fn, message) => assert.throws(fn, (error) => {
  assert.equal(error.statusCode, 409, message);
  return true;
});
const context = (session) => ({
  expectedDocGeneration: session.controlGrant.docGeneration,
  epoch: session.controlGrant.controlEpoch,
});
const grant = (session) => ({ ...context(session), grantToken: session.controlGrant.activeGrant?.grantToken });
const paintedAndPaused = () => {
  const session = new Session();
  session.submit({ commands: [stroke(5, 5), stroke(30, 30)], immediate: true, ...context(session) });
  session.control('pause', 1, { source: 'human' });
  return session;
};

describe('guarded resets, loads, and load-adjacent control actions', () => {
  test('after a human pause agent new/undo/redo/load reject contextless, stale, and current-no-token 409 atomically', () => {
    const session = paintedAndPaused();
    const project = session.project();
    const stale = { expectedDocGeneration: '0'.repeat(8), epoch: 42 };
    const before = structuredClone(session.snapshot());
    const beforeGrant = structuredClone(session.controlGrant.snapshot());
    for (const action of ['new', 'undo', 'redo']) {
      conflict(() => session.control(action), `contextless agent ${action} after human pause`);
      conflict(() => session.control(action, 1, context(session)), `current context without token ${action}`);
      conflict(() => session.control(action, 1, stale), `stale context ${action}`);
      conflict(() => session.control(action, 1, { ...context(session), epoch: context(session).epoch + 3 }),
        `wrong epoch ${action}`);
    }
    conflict(() => session.load(project));
    conflict(() => session.load(project, context(session)));
    conflict(() => session.load(project, stale));
    assert.deepEqual(session.snapshot(), before, 'every rejected reset leaves the entire snapshot equal');
    assert.deepEqual(session.controlGrant.snapshot(), beforeGrant);
    assert.equal(session.artRevision, before.artRevision, 'artRevision never moves on guard failures');
    assert.deepEqual(session.pending(), [], 'queue untouched by guard failures');
  });

  test('a valid active grant permits agent undo/redo/new/load and undo consumes the grant', () => {
    const session = paintedAndPaused();
    session.control('resume', 1, { source: 'human' });
    const issued = grant(session);
    session.control('undo', 1, { ...issued });
    assert.equal(session.history.cursor, 1, 'granted agent undo runs');
    assert.equal(session.controlGrant.activeGrant, null, 'granted undo invalidates on completion');
    conflict(() => session.control('redo', 1, issued), 'the previously valid grant token is revoked afterwards');
    session.control('resume', 1, { source: 'human' });
    session.control('redo', 1, grant(session));
    assert.equal(session.history.cursor, 2, 'granted agent redo runs');
    session.control('resume', 1, { source: 'human' });
    const generation = session.controlGrant.docGeneration;
    session.control('new', 1, grant(session));
    assert.notEqual(session.controlGrant.docGeneration, generation);
    assert.equal(session.status, 'idle');
    assert.equal(session.controlGrant.controlEpoch, 0);
    assert.equal(session.controlGrant.activeGrant, null);
    session.control('resume', 1, { source: 'human' });
    session.load(session.project(), grant(session));
    assert.equal(session.status, 'paused', 'a successful load lands paused');
    assert.equal(session.controlGrant.requiresGrant, true);
    assert.equal(session.controlGrant.activeGrant, null, 'load clears any active grant');
    assert.equal(session.controlGrant.controlEpoch, 0);
  });

  test('human new and load stay trusted; successful load pauses with the grant cleared', () => {
    const session = paintedAndPaused();
    const source = new Session();
    source.submit({ commands: [stroke(5, 5)], immediate: true, source: 'human' });
    source.addComment({ requestId: 'req-keep-1', text: 'keep me', rect: null,
      expectedDocGeneration: source.controlGrant.docGeneration,
      expectedArtRevision: source.artRevision });
    const project = source.project();
    session.control('new', 1, { source: 'human' });
    assert.equal(session.status, 'idle');
    assert.equal(session.controlGrant.requiresGrant, false);
    assert.equal(session.controlGrant.controlEpoch, 0);
    const generation = session.controlGrant.docGeneration;
    session.load(project, { source: 'human' });
    assert.notEqual(session.controlGrant.docGeneration, generation);
    assert.equal(session.status, 'paused');
    assert.equal(session.controlGrant.requiresGrant, true);
    assert.equal(session.controlGrant.activeGrant, null);
    assert.equal(session.controlGrant.controlEpoch, 0);
    assert.equal(session.comments.length, 1);
    assert.equal(session.comments[0].text, 'keep me');
    conflict(() => session.control('undo'), 'the loaded pause blocks contextless agent undo');
    session.control('undo', 1, { source: 'human' });
    assert.equal(session.history.cursor, 0);
  });

  test('fresh sessions reject missing or stale agent context and accept matching fresh context', () => {
    const untouched = new Session();
    conflict(() => untouched.control('new'), 'contextless agent new is rejected while fresh');
    conflict(() => untouched.control('undo'), 'contextless agent undo is rejected while fresh');
    conflict(() => untouched.control('redo'), 'contextless agent redo is rejected while fresh');
    conflict(() => untouched.load(untouched.project()), 'contextless agent load is rejected while fresh');
    conflict(() => untouched.control('new', 1, { expectedDocGeneration: 'stale', epoch: 0 }),
      'stale context is a conflict even on a fresh session');
    conflict(() => untouched.load(untouched.project(), { expectedDocGeneration: 'stale', epoch: 0 }),
      'stale load context is a conflict even on a fresh session');
    conflict(() => untouched.control('new', 1, { expectedDocGeneration: untouched.controlGrant.docGeneration }),
      'epoch is required even while fresh');
    untouched.control('new', 1, context(untouched));
    assert.equal(untouched.status, 'idle', 'matching fresh context resets without a token');
    untouched.load(untouched.project(), context(untouched));
    assert.equal(untouched.status, 'paused', 'matching fresh context loads without a token');
  });

  test('the load guard runs before validation and project payload metadata never impersonates a trusted caller', () => {
    const session = paintedAndPaused();
    const before = structuredClone(session.snapshot());
    const malformed = { format: 'nope' };
    conflict(() => session.load(malformed, { expectedDocGeneration: 'stale', epoch: 0 }),
      'the guard rejects stale context before the project is even validated');
    assert.throws(() => session.load(malformed, { source: 'human' }), /Expected a Codesketch/);
    conflict(() => session.load({ ...session.project(), source: 'human',
      expectedDocGeneration: session.controlGrant.docGeneration }),
      'source or transient metadata inside the project payload is ignored');
    assert.deepEqual(session.snapshot(), before);
  });
});
