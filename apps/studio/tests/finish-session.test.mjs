import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/direction/index.mjs';

const stroke = (overrides = {}) => ({ type: 'stroke', layer: 'paint', color: '#253d38',
  points: [[10, 10], [400, 400]], size: 8, brush: 'brush', ...overrides });
const grant = (session) => ({ expectedDocGeneration: session.controlGrant.docGeneration,
  epoch: session.controlGrant.controlEpoch, grantToken: session.controlGrant.activeGrant?.grantToken });
const conflict = (fn, message) => assert.throws(fn, (error) => {
  assert.equal(error.statusCode, 409, message);
  return true;
});
const fingerprint = (session) => JSON.stringify({ history: session.history, queue: session.queue,
  active: session.active, comments: session.comments, status: session.status, speed: session.speed,
  revision: session.revision, artRevision: session.artRevision, grant: session.controlGrant.snapshot(),
  storageError: session.storageError, playbackError: session.playbackError });
const mixedBatch = () => [
  { type: 'layer.add', id: 'sky', name: 'Sky' },
  { type: 'fill', color: '#f7f3e8' },
  stroke({ layer: 'sky', points: [[0, 0], [30, 40]] }),
  { type: 'rect', layer: 'paint', x: 10, y: 10, width: 100, height: 80 },
  { type: 'ellipse', layer: 'sky', x: 20, y: 20, width: 60, height: 40 },
  stroke({ brush: 'eraser', points: [[50, 50], [90, 90]] }),
  { type: 'layer.update', id: 'sky', opacity: 0.5 },
  stroke({ brush: 'pencil', points: [[5, 5], [15, 25]] }),
];
const bigMixedBatch = () => {
  const commands = mixedBatch();
  for (let i = 0; i < 100; i++) commands.push(stroke({ points: [[i, i * 2], [i + 5, i * 2 + 7]] }));
  return commands;
};
const referenceDocument = (commands) => {
  const reference = new Session();
  reference.submit({ commands, play: false, source: 'human' });
  reference.control('resume', 1, { source: 'human' });
  while (reference.status === 'playing') reference.tick(10000);
  return reference;
};

