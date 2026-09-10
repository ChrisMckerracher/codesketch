import test from 'node:test';
import assert from 'node:assert/strict';
import { StudioApi } from '../src/studio/api.mjs';

function snapshot() {
  return {
    instanceId: 'instance-1',
    revision: 3,
    artRevision: 2,
    docGeneration: 'generation-1',
    controlEpoch: 1,
    requiresGrant: false,
    activeGrant: null,
    document: {
      version: 1,
      width: 1000,
      height: 700,
      background: '#f7f3e8',
      layers: [{ id: 'paint', name: 'Painting', visible: true, opacity: 1 }],
      marks: [],
    },
    playback: { status: 'paused', speed: 1, remaining: 0, active: null },
    history: { cursor: 0, total: 0 },
    comments: [],
    storageError: null,
    playbackError: null,
    heartbeat: { lastSeenAt: null },
  };
}

function jsonResponse(body) {
  return { ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify(body) };
}

async function captureCalls(run) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (path, init = {}) => {
    calls.push({ path, body: JSON.parse(init.body) });
    return jsonResponse(snapshot());
  };
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
  return calls;
}

test('human methods send expectedDocGeneration top-level beside source human', async () => {
  const calls = await captureCalls(async () => {
    const api = new StudioApi({ timeoutMs: 1000 });
    await api.sendCommands([{ type: 'stroke' }], {
      expectedDocGeneration: 'gen-1',
      replace: true,
      play: false,
      immediate: true,
    });
    await api.sendControl('pause', { expectedDocGeneration: 'gen-1' });
    await api.sendControl('speed', { expectedDocGeneration: 'gen-1', speed: 4 });
    await api.loadProject({ format: 'codesketch' }, { expectedDocGeneration: 'gen-1' });
    await api.loadDemo({ expectedDocGeneration: 'gen-1' });
  });
  assert.deepEqual(calls.map((call) => call.path),
    ['/api/commands', '/api/control', '/api/control', '/api/project', '/api/demo']);
  assert.deepEqual(calls[0].body, {
    commands: [{ type: 'stroke' }],
    replace: true,
    play: false,
    immediate: true,
    source: 'human',
    expectedDocGeneration: 'gen-1',
  });
  assert.deepEqual(calls[1].body, { action: 'pause', source: 'human', expectedDocGeneration: 'gen-1' });
  assert.deepEqual(calls[2].body, { action: 'speed', source: 'human', expectedDocGeneration: 'gen-1', speed: 4 });
  assert.deepEqual(calls[3].body, {
    project: { format: 'codesketch' },
    source: 'human',
    expectedDocGeneration: 'gen-1',
  });
  assert.deepEqual(calls[4].body, { source: 'human', expectedDocGeneration: 'gen-1' });
});

test('missing or invalid context rejects before any fetch', async () => {
  let fetches = 0;
  await captureCalls(async () => {
    const api = new StudioApi({ timeoutMs: 1000 });
    const original = globalThis.fetch;
    globalThis.fetch = async () => {
      fetches += 1;
      return original();
    };
    try {
      for (const expectedDocGeneration of [undefined, '', null, 5]) {
        await assert.rejects(api.sendCommands([], { expectedDocGeneration }), TypeError);
        await assert.rejects(api.loadProject({}, { expectedDocGeneration }), TypeError);
        await assert.rejects(api.loadDemo({ expectedDocGeneration }), TypeError);
      }
      await assert.rejects(api.sendCommands([]), TypeError);
      await assert.rejects(api.loadProject({}), TypeError);
      await assert.rejects(api.loadDemo(), TypeError);
      await assert.rejects(api.sendControl('pause'), TypeError);
      await assert.rejects(api.sendControl('speed', 4), TypeError);
      await assert.rejects(api.sendControl('pause', null), TypeError);
    } finally {
      globalThis.fetch = original;
    }
  });
  assert.equal(fetches, 0, 'invalid context performs zero fetches');
});

test('a supplied generation string is sent unchanged', async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (path, init = {}) => {
    calls.push(JSON.parse(init.body));
    return jsonResponse(snapshot());
  };
  try {
    const api = new StudioApi({ timeoutMs: 1000 });
    await api.sendCommands([{ type: 'stroke' }], { expectedDocGeneration: 'stale-generation' });
    await assert.rejects(api.loadDemo({ expectedDocGeneration: '' }), TypeError);
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(calls.length, 1, 'only the valid request fetches');
  assert.equal(calls[0].expectedDocGeneration, 'stale-generation');
});

test('comment methods keep their existing signatures', async () => {
  const calls = await captureCalls(async () => {
    const api = new StudioApi({ timeoutMs: 1000 });
    await api.createComment({
      requestId: 'request-1',
      text: 'note',
      rect: null,
      continuePlayback: false,
      expectedDocGeneration: 'gen-1',
      expectedArtRevision: 0,
    });
    await api.resolveComment({ id: 'comment-1', reopen: false, expectedDocGeneration: 'gen-1', expectedSeq: 1 });
  });
  assert.deepEqual(calls.map((call) => call.path), ['/api/comments', '/api/comments/resolve']);
  assert.equal(calls[0].body.requestId, 'request-1');
  assert.equal(calls[0].body.expectedDocGeneration, 'gen-1');
  assert.deepEqual(calls[1].body, {
    id: 'comment-1',
    reopen: false,
    expectedDocGeneration: 'gen-1',
    expectedSeq: 1,
  });
});
