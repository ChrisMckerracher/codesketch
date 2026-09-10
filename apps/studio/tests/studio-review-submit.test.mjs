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
    playback: { status: 'paused', speed: 1, remaining: 0, active: null },
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
  const review = createReview({ model, requests, dispatch: (intent) => requests.pause({ expectedDocGeneration: intent.generation }) });
  const observe = (candidate) => requests.observe(candidate);
  const beginRegion = async () => {
    observe(snapshot({ revision: 1 }));
    const begun = review.handle({ type: 'review.begin', scope: 'region' });
    calls.find((call) => call.method === 'sendControl').control.resolve(
      paused({ revision: 2, controlEpoch: 1, artRevision: 4 }));
    await begun;
    review.handle({ type: 'review.rect', rect: { x: 10, y: 20, width: 300, height: 200 } });
  };
  return { model, calls, observe, review, beginRegion };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const commentCall = (calls) => calls.find((call) => call.method === 'createComment');
const pauseCall = (calls, index = 0) => calls.filter((call) => call.method === 'sendControl')[index];

test('submit freezes the exact request context and clears on success', async () => {
  const { model, calls, observe, review, beginRegion } = build();
  await beginRegion();
  review.handle({ type: 'review.text', text: '  Soften the hill  ' });
  review.handle({ type: 'review.hold', value: false });
  const submitting = review.handle({ type: 'review.submit' });
  assert.equal(model.get().review.phase, 'submitting');
  const body = commentCall(calls).args[0];
  assert.match(body.requestId, /^[0-9a-f-]{36}$/);
  assert.deepEqual({ text: body.text, rect: body.rect, continuePlayback: body.continuePlayback,
    expectedDocGeneration: body.expectedDocGeneration, expectedArtRevision: body.expectedArtRevision }, {
    text: 'Soften the hill', rect: { x: 10, y: 20, width: 300, height: 200 },
    continuePlayback: true, expectedDocGeneration: 'gen-1', expectedArtRevision: 4 });
  observe(paused({ revision: 3, controlEpoch: 2, artRevision: 4, comments: [] }));
  commentCall(calls).control.resolve(paused({ revision: 4, controlEpoch: 2, artRevision: 4 }));
  await submitting;
  assert.equal(model.get().review.phase, 'closed');
  assert.equal(model.get().review.text, '');
});

test('keep paused default sends continuePlayback false', async () => {
  const { calls, review, beginRegion } = build();
  await beginRegion();
  review.handle({ type: 'review.text', text: 'hold work' });
  const submitting = review.handle({ type: 'review.submit' });
  assert.equal(commentCall(calls).args[0].continuePlayback, false);
  commentCall(calls).control.resolve(paused({ revision: 3, controlEpoch: 1 }));
  await submitting;
});

test('submit validates the text before sending', async () => {
  const { calls, review, beginRegion } = build();
  await beginRegion();
  review.handle({ type: 'review.text', text: '   ' });
  await assert.rejects(review.handle({ type: 'review.submit' }),
    (error) => error.outcome === 'validation');
  assert.equal(calls.find((call) => call.method === 'createComment'), undefined);
  await assert.rejects(review.handle({ type: 'review.begin', scope: 'diagonal' }),
    (error) => error.outcome === 'validation', 'unknown scopes reject as validation');
});

test('a late submission cannot close a review that was replaced by a newer one', async () => {
  const { model, calls, observe, review, beginRegion } = build();
  await beginRegion();
  review.handle({ type: 'review.text', text: 'old submission' });
  const submitting = review.handle({ type: 'review.submit' });
  const newerBegin = review.handle({ type: 'review.begin', scope: 'region' });
  assert.equal(model.get().review.phase, 'pausing', 'the newer review supersedes the submission');
  commentCall(calls).control.resolve(paused({ revision: 5, controlEpoch: 1 }));
  assert.equal(await submitting, undefined, 'the late ack settles without closing anything');
  assert.equal(model.get().review.phase, 'pausing', 'the newer review is untouched');
  await settle();
  pauseCall(calls, 1).control.resolve(paused({ revision: 6, controlEpoch: 2, artRevision: 7 }));
  await newerBegin;
  assert.equal(model.get().review.phase, 'selecting');
  assert.equal(model.get().review.artRevision, 7);
});

test('an explicit validation failure restores composing with the text retained', async () => {
  const { model, calls, review, beginRegion } = build();
  await beginRegion();
  review.handle({ type: 'review.text', text: 'rejected note' });
  const submitting = review.handle({ type: 'review.submit' });
  commentCall(calls).control.reject(Object.assign(new Error('bad payload'), { status: 400 }));
  await assert.rejects(submitting, (error) => error.outcome === 'validation');
  assert.equal(model.get().review.phase, 'composing',
    'a known non-mutating rejection returns to the composer');
  assert.equal(model.get().review.text, 'rejected note');
});

test('cancelling while a submission is in flight invalidates its completion', async () => {
  const { model, calls, review, beginRegion } = build();
  await beginRegion();
  review.handle({ type: 'review.text', text: 'cancelled note' });
  const submitting = review.handle({ type: 'review.submit' });
  review.handle({ type: 'review.cancel' });
  assert.equal(model.get().review.phase, 'closed');
  assert.equal(model.get().review.text, 'cancelled note');
  commentCall(calls).control.resolve(paused({ revision: 3, controlEpoch: 1 }));
  assert.equal(await submitting, undefined, 'the late ack settles quietly');
  assert.equal(model.get().review.text, 'cancelled note',
    'the stale submission never closes the newer state');
});

