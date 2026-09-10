import test from 'node:test';
import assert from 'node:assert/strict';
import { StudioRequests } from '../src/studio/requests/index.mjs';
import { StudioState } from '../src/studio/state.mjs';

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

function build() {
  const state = new StudioState();
  const calls = [];
  const api = {
    fetchState(since, instanceId) {
      const control = deferred();
      calls.push({ method: 'fetchState', args: [since, instanceId], control });
      return control.promise;
    },
    sendControl(action, context) {
      const control = deferred();
      calls.push({ method: 'sendControl', args: [action, context], control });
      return control.promise;
    },
    sendCommands() {
      const control = deferred();
      calls.push({ method: 'sendCommands', control });
      return control.promise;
    },
  };
  const requests = new StudioRequests({
    api,
    acceptSnapshot: (candidate) => state.setSnapshot(candidate),
  });
  return { state, api, calls, requests };
}

const paused = (overrides = {}) => snapshot({
  playback: { status: 'paused', speed: 1, remaining: 0, active: null }, ...overrides });
const sendCalls = (calls) => calls.filter((call) => call.method === 'sendCommands');
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('pause cancels unsent work and waits for the sent write', async () => {
  const { state, api, calls, requests } = build();
  requests.observe(snapshot({ revision: 1 }));
  const first = requests.mutate({ expectedDocGeneration: 'gen-1', run: () => api.sendCommands() });
  const second = requests.mutate({ expectedDocGeneration: 'gen-1', run: () => api.sendCommands() });
  const pause = requests.pause({ expectedDocGeneration: 'gen-1' });
  await assert.rejects(second, (error) => error.outcome === 'stale');
  assert.equal(calls.filter((call) => call.method === 'sendControl').length, 0,
    'pause waits for the sent write to settle');
  sendCalls(calls)[0].control.resolve(paused({ revision: 2 }));
  await first;
  await settle();
  const pauseCall = calls.find((call) => call.method === 'sendControl');
  assert.deepEqual(pauseCall.args, ['pause', { expectedDocGeneration: 'gen-1' }]);
  pauseCall.control.resolve(paused({ revision: 3, controlEpoch: 1 }));
  const ack = await pause;
  assert.equal(ack.playback.status, 'paused');
  assert.equal(state.snapshot.playback.status, 'paused', 'the pause ack is observed');
});

test('an uncertain write then same-generation refresh permits one pause without replay', async () => {
  const { api, calls, requests } = build();
  requests.observe(snapshot({ revision: 1 }));
  const mutation = requests.mutate({ expectedDocGeneration: 'gen-1', run: () => api.sendCommands() });
  sendCalls(calls)[0].control.reject(new TypeError('network down'));
  const failure = await mutation.then(() => null, (error) => error);
  assert.equal(failure.outcome, 'uncertain');
  const pause = requests.pause({ expectedDocGeneration: 'gen-1' });
  await settle();
  const refresh = calls.find((call) => call.method === 'fetchState');
  assert.deepEqual(refresh.args, [null, null], 'the pause waits for one unconditional refresh');
  refresh.control.resolve(paused({ revision: 5 }));
  await settle();
  const pauseCall = calls.find((call) => call.method === 'sendControl');
  assert.deepEqual(pauseCall.args, ['pause', { expectedDocGeneration: 'gen-1' }]);
  assert.equal(sendCalls(calls).length, 1, 'the uncertain write never replays');
  pauseCall.control.resolve(paused({ revision: 6, controlEpoch: 1 }));
  const result = await pause;
  assert.equal(result.controlEpoch, 1);
});

