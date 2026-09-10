import test from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/direction/index.mjs';
import { StudioApi } from '../src/studio/api.mjs';
import { snapshotProblem, projectProblem, unchangedProblem, stateReadExpect } from '../src/studio/response.mjs';

const COMMANDS = [
  { type: 'stroke', brush: 'pencil', size: 12, opacity: 0.8, color: '#253d38', layer: 'paint', points: [[10, 10], [40, 40]] },
  { type: 'rect', x: 5, y: 5, width: 30, height: 20, opacity: 1, color: '#112233', layer: 'paint' },
  { type: 'ellipse', x: 5, y: 5, width: 30, height: 20, opacity: 1, color: '#112233', layer: 'paint' },
  { type: 'fill', color: '#f7f3e8' },
  { type: 'layer.add', id: 'sky', name: 'Sky' },
  { type: 'layer.update', id: 'paint', opacity: 0.5 },
];

function seededSession() {
  const session = new Session();
  session.submit({ commands: COMMANDS, play: false, source: 'human' });
  session.addComment({
    requestId: 'request-1',
    text: 'Soften the hill edge',
    rect: { x: 10, y: 20, width: 30, height: 40 },
    continuePlayback: false,
    expectedDocGeneration: session.controlGrant.docGeneration,
    expectedArtRevision: session.artRevision,
  });
  return session;
}

function comment(overrides = {}) {
  return { ...seededSession().snapshot().comments[0], ...overrides };
}

function snapshotFrom(session, overrides = {}) {
  return { ...session.snapshot(), heartbeat: { lastSeenAt: null }, ...overrides };
}

function pendingSnapshot(overrides = {}) {
  return snapshotFrom(seededSession(), overrides);
}

function activeSnapshot(overrides = {}) {
  const session = new Session();
  session.submit({ commands: COMMANDS, play: true, source: 'human' });
  session.tick(40);
  return snapshotFrom(session, overrides);
}

function activeCommandSnapshot(command) {
  const session = new Session();
  session.submit({ commands: [command], play: true, source: 'human' });
  session.tick(40);
  return snapshotFrom(session);
}

function committedSnapshot(overrides = {}) {
  const session = new Session();
  session.submit({ commands: COMMANDS, immediate: true, play: false, source: 'human' });
  return snapshotFrom(session, overrides);
}

function project(overrides = {}) {
  return { ...seededSession().project(), ...overrides };
}

function committedProject(overrides = {}) {
  const session = new Session();
  session.submit({ commands: COMMANDS, immediate: true, play: false, source: 'human' });
  return { ...session.project(), ...overrides };
}

async function serve(body, run) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => JSON.stringify(body),
  });
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

const client = () => new StudioApi({ timeoutMs: 1000 });

test('each endpoint resolves only its current validated shape', async () => {
  await serve(pendingSnapshot(), async () => {
    const api = client();
    assert.ok((await api.fetchState()).instanceId);
    assert.ok((await api.sendCommands([{ type: 'stroke' }])).instanceId);
    assert.ok((await api.sendControl('pause')).instanceId);
    assert.ok((await api.createComment({
      requestId: 'request-9',
      text: 'note',
      rect: null,
      continuePlayback: false,
      expectedDocGeneration: 'generation-1',
      expectedArtRevision: 0,
    })).instanceId);
    assert.ok((await api.resolveComment({
      id: 'comment-1',
      reopen: false,
      expectedDocGeneration: 'generation-1',
      expectedSeq: 1,
    })).instanceId);
    assert.ok((await api.loadProject(project())).instanceId);
    assert.ok((await api.loadDemo()).instanceId);
  });
  await serve(project(), async () => {
    const data = await client().fetchProject();
    assert.equal(data.format, 'codesketch');
    assert.equal(data.version, 2);
  });
});

