import test from 'node:test';
import assert from 'node:assert/strict';
import { StudioRequests } from '../src/studio/requests/index.mjs';
import { StudioState } from '../src/studio/state.mjs';
import { StudioApi } from '../src/studio/api.mjs';

function snapshot(overrides = {}) {
  return {
    revision: 1,
    instanceId: 'inst-1',
    docGeneration: 'gen-1',
    controlEpoch: 0,
    requiresGrant: false,
    activeGrant: null,
    document: { version: 1, width: 1000, height: 700, background: '#f7f3e8', layers: [], marks: [] },
    playback: { status: 'idle', speed: 1, remaining: 0, active: null },
    history: { cursor: 0, total: 0 },
    comments: [],
    storageError: null,
    playbackError: null,
    heartbeat: { lastSeenAt: null },
    ...overrides,
  };
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

function fakeApi() {
  const calls = [];
  let offlineChanges = 0;
  return {
    calls,
    offlineChanges: () => offlineChanges,
    setOffline() { offlineChanges += 1; },
    fetchState(since, instanceId) {
      const control = deferred();
      calls.push({ method: 'fetchState', args: [since, instanceId], control });
      return control.promise;
    },
    sendCommands() {
      const control = deferred();
      calls.push({ method: 'sendCommands', control });
      return control.promise;
    },
  };
}

function build() {
  const state = new StudioState();
  const api = fakeApi();
  const requests = new StudioRequests({
    api,
    acceptSnapshot: (candidate) => state.setSnapshot(candidate),
  });
  return { state, api, requests };
}

const sendCalls = (api) => api.calls.filter((call) => call.method === 'sendCommands');
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('an older successful mutation ack resolves without regressing accepted state', async () => {
  const { state, api, requests } = build();
  requests.observe(snapshot({ revision: 1 }));
  const mutation = requests.mutate({ expectedDocGeneration: 'gen-1', run: () => api.sendCommands() });
  const poll = requests.readState();
  api.calls.find((call) => call.method === 'fetchState').control.resolve(snapshot({ revision: 5 }));
  await poll;
  assert.equal(state.snapshot.revision, 5);
  const ack = snapshot({ revision: 2 });
  sendCalls(api)[0].control.resolve(ack);
  const result = await mutation;
  assert.equal(result, ack, 'the known successful write resolves');
  assert.equal(state.snapshot.revision, 5, 'the older ack causes no rollback');
});

test('a newer successful ack is applied through the acceptance gate', async () => {
  const { state, api, requests } = build();
  requests.observe(snapshot({ revision: 1 }));
  const mutation = requests.mutate({ expectedDocGeneration: 'gen-1', run: () => api.sendCommands() });
  const poll = requests.readState();
  api.calls.find((call) => call.method === 'fetchState').control.resolve(snapshot({ revision: 5 }));
  await poll;
  sendCalls(api)[0].control.resolve(snapshot({ revision: 7 }));
  const result = await mutation;
  assert.equal(result.revision, 7);
  assert.equal(state.snapshot.revision, 7, 'the newer ack reaches the model');
});

test('rotation rejects unsent and late old-context intents without replay', async () => {
  const { state, api, requests } = build();
  requests.observe(snapshot({ revision: 1 }));
  const first = requests.mutate({ expectedDocGeneration: 'gen-1', run: () => api.sendCommands() });
  const second = requests.mutate({ expectedDocGeneration: 'gen-1', run: () => api.sendCommands() });
  assert.equal(sendCalls(api).length, 1, 'one sent mutation, one waiting');
  requests.observe(snapshot({ revision: 1, instanceId: 'inst-2', docGeneration: 'gen-2' }));
  await assert.rejects(second, (error) => error.outcome === 'stale');
  assert.equal(state.snapshot.docGeneration, 'gen-2', 'display keeps the rotated generation');
  sendCalls(api)[0].control.resolve(snapshot({ revision: 2 }));
  await assert.rejects(first, (error) => error.outcome === 'stale');
  assert.equal(state.snapshot.docGeneration, 'gen-2', 'the late ack does not rotate back');
  assert.equal(sendCalls(api).length, 1, 'the old intent is never replayed');
});

test('a generation-changing acknowledged document operation applies and cancels queued work', async () => {
  const { state, api, requests } = build();
  requests.observe(snapshot({ revision: 3 }));
  const demo = requests.mutate({ expectedDocGeneration: 'gen-1', run: () => api.sendCommands() });
  const queued = requests.mutate({ expectedDocGeneration: 'gen-1', run: () => api.sendCommands() });
  sendCalls(api)[0].control.resolve(snapshot({ revision: 4, docGeneration: 'gen-2' }));
  const result = await demo;
  assert.equal(result.docGeneration, 'gen-2', 'the rotating ack resolves');
  assert.equal(state.snapshot.docGeneration, 'gen-2', 'the resulting snapshot is accepted');
  await assert.rejects(queued, (error) => error.outcome === 'stale',
    'old queued work is cancelled after the rotation');
});

test('ordinary dispatch after a read failure requires synchronization first', async () => {
  const { api, requests } = build();
  requests.observe(snapshot({ revision: 1 }));
  const first = requests.mutate({ expectedDocGeneration: 'gen-1', run: () => api.sendCommands() });
  const second = requests.mutate({ expectedDocGeneration: 'gen-1', run: () => api.sendCommands() });
  const read = requests.readState();
  api.calls.find((call) => call.method === 'fetchState').control.reject(new TypeError('offline'));
  await assert.rejects(read);
  sendCalls(api)[0].control.resolve(snapshot({ revision: 2 }));
  await first;
  await assert.rejects(second, (error) => error.outcome === 'stale',
    'the queued intent waits for a fresh successful read');
  assert.equal(sendCalls(api).length, 1, 'the unsynchronized intent never runs');
});

test('mutation outcomes keep distinct categories without touching reachability', async () => {
  const { api, requests } = build();
  const attempt = async (cause) => {
    requests.observe(snapshot({ revision: 1 }));
    const mutation = requests.mutate({ expectedDocGeneration: 'gen-1', run: async () => { throw cause; } });
    return mutation.then(() => null, (error) => error);
  };
  const tagged = await attempt(Object.assign(new TypeError('bad input'), { code: 'INVALID_INPUT' }));
  assert.equal(tagged.outcome, 'validation');
  const conflict = await attempt(Object.assign(new Error('stale generation'), { status: 409 }));
  assert.equal(conflict.outcome, 'stale');
  assert.equal(conflict.status, 409, 'the HTTP status is preserved');
  const badRequest = await attempt(Object.assign(new Error('bad payload'), { status: 400 }));
  assert.equal(badRequest.outcome, 'validation');
  const server = await attempt(Object.assign(new Error('flush failed'), { status: 500 }));
  assert.equal(server.outcome, 'uncertain');
  const network = await attempt(new TypeError('network down'));
  assert.equal(network.outcome, 'uncertain');
  assert.equal(api.offlineChanges(), 0, 'coordinator errors never change reachability');
});

test('unsynchronized intents are rejected before run with zero fetches', async () => {
  const { api, requests } = build();
  let ran = 0;
  const mutation = requests.mutate({
    expectedDocGeneration: 'gen-1',
    run: () => { ran += 1; return Promise.resolve(snapshot()); },
  });
  await assert.rejects(mutation, (error) => error.outcome === 'stale');
  assert.equal(ran, 0, 'run is never invoked');
  assert.equal(api.calls.length, 0, 'zero fetches on the stale path');
});

test('tagged preflight failures are validation while untagged TypeErrors stay uncertain', async () => {
  const { requests } = build();
  requests.observe(snapshot({ revision: 1 }));
  let fetches = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => { fetches += 1; throw new Error('no fetch expected'); };
  try {
    const realApi = new StudioApi({ timeoutMs: 1000 });
    const tagged = await requests.mutate({
      expectedDocGeneration: 'gen-1',
      run: () => realApi.sendCommands([], {}),
    }).then(() => null, (error) => error);
    assert.equal(tagged.code, 'INVALID_INPUT');
    assert.equal(tagged.outcome, 'validation');
    assert.equal(fetches, 0, 'tagged preflight failures fetch nothing');
    requests.observe(snapshot({ revision: 2 }));
    const untagged = await requests.mutate({
      expectedDocGeneration: 'gen-1',
      run: async () => { throw new TypeError('socket hung up'); },
    }).then(() => null, (error) => error);
    assert.equal(untagged.outcome, 'uncertain', 'an untagged TypeError after run stays uncertain');
  } finally {
    globalThis.fetch = original;
  }
});