test('generation rotation during the pause refresh rejects without rebinding', async () => {
  const { api, calls, requests } = build();
  requests.observe(snapshot({ revision: 1 }));
  const mutation = requests.mutate({ expectedDocGeneration: 'gen-1', run: () => api.sendCommands() });
  sendCalls(calls)[0].control.reject(new TypeError('network down'));
  await mutation.catch(() => {});
  const pause = requests.pause({ expectedDocGeneration: 'gen-1' });
  await settle();
  calls.find((call) => call.method === 'fetchState')
    .control.resolve(snapshot({ revision: 5, docGeneration: 'gen-2' }));
  await assert.rejects(pause, (error) => error.outcome === 'stale');
  assert.equal(calls.filter((call) => call.method === 'sendControl').length, 0,
    'pause never sends against a rotated generation');
});

test('pause resolves beside a newer paused snapshot at the same epoch and rejects at a newer epoch', async () => {
  const sameEpoch = build();
  sameEpoch.requests.observe(snapshot({ revision: 1, controlEpoch: 2 }));
  const accepting = sameEpoch.requests.pause({ expectedDocGeneration: 'gen-1' });
  await settle();
  sameEpoch.requests.observe(paused({ revision: 5, controlEpoch: 2 }));
  sameEpoch.calls.find((call) => call.method === 'sendControl')
    .control.resolve(paused({ revision: 4, controlEpoch: 2 }));
  assert.equal((await accepting).controlEpoch, 2, 'a newer paused snapshot coexists with the older ack');

  const newerEpoch = build();
  newerEpoch.requests.observe(snapshot({ revision: 1, controlEpoch: 2 }));
  const rejecting = newerEpoch.requests.pause({ expectedDocGeneration: 'gen-1' });
  await settle();
  newerEpoch.requests.observe(snapshot({ revision: 5, controlEpoch: 4 }));
  newerEpoch.calls.find((call) => call.method === 'sendControl')
    .control.resolve(paused({ revision: 4, controlEpoch: 2 }));
  await assert.rejects(rejecting, (error) => error.outcome === 'stale',
    'a later intervention makes the pause stale');
});

test('a resumed snapshot before the pause ack rejects the stale pause', async () => {
  const { state, calls, requests } = build();
  requests.observe(paused({ revision: 1, controlEpoch: 2 }));
  const pause = requests.pause({ expectedDocGeneration: 'gen-1' });
  await settle();
  requests.observe(snapshot({ revision: 5, controlEpoch: 3,
    playback: { status: 'playing', speed: 1, remaining: 0, active: null } }));
  calls.find((call) => call.method === 'sendControl')
    .control.resolve(paused({ revision: 4, controlEpoch: 2 }));
  await assert.rejects(pause, (error) => error.outcome === 'stale',
    'a later resume makes the pause result stale');
  assert.equal(state.snapshot.playback.status, 'playing', 'display keeps the resumed state');
});

test('a poll that rotates the generation before the ack rejects the pause', async () => {
  const { calls, requests } = build();
  requests.observe(snapshot({ revision: 1 }));
  const pause = requests.pause({ expectedDocGeneration: 'gen-1' });
  await settle();
  requests.observe(snapshot({ revision: 5, instanceId: 'inst-2', docGeneration: 'gen-2' }));
  calls.find((call) => call.method === 'sendControl')
    .control.resolve(paused({ revision: 6 }));
  await assert.rejects(pause, (error) => error.outcome === 'stale',
    'the pause never silently rebinds to the rotated generation');
});

test('a stale requested generation rejects before any send and frees the slot', async () => {
  const { calls, requests } = build();
  requests.observe(snapshot({ revision: 1 }));
  const pause = requests.pause({ expectedDocGeneration: 'old-generation' });
  await assert.rejects(pause, (error) => {
    assert.equal(error.outcome, 'stale');
    return true;
  }, 'a mismatched requested generation is stale');
  assert.equal(calls.filter((call) => call.method === 'sendControl').length, 0,
    'zero sends for a stale requested generation');
  const retry = requests.pause({ expectedDocGeneration: 'gen-1' });
  await settle();
  assert.ok(calls.find((call) => call.method === 'sendControl'),
    'the slot is usable again for a current-generation pause');
  calls.find((call) => call.method === 'sendControl').control.resolve(paused({ revision: 2, controlEpoch: 1 }));
  await retry;
});