test('accepts an unchanged envelope only for a state read with instance context', async () => {
  const unchanged = { unchanged: true, heartbeat: { lastSeenAt: null } };
  await serve(unchanged, async () => {
    const api = client();
    assert.equal((await api.fetchState(3, 'instance-1')).unchanged, true);
    await assert.rejects(api.fetchState(), (error) => error.name === 'ProtocolError');
    await assert.rejects(api.sendControl('pause'), (error) => error.name === 'ProtocolError');
  });
});

test('rejects mutation responses shaped as project envelopes', async () => {
  await serve(project(), async () => {
    const api = client();
    await assert.rejects(api.sendCommands([{ type: 'stroke' }]), (error) => error.name === 'ProtocolError');
    await assert.rejects(api.loadDemo(), (error) => error.name === 'ProtocolError');
  });
});

test('resolves active playback for every current command kind', async () => {
  for (const command of COMMANDS) {
    await serve(activeCommandSnapshot(command), async () => {
      const data = await client().fetchState();
      assert.equal(data.playback.active.command.type, command.type);
    });
  }
});

test('rejects snapshots with malformed fields and nested data', async () => {
  const base = pendingSnapshot();
  const playing = activeSnapshot();
  const committed = committedSnapshot();
  const withMark = (mark) => ({ ...committed, document: { ...committed.document, marks: [mark] } });
  const stroke = { type: 'stroke', layer: 'paint', color: '#253d38', opacity: 1, size: 8, brush: 'brush', points: [[10, 10]] };
  const shape = { type: 'rect', layer: 'paint', color: '#253d38', opacity: 1, x: 0, y: 0, width: 10, height: 10 };
  const activeWith = (command) => ({ ...playing, playback: { ...playing.playback, active: { command, progress: 0.3 } } });
  const cases = [
    ['missing instanceId', pendingSnapshot({ instanceId: '' })],
    ['negative revision', pendingSnapshot({ revision: -1 })],
    ['fractional revision', pendingSnapshot({ revision: 1.5 })],
    ['empty docGeneration', pendingSnapshot({ docGeneration: '' })],
    ['negative controlEpoch', pendingSnapshot({ controlEpoch: -1 })],
    ['nonboolean requiresGrant', pendingSnapshot({ requiresGrant: 'yes' })],
    ['incoherent activeGrant', pendingSnapshot({
      activeGrant: { docGeneration: 'other-generation', controlEpoch: base.controlEpoch, grantToken: 'token-1' },
    })],
    ['null document', pendingSnapshot({ document: null })],
    ['wrong document version', pendingSnapshot({ document: { ...base.document, version: 2 } })],
    ['nonfixed document width', pendingSnapshot({ document: { ...base.document, width: 900 } })],
    ['layer opacity out of range', pendingSnapshot({
      document: { ...base.document, layers: [{ ...base.document.layers[0], opacity: 2 }] },
    })],
    ['nonarray marks', pendingSnapshot({ document: { ...base.document, marks: 'none' } })],
    ['null mark', withMark(null)],
    ['unknown mark type', withMark({ type: 'select', layer: 'paint' })],
    ['fill stored as mark', withMark({ type: 'fill', color: '#112233' })],
    ['stroke missing color', withMark({ ...stroke, color: undefined })],
    ['stroke missing size', withMark({ ...stroke, size: undefined })],
    ['stroke missing opacity', withMark({ ...stroke, opacity: undefined })],
    ['stroke missing brush', withMark({ ...stroke, brush: undefined })],
    ['stroke missing points', withMark({ ...stroke, points: undefined })],
    ['stroke empty points', withMark({ ...stroke, points: [] })],
    ['stroke unknown brush', withMark({ ...stroke, brush: 'crayon' })],
    ['stroke size out of range', withMark({ ...stroke, size: 200 })],
    ['stroke point out of bounds', withMark({ ...stroke, points: [[2000, 10]] })],
    ['stroke malformed point', withMark({ ...stroke, points: [[10]] })],
    ['shape zero width', withMark({ ...shape, width: 0 })],
    ['shape exceeds canvas', withMark({ ...shape, x: 990, width: 20 })],
    ['shape missing bounds', withMark({ ...shape, y: undefined })],
    ['uppercase playback status', pendingSnapshot({ playback: { ...playing.playback, status: 'PLAYING' } })],
    ['speed out of range', pendingSnapshot({ playback: { ...base.playback, speed: 20 } })],
    ['negative remaining', pendingSnapshot({ playback: { ...base.playback, remaining: -1 } })],
    ['active progress out of range', pendingSnapshot({
      playback: { ...playing.playback, active: { command: COMMANDS[0], progress: 1.5 } },
    })],
    ['empty active command', activeWith({})],
    ['active unknown command kind', activeWith({ type: 'nope' })],
    ['active stroke missing fields', activeWith({ ...COMMANDS[0], points: undefined })],
    ['negative history cursor', pendingSnapshot({ history: { cursor: -1, total: 0 } })],
    ['cursor beyond total', pendingSnapshot({ history: { cursor: 5, total: 4 } })],
    ['nonarray comments', pendingSnapshot({ comments: 'none' })],
    ['invalid comment status', pendingSnapshot({ comments: [comment({ status: 'closed' })] })],
    ['invalid comment seq', pendingSnapshot({ comments: [comment({ seq: 0 })] })],
    ['invalid comment rect', pendingSnapshot({ comments: [comment({ rect: { x: -1, y: 0, width: 5, height: 5 } })] })],
    ['numeric storageError', pendingSnapshot({ storageError: 3 })],
    ['numeric heartbeat timestamp', pendingSnapshot({ heartbeat: { lastSeenAt: 7 } })],
    ['project envelope on state read', project()],
  ];
  for (const [label, body] of cases) {
    await serve(body, async () => {
      await assert.rejects(client().fetchState(), (error) => {
        assert.equal(error.name, 'ProtocolError', label);
        return true;
      }, label);
    });
  }
});

