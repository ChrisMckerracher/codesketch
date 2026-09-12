import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Session, playbackDuration, validateProject } from '../src/direction/index.mjs';

const stroke = (overrides = {}) => ({ type: 'stroke', layer: 'paint', color: '#253d38',
  points: [[10, 10], [400, 400]], size: 8, brush: 'brush', ...overrides });
const longStroke = () => stroke({ points: [[0, 0], [1000, 700]] });
const grant = (session) => ({ expectedDocGeneration: session.controlGrant.docGeneration,
  epoch: session.controlGrant.controlEpoch, grantToken: session.controlGrant.activeGrant?.grantToken });
const conflict = (fn) => assert.throws(fn, (error) => {
  assert.equal(error.statusCode, 409);
  return true;
});
const fingerprint = (session) => JSON.stringify({ history: session.history, queue: session.queue,
  active: session.active, comments: session.comments, status: session.status, speed: session.speed,
  revision: session.revision, artRevision: session.artRevision, grant: session.controlGrant.snapshot(),
  storageError: session.storageError, playbackError: session.playbackError });
const drain = (session) => {
  session.control('resume', 1, { source: 'human' });
  while (session.status === 'playing') session.tick(1000);
};

function activeSession() {
  const session = new Session();
  session.submit({ commands: [longStroke(), stroke(), stroke({ points: [[50, 50], [80, 90]] })],
    play: true, ...grant(session) });
  session.tick();
  session.control('pause', 1, { source: 'human' });
  session.control('speed', 2, { source: 'human' });
  session.addComment({ requestId: 'req-note-1', text: 'keep this hill', rect: null,
    expectedDocGeneration: session.controlGrant.docGeneration, expectedArtRevision: session.artRevision,
    expectedControlEpoch: session.controlGrant.controlEpoch });
  return session;
}

