import test from 'node:test';
import assert from 'node:assert/strict';
import { StudioState } from '../src/studio/state.mjs';
import { createModel } from '../src/studio/model/index.mjs';
import { StudioRequests } from '../src/studio/requests/index.mjs';
import { createReview } from '../src/studio/review/index.mjs';

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
    artRevision: 0,
    ...overrides,
  };
}

const paused = (overrides = {}) => snapshot({
  playback: { status: 'paused', speed: 1, remaining: 0, active: null }, ...overrides });

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
  const model = createModel(state);
  const calls = [];
  const dispatchIntents = [];
  const api = {
    sendControl(action, context) {
      const control = deferred();
      calls.push({ method: 'sendControl', args: [action, context], control });
      return control.promise;
    },
    createComment(body) {
      const control = deferred();
      calls.push({ method: 'createComment', args: [body], control });
      return control.promise;
    },
    resolveComment(body) {
      const control = deferred();
      calls.push({ method: 'resolveComment', args: [body], control });
      return control.promise;
    },
    fetchState(since, instanceId) {
      const control = deferred();
      calls.push({ method: 'fetchState', args: [since, instanceId], control });
      return control.promise;
    },
  };
  const requests = new StudioRequests({ api, acceptSnapshot: (candidate) => state.setSnapshot(candidate) });
  const dispatch = (intent) => {
    dispatchIntents.push(intent);
    return requests.pause({ expectedDocGeneration: intent.generation });
  };
  const review = createReview({ model, requests, dispatch });
  return { state, model, calls, dispatchIntents, requests, observe: (c) => requests.observe(c), review };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const region = { x: 10, y: 20, width: 300, height: 200 };
const pauseCall = (calls, index = 0) => calls.filter((call) => call.method === 'sendControl')[index];

test('begin pauses through dispatch and activates region selection on the confirmed context', async () => {
  const { model, calls, dispatchIntents, observe, review } = build();
  observe(snapshot({ revision: 1 }));
  const begun = review.handle({ type: 'review.begin', scope: 'region' });
  assert.ok(begun instanceof Promise);
  assert.deepEqual(dispatchIntents[0],
    { type: 'playback.control', action: 'pause', generation: 'gen-1' });
  assert.deepEqual(calls[0].args, ['pause', { expectedDocGeneration: 'gen-1' }]);
  assert.equal(model.get().review.phase, 'pausing');
  calls[0].control.resolve(paused({ revision: 2, controlEpoch: 1, artRevision: 4 }));
  const confirmed = await begun;
  assert.equal(confirmed.controlEpoch, 1, 'the confirmed snapshot resolves');
  assert.equal(model.get().review.phase, 'selecting');
  assert.equal(model.get().review.artRevision, 4, 'the art revision freezes at the accepted pause');
  assert.equal(model.get().review.controlEpoch, 1, 'the confirmed pause epoch freezes for submission');
  assert.equal(model.get().tool, 'comment');
  assert.equal(model.get().tab, 'feedback');
  assert.deepEqual(model.get().drawers, { left: true, right: false });
});

test('whole scope activates the composer with the frozen art revision', async () => {
  const { model, calls, observe, review } = build();
  observe(snapshot({ revision: 1 }));
  const begun = review.handle({ type: 'review.begin', scope: 'whole' });
  calls[0].control.resolve(paused({ revision: 2, controlEpoch: 1, artRevision: 4 }));
  await begun;
  assert.equal(model.get().review.phase, 'composing');
  assert.equal(model.get().review.rect, null);
  assert.equal(model.get().review.artRevision, 4);
});

test('an art change during region selection goes stale before any rect', async () => {
  const { model, calls, observe, review } = build();
  observe(snapshot({ revision: 1 }));
  model.patch({ review: { ...model.get().review, text: 'drag note' } });
  const begun = review.handle({ type: 'review.begin', scope: 'whole' });
  calls[0].control.resolve(paused({ revision: 2, controlEpoch: 1, artRevision: 4 }));
  await begun;
  observe(paused({ revision: 3, controlEpoch: 1, artRevision: 5 }));
  assert.equal(model.get().review.phase, 'stale', 'the drag is stale after artwork moved');
  assert.equal(model.get().review.text, 'drag note');
});