test('rejects project reads that are not current codesketch v2', async () => {
  const cases = [
    ['obsolete version', project({ version: 1 })],
    ['recovery format', project({ format: 'codesketch-recovery' })],
    ['null queue', project({ queue: null })],
    ['cursor beyond commands', project({ cursor: 50 })],
    ['malformed command', project({ commands: [{ type: 'nope' }] })],
    ['malformed queued command', project({ queue: [null] })],
    ['invalid nested comment', project({ comments: [comment({ status: 'closed' })] })],
    ['snapshot envelope', pendingSnapshot()],
  ];
  for (const [label, body] of cases) {
    await serve(body, async () => {
      await assert.rejects(client().fetchProject(), (error) => {
        assert.equal(error.name, 'ProtocolError', label);
        return true;
      }, label);
    });
  }
});

test('validators accept current envelopes and reject obsolete forms', () => {
  assert.equal(snapshotProblem(pendingSnapshot()), null);
  assert.equal(snapshotProblem(activeSnapshot()), null);
  assert.equal(snapshotProblem(committedSnapshot()), null);
  assert.equal(projectProblem(project()), null);
  assert.equal(projectProblem(committedProject()), null);
  assert.equal(unchangedProblem({ unchanged: true, heartbeat: { lastSeenAt: null } }), null);
  assert.equal(snapshotProblem(pendingSnapshot({
    comments: [comment({ request: { id: 'request-2', fingerprint: '{}' } })],
  })), null);

  const unchanged = { unchanged: true, heartbeat: { lastSeenAt: null } };
  assert.equal(typeof unchangedProblem({ unchanged: true }), 'string');
  assert.equal(typeof snapshotProblem(project()), 'string');
  assert.equal(typeof snapshotProblem(unchanged), 'string');
  assert.equal(typeof projectProblem(pendingSnapshot()), 'string');
  assert.equal(stateReadExpect(true)(unchanged), null);
  assert.equal(typeof stateReadExpect(false)(unchanged), 'string');
  assert.equal(stateReadExpect(false)(pendingSnapshot()), null);
});
