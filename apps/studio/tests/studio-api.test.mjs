import test from 'node:test';
import assert from 'node:assert/strict';
import { StudioApi } from '../src/studio/api.mjs';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'Status',
    text: async () => JSON.stringify(body),
  };
}

function stalledBody(init) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    text: () => new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }),
  };
}

async function serve(handler, run) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

function recordingApi(timeoutMs) {
  const events = { offline: [], reconnects: 0, errors: [] };
  const api = new StudioApi({
    timeoutMs,
    onOfflineChange: (offline) => events.offline.push(offline),
    onReconnect: () => { events.reconnects += 1; },
    onError: (message) => events.errors.push(message),
  });
  return { api, events };
}

function spyOnClearTimeout() {
  const original = globalThis.clearTimeout;
  const cleared = [];
  globalThis.clearTimeout = (timer) => {
    cleared.push(timer);
    return original(timer);
  };
  return {
    cleared,
    restore: () => { globalThis.clearTimeout = original; },
  };
}

test('resolves a valid snapshot and cleans up the deadline timer on success', async () => {
  const { api, events } = recordingApi(150);
  await serve(async () => jsonResponse(snapshot()), async () => {
    const spy = spyOnClearTimeout();
    try {
      const data = await api.fetchState();
      assert.equal(data.instanceId, 'instance-1');
      assert.equal(spy.cleared.length, 1, 'deadline timer cleared once after success');
    } finally {
      spy.restore();
    }
  });
  await delay(300);
  assert.deepEqual(events.offline, [], 'no late deadline effects after success');
  assert.equal(events.reconnects, 0);
});

test('settles a stalled body at the deadline and reports offline without reconnect', async () => {
  const { api, events } = recordingApi(60);
  await serve(async (path, init = {}) => stalledBody(init), async () => {
    await assert.rejects(api.fetchState());
  });
  assert.deepEqual(events.offline, [true]);
  assert.equal(events.reconnects, 0, 'a stalled body announces no premature reconnect');
  assert.equal(api.isOffline, true);
});

test('cleans up the deadline timer after an HTTP error', async () => {
  const { api } = recordingApi(150);
  await serve(async () => jsonResponse({ error: 'rejected' }, 409), async () => {
    const spy = spyOnClearTimeout();
    try {
      await assert.rejects(api.sendCommands([{ type: 'stroke' }]), (error) => error.status === 409);
      assert.equal(spy.cleared.length, 1, 'deadline timer cleared once after failure');
    } finally {
      spy.restore();
    }
  });
});

test('reports offline when the body read fails', async () => {
  const { api, events } = recordingApi(500);
  await serve(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: () => Promise.reject(new TypeError('Failed to read body')),
  }), async () => {
    await assert.rejects(api.fetchState());
  });
  assert.deepEqual(events.offline, [true]);
});

test('caller cancellation rejects without declaring the server offline', async () => {
  const { api, events } = recordingApi(5000);
  const caller = new AbortController();
  await serve(async (path, init = {}) => stalledBody(init), async () => {
    const pending = api.request('/api/state', { signal: caller.signal });
    pending.catch(() => {});
    await delay(20);
    caller.abort();
    await assert.rejects(pending);
  });
  assert.deepEqual(events.offline, []);
  assert.deepEqual(events.errors, []);
  assert.equal(api.isOffline, false);
});

test('keeps the deadline active when a caller signal stays live', async () => {
  const { api, events } = recordingApi(50);
  const caller = new AbortController();
  await serve(async (path, init = {}) => stalledBody(init), async () => {
    const pending = api.request('/api/state', { signal: caller.signal });
    pending.catch(() => {});
    await delay(150);
    assert.equal(caller.signal.aborted, false);
    await assert.rejects(pending);
  });
  assert.deepEqual(events.offline, [true], 'the composed deadline still reports offline');
});

test('preserves HTTP status on a JSON error and announces reachability', async () => {
  const { api, events } = recordingApi(500);
  api.setOffline(true);
  await serve(async () => jsonResponse({ error: 'stale generation' }, 409), async () => {
    await assert.rejects(api.sendCommands([{ type: 'stroke' }]), (error) => {
      assert.equal(error.status, 409);
      assert.equal(error.message, 'stale generation');
      return true;
    });
  });
  assert.deepEqual(events.offline, [true, false], 'a complete HTTP error demonstrates reachability');
  assert.equal(events.reconnects, 1);
});

test('preserves HTTP status on a non-JSON error body', async () => {
  const { api, events } = recordingApi(500);
  await serve(async () => ({
    ok: false,
    status: 502,
    statusText: 'Bad Gateway',
    text: async () => '<html>gateway exploded</html>',
  }), async () => {
    await assert.rejects(api.fetchState(), (error) => {
      assert.equal(error.status, 502);
      assert.equal(error.message, '<html>gateway exploded</html>');
      return true;
    });
  });
  assert.deepEqual(events.offline, []);
});

test('rejects malformed and empty successful bodies as protocol errors', async () => {
  const { api, events } = recordingApi(500);
  await serve(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => '{"instanceId": "x",,}',
  }), async () => {
    await assert.rejects(api.fetchState(), (error) => {
      assert.equal(error.name, 'ProtocolError');
      assert.equal(error.protocol, true);
      return true;
    });
  });
  await serve(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => '',
  }), async () => {
    await assert.rejects(api.fetchState(), (error) => error.name === 'ProtocolError');
  });
  assert.deepEqual(events.offline, [], 'protocol errors do not announce recovery');
});

test('constructor validates timeoutMs and defaults to 10 seconds', () => {
  for (const bad of [0, -5, NaN, Infinity, '500', null]) {
    assert.throws(() => new StudioApi({ timeoutMs: bad }), TypeError);
  }
  assert.equal(new StudioApi({ timeoutMs: 25 }).timeoutMs, 25);
  assert.equal(new StudioApi().timeoutMs, 10000);
});

test('makes no automatic retries after a failed request', async () => {
  const { api } = recordingApi(500);
  let calls = 0;
  await serve(async () => {
    calls += 1;
    return jsonResponse({ error: 'boom' }, 500);
  }, async () => {
    await assert.rejects(api.fetchState());
  });
  assert.equal(calls, 1);
});