test('a control epoch change during composing goes stale with text preserved', async () => {
  const { model, calls, observe, review } = build();
  observe(snapshot({ revision: 1 }));
  const begun = review.handle({ type: 'review.begin', scope: 'whole' });
  calls[0].control.resolve(paused({ revision: 2, controlEpoch: 1, artRevision: 4 }));
  await begun;
  review.handle({ type: 'review.text', text: 'keep this draft' });
  observe(paused({ revision: 3, controlEpoch: 2, artRevision: 4 }));
  assert.equal(model.get().review.phase, 'stale');
  assert.equal(model.get().review.text, 'keep this draft');
});

test('review.rect keeps the frozen revision and moves to composing', async () => {
  const { model, calls, observe, review } = build();
  observe(snapshot({ revision: 1 }));
  const begun = review.handle({ type: 'review.begin', scope: 'region' });
  calls[0].control.resolve(paused({ revision: 2, controlEpoch: 1, artRevision: 4 }));
  await begun;
  await assert.rejects(review.handle({ type: 'review.rect', rect: { x: 990, y: 0, width: 20, height: 5 } }),
    (error) => error.outcome === 'validation');
  assert.equal(model.get().review.phase, 'selecting');
  await review.handle({ type: 'review.rect', rect: region });
  assert.equal(model.get().review.phase, 'composing');
  assert.deepEqual(model.get().review.rect, region);
  assert.equal(model.get().review.artRevision, 4, 'setRect keeps the frozen revision');
});

test('cancel expires the pause and preserves text without resuming playback', async () => {
  const { model, dispatchIntents, calls, observe, review } = build();
  observe(snapshot({ revision: 1 }));
  const begun = review.handle({ type: 'review.begin', scope: 'whole' });
  pauseCall(calls).control.resolve(paused({ revision: 2, controlEpoch: 1, artRevision: 4 }));
  await begun;
  review.handle({ type: 'review.text', text: 'keep this note' });
  review.handle({ type: 'review.cancel' });
  assert.equal(model.get().review.phase, 'closed');
  assert.equal(model.get().review.text, 'keep this note');
  assert.deepEqual(dispatchIntents.filter((intent) => intent.action === 'resume'), [],
    'cancel never resumes playback');
});

test('cancelling during the deferred pause rejects begin and swallows the late ack', async () => {
  const { model, calls, observe, review } = build();
  observe(snapshot({ revision: 1 }));
  const begun = review.handle({ type: 'review.begin', scope: 'region' });
  await settle();
  review.handle({ type: 'review.cancel' });
  await assert.rejects(begun, (error) => error.outcome === 'stale');
  calls[0].control.resolve(paused({ revision: 2, controlEpoch: 1 }));
  await settle();
  assert.equal(model.get().review.phase, 'closed', 'the late ack activates nothing');
});

test('reselect from stale acquires a fresh pause and refreezes the art revision', async () => {
  const { model, calls, dispatchIntents, observe, review } = build();
  observe(snapshot({ revision: 1 }));
  const begun = review.handle({ type: 'review.begin', scope: 'region' });
  pauseCall(calls, 0).control.resolve(paused({ revision: 2, controlEpoch: 1, artRevision: 4 }));
  await begun;
  review.handle({ type: 'review.rect', rect: region });
  review.handle({ type: 'review.text', text: 'stale note' });
  observe(paused({ revision: 3, controlEpoch: 1, artRevision: 5 }));
  assert.equal(model.get().review.phase, 'stale');
  const reselected = review.handle({ type: 'review.reselect' });
  assert.equal(model.get().review.phase, 'pausing', 'reselect acquires a fresh pause');
  assert.equal(model.get().review.text, 'stale note', 'the text is preserved');
  assert.deepEqual(dispatchIntents[1],
    { type: 'playback.control', action: 'pause', generation: 'gen-1' },
    'the fresh pause goes through the handshake, not a status glance');
  pauseCall(calls, 1).control.resolve(paused({ revision: 4, controlEpoch: 2, artRevision: 6 }));
  await reselected;
  assert.equal(model.get().review.phase, 'selecting');
  await review.handle({ type: 'review.rect', rect: region });
  assert.equal(model.get().review.artRevision, 6, 'the fresh pause refroze the revision');
});

test('a newer paused snapshot at the same epoch still activates with its own revision', async () => {
  const { model, calls, observe, review } = build();
  observe(snapshot({ revision: 1 }));
  const begun = review.handle({ type: 'review.begin', scope: 'whole' });
  await settle();
  observe(paused({ revision: 3, controlEpoch: 1, artRevision: 9 }));
  calls[0].control.resolve(paused({ revision: 2, controlEpoch: 1, artRevision: 4 }));
  await begun;
  assert.equal(model.get().review.phase, 'composing', 'the newer same-epoch pause activates');
  assert.equal(model.get().review.artRevision, 9, 'the frozen revision comes from the latest snapshot');
});