describe('recovery snapshot and restoreRecovery semantics', () => {
  test('recovery() is a detached snapshot of project, active progress, and speed', () => {
    const session = activeSession();
    const before = fingerprint(session);
    const snapshot = session.recovery();
    assert.equal(snapshot.format, 'codesketch-recovery');
    assert.equal(snapshot.version, 1);
    assert.equal(snapshot.speed, 2);
    assert.deepEqual(snapshot.active, { progress: session.active.progress });
    snapshot.active.progress = 0.99;
    snapshot.speed = 8;
    snapshot.project.commands.push({ junk: true });
    snapshot.project.commands[0].size = 999;
    snapshot.project.queue.push({ junk: true });
    snapshot.project.queue[0].color = '#ff0000';
    snapshot.project.comments.push({ junk: true });
    snapshot.project.comments[0].text = 'mutated provenance';
    assert.equal(fingerprint(session), before, 'snapshot mutation never touches the session');
  });

  test('restoreRecovery rebuilds exact paused state before any visible mutation', () => {
    const source = activeSession();
    const snapshot = source.recovery();
    const target = new Session();
    const freshInstance = target.instanceId;
    target.playbackError = 'stale';
    target.storageError = 'stale';
    target.restoreRecovery(snapshot);
    assert.equal(target.status, 'paused', 'restores strictly paused');
    assert.equal(target.speed, 2);
    assert.equal(target.instanceId, freshInstance, 'constructor identity is kept, not reassigned');
    assert.equal(target.revision, 1, 'publishes exactly one change');
    assert.equal(target.artRevision, 1);
    assert.equal(target.playbackError, null);
    assert.equal(target.storageError, null);
    assert.deepEqual(target.active.command, source.active.command);
    assert.equal(target.active.progress, source.active.progress);
    assert.equal(target.active.duration, playbackDuration(target.active.command));
    assert.deepEqual(target.pending(), source.pending(), 'active head plus queue restored');
    assert.deepEqual(target.queue, snapshot.project.queue.slice(1), 'remaining queue assigns slice(1)');
    assert.deepEqual(target.history.commands, source.history.commands);
    assert.equal(target.history.cursor, source.history.cursor);
    assert.deepEqual(target.document.marks, source.document.marks, 'preview stays uncommitted');
    assert.equal(target.comments.length, 1);
    assert.deepEqual(target.comments[0], { ...source.comments[0], request: null });
    assert.equal(target.controlGrant.requiresGrant, true);
    assert.equal(target.controlGrant.activeGrant, null);
    conflict(() => target.control('resume', 1, grant(target)), 'stale agent grant is revoked');
  });

  test('restored preview completes into the same history as uninterrupted playback', () => {
    const source = activeSession();
    const target = new Session();
    target.restoreRecovery(source.recovery());
    drain(source);
    drain(target);
    assert.deepEqual(target.history.commands, source.history.commands);
    assert.deepEqual(target.document.marks, source.document.marks);
    assert.equal(target.status, 'idle');
  });

  test('every command kind may own the active head with derived duration', () => {
    const cases = [
      { name: 'stroke', commands: [], cursor: 0, head: stroke({ points: [[0, 0], [30, 40]] }) },
      { name: 'rect', commands: [], cursor: 0, head: { type: 'rect', x: 10, y: 10, width: 100, height: 80 } },
      { name: 'ellipse', commands: [], cursor: 0, head: { type: 'ellipse', x: 20, y: 20, width: 60, height: 40 } },
      { name: 'fill', commands: [], cursor: 0, head: { type: 'fill', color: '#ffffff' } },
      { name: 'layer.add', commands: [], cursor: 0, head: { type: 'layer.add', id: 'sky', name: 'Sky' } },
      { name: 'layer.update', commands: [{ type: 'layer.add', id: 'sky', name: 'Sky' }], cursor: 1,
        head: { type: 'layer.update', id: 'sky', opacity: 0.5 } },
    ];
    for (const item of cases) {
      const project = validateProject({ format: 'codesketch', version: 2, commands: item.commands,
        cursor: item.cursor, queue: [item.head, stroke()], comments: [] });
      const target = new Session();
      target.restoreRecovery({ format: 'codesketch-recovery', version: 1, project,
        active: { progress: 0.5 }, speed: 1 });
      assert.equal(target.active.command.type, item.name, `${item.name} active head`);
      assert.equal(target.active.duration, playbackDuration(target.active.command));
      assert.equal(target.queue.length, 1, `${item.name} remaining queue`);
      assert.equal(target.status, 'paused');
    }
  });

  test('active null restores the whole queue paused', () => {
    const target = new Session();
    target.restoreRecovery({ format: 'codesketch-recovery', version: 1,
      project: validateProject({ format: 'codesketch', version: 2, commands: [], cursor: 0,
        queue: [stroke(), stroke({ points: [[90, 90], [95, 95]] })], comments: [] }),
      active: null, speed: 0.25 });
    assert.equal(target.active, null);
    assert.equal(target.queue.length, 2);
    assert.equal(target.speed, 0.25);
    assert.equal(target.status, 'paused');
  });

  test('malformed recovery leaves the whole session unchanged', () => {
    const target = new Session();
    target.restoreRecovery(activeSession().recovery());
    const before = fingerprint(target);
    const base = activeSession().recovery();
    const broken = [
      { ...base, extra: 1 },
      (() => { const item = { ...base }; delete item.project; return item; })(),
      { ...base, format: 'codesketch' },
      { ...base, version: 0 },
      { ...base, active: { progress: 1 } },
      { ...base, speed: 9 },
      { ...base, pad: 'x'.repeat(8 * 1024 * 1024) },
    ];
    for (const [index, item] of broken.entries()) {
      assert.throws(() => target.restoreRecovery(item), /Invalid recovery|Recovery exceeds|must be between/, `case ${index}`);
      assert.equal(fingerprint(target), before, `case ${index} changed nothing`);
    }
  });
});