describe('atomic finish control', () => {
  test('human finish mid-play commits 108 mixed commands in order exactly once', () => {
    const commands = bigMixedBatch();
    const session = new Session();
    session.submit({ commands, play: true, ...grant(session) });
    session.tick();
    session.tick(5000);
    const epochBefore = session.controlGrant.controlEpoch;
    const revisionBefore = session.revision;
    const artBefore = session.artRevision;
    session.control('finish', 1, { source: 'human' });
    assert.equal(session.status, 'paused');
    assert.equal(session.active, null);
    assert.equal(session.queue.length, 0);
    assert.equal(session.controlGrant.controlEpoch, epochBefore + 1, 'epoch advances exactly once');
    assert.equal(session.controlGrant.requiresGrant, true);
    assert.equal(session.controlGrant.activeGrant, null);
    const reference = referenceDocument(commands);
    assert.equal(session.history.commands.length, commands.length);
    assert.deepEqual(session.history.commands, reference.history.commands, 'exact command order');
    assert.deepEqual(session.document.marks, reference.document.marks, 'exact rendered document');
    assert.deepEqual(session.document.layers, reference.document.layers);
    assert.equal(session.revision, revisionBefore + 1, 'publishes exactly one revision');
    assert.equal(session.artRevision, artBefore + 1, 'publishes exactly one art revision');
  });

  test('human finish from paused partial matches ticked playback exactly', () => {
    const commands = bigMixedBatch();
    const session = new Session();
    session.submit({ commands, play: true, ...grant(session) });
    session.tick();
    session.control('pause', 1, { source: 'human' });
    session.control('finish', 1, { source: 'human' });
    const reference = referenceDocument(commands);
    assert.equal(session.status, 'paused');
    assert.deepEqual(session.history.commands, reference.history.commands);
    assert.deepEqual(session.document.marks, reference.document.marks);
  });

  test('each finished command stays individually undoable', () => {
    const session = new Session();
    const commands = [[0, 0], [20, 0], [40, 0], [60, 0]].map(([x]) => stroke({ points: [[x, 0], [x + 10, 10]] }));
    session.submit({ commands, play: false, source: 'human' });
    session.control('finish', 1, { source: 'human' });
    assert.equal(session.document.marks.length, 4);
    for (let remaining = 3; remaining >= 0; remaining--) {
      session.control('undo', 1, { source: 'human' });
      assert.equal(session.document.marks.length, remaining);
    }
    assert.equal(session.history.cursor, 0);
  });

  test('finish completes a lone active preview with an empty queue', () => {
    const session = new Session();
    session.submit({ commands: [stroke({ points: [[0, 0], [1000, 700]] })], play: true, ...grant(session) });
    session.tick();
    session.control('pause', 1, { source: 'human' });
    session.control('finish', 1, { source: 'human' });
    assert.equal(session.active, null);
    assert.equal(session.queue.length, 0);
    assert.equal(session.status, 'paused');
    assert.equal(session.history.commands.length, 1);
    assert.equal(session.document.marks.length, 1);
  });

  test('finish discards the redo tail like an ordinary commit', () => {
    const session = new Session();
    session.submit({ commands: [stroke()], play: true, ...grant(session) });
    while (session.status === 'playing') session.tick(10000);
    session.control('undo', 1, { source: 'human' });
    session.submit({ commands: [stroke({ points: [[80, 80], [90, 90]] }), stroke({ points: [[95, 95], [99, 99]] })],
      play: false, source: 'human' });
    session.control('finish', 1, { source: 'human' });
    assert.equal(session.history.commands.length, 2);
    assert.equal(session.history.cursor, 2);
    assert.equal(session.document.marks.length, 2);
  });

  test('empty pending after authorization is an exact no-op', () => {
    const session = new Session();
    const before = fingerprint(session);
    session.control('finish', 1, { source: 'human' });
    assert.equal(fingerprint(session), before, 'human no-op');
    session.control('finish', 1, grant(session));
    assert.equal(fingerprint(session), before, 'authorized agent no-op');
  });

  test('agent finish requires current context plus execution grant and stays paused', () => {
    const session = new Session();
    session.submit({ commands: [stroke(), stroke({ points: [[80, 80], [90, 90]] })], play: false, source: 'human' });
    session.control('resume', 1, { source: 'human' });
    const context = grant(session);
    const activeGrantBefore = { ...session.controlGrant.activeGrant };
    session.control('finish', 1, context);
    assert.equal(session.status, 'paused');
    assert.equal(session.history.commands.length, 2);
    assert.equal(session.queue.length, 0);
    assert.equal(session.controlGrant.controlEpoch, context.epoch, 'agent finish leaves the epoch alone');
    assert.deepEqual(session.controlGrant.activeGrant, activeGrantBefore, 'grant survives an agent finish');
  });

  test('stale or missing context and grants are rejected with 409 and change nothing', () => {
    const session = new Session();
    session.submit({ commands: [stroke(), stroke()], play: false, source: 'human' });
    session.control('pause', 1, { source: 'human' });
    const context = grant(session);
    const before = fingerprint(session);
    conflict(() => session.control('finish', 1, {}), 'contextless');
    conflict(() => session.control('finish', 1, { ...context, expectedDocGeneration: 'other' }), 'stale generation');
    conflict(() => session.control('finish', 1, { ...context, epoch: context.epoch + 5 }), 'stale epoch');
    conflict(() => session.control('finish', 1, { ...context, grantToken: undefined }), 'missing grant token');
    conflict(() => session.control('finish', 1, { ...context, grantToken: 'wrong' }), 'wrong grant token');
    assert.equal(fingerprint(session), before);
  });

  test('a malformed late queued command aborts finish with the full snapshot intact', () => {
    const session = new Session();
    session.submit({ commands: [stroke(), stroke()], play: false, source: 'human' });
    session.control('pause', 1, { source: 'human' });
    session.queue.push(stroke({ points: [[NaN, 5], [8, 9]] }));
    session.playbackError = 'stale error';
    const before = fingerprint(session);
    assert.throws(() => session.control('finish', 1, { source: 'human' }), /between/);
    assert.equal(fingerprint(session), before, 'playbackError, grants, queue, and revisions preserved');
  });

  test('an exhausted project budget aborts finish with the full snapshot intact', () => {
    const session = new Session();
    session.submit({ commands: [stroke()], play: false, source: 'human' });
    session.control('pause', 1, { source: 'human' });
    session.comments = [{ id: 'big', text: 'x'.repeat(7 * 1024 * 1024 + 64) }];
    const before = fingerprint(session);
    assert.throws(() => session.control('finish', 1, { source: 'human' }), /7 MiB budget/);
    assert.equal(fingerprint(session), before);
  });
});