test('reselect from composing reacquires the pause with scope and text intact', async () => {
  const { model, calls, observe, review } = build();
  observe(snapshot({ revision: 1 }));
  const begun = review.handle({ type: 'review.begin', scope: 'whole' });
  pauseCall(calls, 0).control.resolve(paused({ revision: 2, controlEpoch: 1, artRevision: 4 }));
  await begun;
  review.handle({ type: 'review.text', text: 'whole note' });
  const reselected = review.handle({ type: 'review.reselect' });
  assert.equal(model.get().review.phase, 'pausing');
  pauseCall(calls, 1).control.resolve(paused({ revision: 3, controlEpoch: 2, artRevision: 5 }));
  await reselected;
  assert.equal(model.get().review.phase, 'composing');
  assert.equal(model.get().review.text, 'whole note');
  assert.equal(model.get().review.artRevision, 5);
});

test('generation rotation during composing goes stale with text preserved', async () => {
  const { model, calls, observe, review } = build();
  observe(snapshot({ revision: 1 }));
  const begun = review.handle({ type: 'review.begin', scope: 'whole' });
  pauseCall(calls).control.resolve(paused({ revision: 2, controlEpoch: 1 }));
  await begun;
  review.handle({ type: 'review.text', text: 'carried forward' });
  observe(paused({ revision: 3, controlEpoch: 1, docGeneration: 'gen-2' }));
  assert.equal(model.get().review.phase, 'stale');
  assert.equal(model.get().review.text, 'carried forward');
});

test('generation rotation during the deferred pause rejects begin without activation', async () => {
  const { model, calls, observe, review } = build();
  observe(snapshot({ revision: 1 }));
  const begun = review.handle({ type: 'review.begin', scope: 'region' });
  await settle();
  observe(snapshot({ revision: 1, instanceId: 'inst-2', docGeneration: 'gen-2' }));
  await assert.rejects(begun, (error) => error.outcome === 'stale');
  pauseCall(calls).control.resolve(paused({ revision: 2, controlEpoch: 1 }));
  await settle();
  assert.equal(model.get().review.phase, 'closed');
});

test('destroy rejects the pending pause and suppresses late activation', async () => {
  const { model, calls, observe, review } = build();
  observe(snapshot({ revision: 1 }));
  const begun = review.handle({ type: 'review.begin', scope: 'region' });
  await settle();
  review.destroy();
  await assert.rejects(begun, (error) => error.outcome === 'stale');
  pauseCall(calls).control.resolve(paused({ revision: 2, controlEpoch: 1 }));
  await settle();
  assert.equal(model.get().review.phase, 'closed', 'destroy closes the review while keeping text');
  assert.equal(model.get().review.text, '');
  assert.equal(review.handle({ type: 'review.begin', scope: 'whole' }), false);
});

test('review transitions gate on the current item status and send exact context', async () => {
  const { calls, observe, review } = build();
  const comment = { id: 'c1', number: 1, seq: 3, text: 'Fix this', rect: null, status: 'addressed',
    cursor: 0, artRevision: 0, at: 'at', acknowledgedAt: null, addressedAt: null, resolvedAt: null,
    visibleLayers: [], request: null };
  observe(paused({ revision: 2, comments: [comment] }));
  const first = review.handle({ type: 'review.transition', id: 'c1' });
  calls.at(-1).control.resolve(paused({ revision: 3 }));
  await first;
  assert.deepEqual(calls.at(-1).args, [{
    id: 'c1', reopen: false, source: 'human', expectedDocGeneration: 'gen-1', expectedSeq: 3,
  }]);
  const open = { ...comment, id: 'c2', status: 'open' };
  observe(paused({ revision: 3, comments: [open] }));
  await assert.rejects(review.handle({ type: 'review.transition', id: 'c2' }),
    (error) => error.outcome === 'validation');
  await assert.rejects(review.handle({ type: 'review.transition', id: 'missing' }),
    (error) => error.outcome === 'validation');
  const acknowledged = { ...comment, id: 'c3', status: 'acknowledged' };
  observe(paused({ revision: 4, comments: [acknowledged] }));
  const reopen = review.handle({ type: 'review.transition', id: 'c3', reopen: true });
  calls.at(-1).control.resolve(paused({ revision: 5 }));
  await reopen;
  assert.deepEqual(calls.at(-1).args, [{
    id: 'c3', reopen: true, source: 'human', expectedDocGeneration: 'gen-1', expectedSeq: 3,
  }]);
});