test('the queued run sends the payload captured at submit time', async () => {
  const { calls, review, beginRegion } = build();
  await beginRegion();
  review.handle({ type: 'review.text', text: 'original wording' });
  const submitting = review.handle({ type: 'review.submit' });
  const queued = commentCall(calls).args[0];
  assert.equal(queued.text, 'original wording',
    'the run closure captured the payload before any later change');
  review.handle({ type: 'review.cancel' });
  commentCall(calls).control.resolve(paused({ revision: 3, controlEpoch: 1 }));
  assert.equal(await submitting, undefined,
    'the cancelled submission settles quietly with its original payload intact');
});

test('cancelling during the retry refresh invalidates the retry', async () => {
  const { model, calls, review, beginRegion } = build();
  await beginRegion();
  review.handle({ type: 'review.text', text: 'never retried' });
  const submitting = review.handle({ type: 'review.submit' });
  commentCall(calls).control.reject(new TypeError('response lost'));
  await assert.rejects(submitting, (error) => error.outcome === 'uncertain');
  const retried = review.handle({ type: 'review.retry' });
  review.handle({ type: 'review.cancel' });
  calls.find((call) => call.method === 'fetchState').control.resolve(paused({ revision: 5 }));
  assert.equal(await retried, undefined, 'the invalidated retry settles quietly');
  assert.equal(model.get().review.phase, 'closed');
  assert.equal(calls.filter((call) => call.method === 'createComment').length, 1,
    'the cancelled retry never resends');
});

test('an uncertain submission keeps the frozen request for explicit retry', async () => {
  const { model, calls, observe, review, beginRegion } = build();
  await beginRegion();
  review.handle({ type: 'review.text', text: 'uncertain note' });
  const submitting = review.handle({ type: 'review.submit' });
  const first = commentCall(calls).args[0];
  commentCall(calls).control.reject(new TypeError('network down'));
  await assert.rejects(submitting, (error) => error.outcome === 'uncertain');
  assert.equal(model.get().review.phase, 'uncertain');
  assert.equal(model.get().review.requestId, first.requestId);

  const retried = review.handle({ type: 'review.retry' });
  const refresh = calls.find((call) => call.method === 'fetchState');
  assert.ok(refresh, 'the retry refreshes the coordinator first');
  refresh.control.resolve(paused({ revision: 5, controlEpoch: 1, artRevision: 9 }));
  await settle();
  const retryBody = calls.filter((call) => call.method === 'createComment')[1].args[0];
  assert.equal(retryBody, first.requestId ? retryBody : null);
  assert.deepEqual(retryBody, first, 'the exact frozen payload is retried once');
  observe(paused({ revision: 6, controlEpoch: 1, artRevision: 9 }));
  calls.filter((call) => call.method === 'createComment')[1]
    .control.resolve(paused({ revision: 7, controlEpoch: 1, artRevision: 9 }));
  await retried;
  assert.equal(model.get().review.phase, 'closed');
});

test('a duplicate retry survives an accepted continuation that moved the art revision', async () => {
  const { model, calls, observe, review, beginRegion } = build();
  await beginRegion();
  review.handle({ type: 'review.text', text: 'lost success' });
  const submitting = review.handle({ type: 'review.submit' });
  const frozen = commentCall(calls).args[0];
  assert.equal(frozen.expectedArtRevision, 4);
  commentCall(calls).control.reject(new TypeError('response lost'));
  await assert.rejects(submitting, (error) => error.outcome === 'uncertain');
  const retried = review.handle({ type: 'review.retry' });
  calls.find((call) => call.method === 'fetchState')
    .control.resolve(paused({ revision: 5, controlEpoch: 1, artRevision: 9 }));
  await settle();
  const retryCall = calls.filter((call) => call.method === 'createComment')[1];
  assert.equal(retryCall.args[0].expectedArtRevision, 4,
    'the frozen art revision is resent for the duplicate check');
  retryCall.control.resolve(paused({ revision: 6, controlEpoch: 1, artRevision: 9 }));
  await retried;
  assert.equal(model.get().review.phase, 'closed',
    'the duplicate success closes the review despite the newer art revision');
});

test('a generation rotation between uncertain and retry goes stale without replay', async () => {
  const { model, calls, observe, review, beginRegion } = build();
  await beginRegion();
  review.handle({ type: 'review.text', text: 'doomed note' });
  const submitting = review.handle({ type: 'review.submit' });
  commentCall(calls).control.reject(new TypeError('response lost'));
  await assert.rejects(submitting);
  observe(paused({ revision: 5, controlEpoch: 1, docGeneration: 'gen-2' }));
  const retried = review.handle({ type: 'review.retry' });
  calls.find((call) => call.method === 'fetchState').control.resolve(
    paused({ revision: 6, controlEpoch: 1, docGeneration: 'gen-2' }));
  await assert.rejects(retried, (error) => error.outcome === 'stale');
  assert.equal(model.get().review.phase, 'stale');
  assert.equal(model.get().review.text, 'doomed note');
  assert.equal(calls.filter((call) => call.method === 'createComment').length, 1,
    'the frozen payload is never replayed against the rotated generation');
});
