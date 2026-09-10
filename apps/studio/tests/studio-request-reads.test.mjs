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
  const heartbeats = [];
  const requests = new StudioRequests({
    api: {
      fetchState(since, instanceId) {
        const control = deferred();
        calls.push({ args: [since, instanceId], control });
        return control.promise;
      },
    },
    acceptSnapshot: (candidate) => state.setSnapshot(candidate),
    onHeartbeat: (heartbeat) => heartbeats.push(heartbeat),
  });
  return { state, calls, heartbeats, requests };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('invalidate during coalesced polling yields one unconditional follow-up with zero overlap', async () => {
  const { state, calls, requests } = build();
  requests.observe(snapshot({ revision: 1 }));
  const first = requests.readState();
  const second = requests.readState();
  assert.equal(calls.length, 1, 'coalesced onto one poll');
  assert.deepEqual(calls[0].args, [1, 'inst-1'], 'the synchronized read is conditional');
  requests.invalidate();
  calls[0].control.resolve(snapshot({ revision: 2 }));
  await settle();
  assert.equal(calls.length, 2, 'exactly one follow-up fetch');
  assert.deepEqual(calls[1].args, [null, null], 'the follow-up is an unconditional full read');
  calls[1].control.resolve(snapshot({ revision: 3 }));
  await Promise.all([first, second]);
  assert.equal(state.snapshot.revision, 3, 'both callers await the follow-up');
});

test('ordinary coalesced callers share one poll without requesting extra fetches', async () => {
  const { state, calls, requests } = build();
  requests.observe(snapshot({ revision: 1 }));
  const first = requests.readState();
  const second = requests.readState();
  const third = requests.readState();
  assert.equal(calls.length, 1, 'all callers share the single in-flight poll');
  calls[0].control.resolve(snapshot({ revision: 2 }));
  await Promise.all([first, second, third]);
  assert.equal(calls.length, 1, 'ordinary coalescing never forces a follow-up fetch');
  assert.equal(state.snapshot.revision, 2);
});

test('an invalidated full read applies nothing and waits for the follow-up', async () => {
  const { state, calls, requests } = build();
  const read = requests.readState();
  requests.invalidate();
  calls[0].control.resolve(snapshot({ revision: 2 }));
  await settle();
  assert.equal(state.snapshot, null, 'the superseded full response never observes');
  assert.equal(calls.length, 2, 'the required follow-up starts only after the fetch settles');
  calls[1].control.resolve(snapshot({ revision: 3 }));
  await read;
  assert.equal(state.snapshot.revision, 3, 'the follow-up establishes synchronization');
});

test('unchanged reads merge only the newest heartbeat within the generation', async () => {
  const { calls, heartbeats, requests } = build();
  requests.observe(snapshot({ revision: 1 }));
  let read = requests.readState();
  calls[0].control.resolve({ unchanged: true, heartbeat: { lastSeenAt: '2026-09-10T00:00:02Z' } });
  await read;
  assert.deepEqual(heartbeats, [{ lastSeenAt: '2026-09-10T00:00:02Z' }]);
  read = requests.readState();
  calls[1].control.resolve({ unchanged: true, heartbeat: { lastSeenAt: '2026-09-10T00:00:01Z' } });
  await read;
  assert.equal(heartbeats.length, 1, 'an older heartbeat never replaces the newest');
  read = requests.readState();
  calls[2].control.resolve({ unchanged: true, heartbeat: { lastSeenAt: '2026-09-10T00:00:03Z' } });
  await read;
  assert.deepEqual(heartbeats, [
    { lastSeenAt: '2026-09-10T00:00:02Z' },
    { lastSeenAt: '2026-09-10T00:00:03Z' },
  ]);
});

test('a heartbeat carried by an accepted full snapshot seeds the known stamp', async () => {
  const { calls, heartbeats, requests } = build();
  requests.observe(snapshot({ revision: 1, heartbeat: { lastSeenAt: '2026-09-10T00:00:05Z' } }));
  const read = requests.readState();
  calls[0].control.resolve({ unchanged: true, heartbeat: { lastSeenAt: '2026-09-10T00:00:04Z' } });
  await read;
  assert.deepEqual(heartbeats, [], 'an older unchanged heartbeat cannot replace the seeded stamp');
  const newer = requests.readState();
  calls[1].control.resolve({ unchanged: true, heartbeat: { lastSeenAt: '2026-09-10T00:00:06Z' } });
  await newer;
  assert.deepEqual(heartbeats, [{ lastSeenAt: '2026-09-10T00:00:06Z' }],
    'a newer unchanged heartbeat still advances presence');
});

test('an unchanged response for a retired identity is ignored', async () => {
  const { state, calls, heartbeats, requests } = build();
  requests.observe(snapshot({ revision: 1 }));
  const read = requests.readState();
  requests.observe(snapshot({ revision: 1, instanceId: 'inst-2', docGeneration: 'gen-2' }));
  calls[0].control.resolve({ unchanged: true, heartbeat: { lastSeenAt: '2026-09-10T00:00:09Z' } });
  await read;
  assert.deepEqual(heartbeats, [], 'the old-instance heartbeat is not applied');
  assert.equal(state.snapshot.instanceId, 'inst-2', 'the unchanged envelope never reaches observe');
  assert.equal(calls.length, 1, 'a stale unchanged read has no follow-up effects');
});

test('a failed read rejects and leaves the coordinator unsynchronized', async () => {
  const { calls, requests } = build();
  requests.observe(snapshot({ revision: 1 }));
  const read = requests.readState();
  calls[0].control.reject(new TypeError('offline'));
  await assert.rejects(read);
  const mutation = requests.mutate({ expectedDocGeneration: 'gen-1', run: () => {} });
  await assert.rejects(mutation, (error) => error.outcome === 'stale',
    'mutations require synchronization after a failed read');
});

test('a required follow-up survives an older failed read', async () => {
  const { state, calls, requests } = build();
  requests.observe(snapshot({ revision: 1 }));
  const read = requests.readState();
  requests.invalidate();
  calls[0].control.reject(new TypeError('offline'));
  await settle();
  assert.equal(calls.length, 2, 'the invalidation follow-up still runs');
  calls[1].control.resolve(snapshot({ revision: 2 }));
  await read;
  assert.equal(state.snapshot.revision, 2, 'the cycle resolves through the follow-up');
});

test('a full read the acceptance gate rejects cannot replace current display', async () => {
  const { state, calls, requests } = build();
  requests.observe(snapshot({ revision: 5, instanceId: 'inst-1' }));
  requests.observe(snapshot({ revision: 1, instanceId: 'inst-2', docGeneration: 'gen-2' }));
  const read = requests.readState();
  calls[0].control.resolve(snapshot({ revision: 99, instanceId: 'inst-1' }));
  await read;
  assert.equal(state.snapshot.instanceId, 'inst-2', 'the retired-instance snapshot is not applied');
  assert.equal(requests.synchronized, true, 'current synchronization survives the rejected read');
});
