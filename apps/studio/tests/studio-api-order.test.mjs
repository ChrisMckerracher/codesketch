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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function serveDeferred(run) {
  const original = globalThis.fetch;
  const pending = [];
  globalThis.fetch = async () => {
    const control = deferred();
    pending.push(control);
    return control.promise;
  };
  try {
    return await run(pending);
  } finally {
    globalThis.fetch = original;
  }
}

function recordingApi() {
  const events = { offline: [], reconnects: 0 };
  const api = new StudioApi({
    timeoutMs: 5000,
    onOfflineChange: (offline) => events.offline.push(offline),
    onReconnect: () => { events.reconnects += 1; },
  });
  return { api, events };
}

test('older failure cannot overwrite a newer valid success', async () => {
  await serveDeferred(async (pending) => {
    const { api, events } = recordingApi();
    const older = api.fetchState();
    const newer = api.fetchState();
    pending[1].resolve(jsonResponse(snapshot()));
    await newer;
    pending[0].reject(new TypeError('network down'));
    await assert.rejects(older);
    assert.deepEqual(events.offline, [], 'the older failure is suppressed');
    assert.equal(api.isOffline, false);
  });
});

test('older success cannot clear a newer failure and reconnect fires once', async () => {
  await serveDeferred(async (pending) => {
    const { api, events } = recordingApi();
    const older = api.fetchState();
    const newer = api.fetchState();
    pending[1].reject(new TypeError('network down'));
    await assert.rejects(newer);
    assert.deepEqual(events.offline, [true]);
    pending[0].resolve(jsonResponse(snapshot()));
    await older;
    assert.deepEqual(events.offline, [true], 'the older success is suppressed');
    assert.equal(api.isOffline, true);

    const recovery = api.fetchState();
    pending[2].resolve(jsonResponse(snapshot()));
    await recovery;
    assert.deepEqual(events.offline, [true, false]);
    assert.equal(events.reconnects, 1, 'reconnect fires exactly once');

    const relapse = api.fetchState();
    pending[3].reject(new TypeError('network down'));
    await assert.rejects(relapse);
    assert.deepEqual(events.offline, [true, false, true]);
    assert.equal(events.reconnects, 1);
  });
});

test('a newer invalid protocol result reserves ordering without changing connectivity', async () => {
  await serveDeferred(async (pending) => {
    const { api, events } = recordingApi();
    api.setOffline(true);
    const older = api.fetchState();
    const newer = api.fetchState();
    pending[1].resolve({ ok: true, status: 200, statusText: 'OK', text: async () => '{}' });
    await assert.rejects(newer, (error) => error.name === 'ProtocolError');
    assert.deepEqual(events.offline, [true], 'invalid protocol data leaves connectivity unchanged');
    pending[0].resolve(jsonResponse(snapshot()));
    await older;
    assert.deepEqual(events.offline, [true], 'the older valid response must not announce recovery');
    assert.equal(api.isOffline, true);
    assert.equal(events.reconnects, 0);

    const recovery = api.fetchState();
    pending[2].resolve(jsonResponse(snapshot()));
    await recovery;
    assert.deepEqual(events.offline, [true, false]);
    assert.equal(events.reconnects, 1, 'a subsequent valid request may reconnect once');
  });
});
