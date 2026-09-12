import test from 'node:test';
import assert from 'node:assert/strict';
import { StudioState } from '../src/studio/state.mjs';
import { createModel } from '../src/studio/model/index.mjs';
import { createGesture } from '../src/studio/gesture/index.mjs';

const LAYERS = [{ id: 'paint', name: 'Painting', visible: true, opacity: 1 }];
const ev = (x, y, extra = {}) => ({ button: 0, pointerId: 1, clientX: x, clientY: y, preventDefault() {}, ...extra });
const flush = () => new Promise((resolve) => setImmediate(resolve));

function createCanvasStub() {
  const listeners = new Map();
  let captured = null;
  return {
    addEventListener(type, listener) { const list = listeners.get(type) ?? []; list.push(listener); listeners.set(type, list); },
    removeEventListener(type, listener) { listeners.set(type, (listeners.get(type) ?? []).filter((fn) => fn !== listener)); },
    dispatch(type, event) { for (const listener of [...(listeners.get(type) ?? [])]) listener(event); },
    setPointerCapture(id) { captured = id; },
    releasePointerCapture(id) {
      if (captured !== id) return;
      captured = null;
      this.dispatch('lostpointercapture', { pointerId: id });
    },
    get captured() { return captured; },
  };
}

function push(state, revision, overrides = {}) {
  state.setSnapshot({
    revision, instanceId: 'inst-1', docGeneration: 'g1', controlEpoch: 0, artRevision: revision,
    document: { layers: LAYERS, marks: [] },
    history: { cursor: 0, total: 0 },
    playback: { status: 'idle', speed: 1, remaining: 0, active: null },
    ...overrides,
  });
}

function createHarness(overrides = {}) {
  const state = new StudioState();
  const model = createModel(state);
  const calls = [];
  const gates = new Map();
  let next = 0;
  let readStates = 0;
  let readStateError = null;
  const dispatch = (intent) => {
    const index = next;
    next += 1;
    calls.push({ index, intent });
    return new Promise((resolve, reject) => { gates.set(index, { resolve, reject }); });
  };
  const canvas = createCanvasStub();
  const requests = {
    get readStates() { return readStates; },
    set nextReadStateError(error) { readStateError = error; },
    async readState() {
      readStates += 1;
      if (readStateError) throw readStateError;
      push(state, 5, { controlEpoch: 1, playback: { status: 'paused', speed: 1, remaining: 0, active: null } });
    },
  };
  const gesture = createGesture({
    model, dispatch, requests, canvas,
    point: (event) => [Math.round(event.clientX), Math.round(event.clientY)],
  });
  push(state, 1, overrides.snapshot);
  const harness = { ...overrides, state, model, calls, canvas, gesture, requests };
  harness.resolveIntent = (type, result, occurrence = 1) => {
    const matches = calls.filter((call) => call.intent.type === type);
    const gate = gates.get(matches[occurrence - 1].index);
    gates.delete(matches[occurrence - 1].index);
    gate.resolve(result);
  };
  harness.rejectIntent = (type, error, occurrence = 1) => {
    const matches = calls.filter((call) => call.intent.type === type);
    const gate = gates.get(matches[occurrence - 1].index);
    gates.delete(matches[occurrence - 1].index);
    gate.reject(error);
  };
  return harness;
}

const intents = (h, type) => h.calls.filter((call) => call.intent.type === type).map((call) => call.intent);
const fire = (h, type, x, y) => h.canvas.dispatch(type, ev(x, y));
const pausedEpoch1 = { controlEpoch: 1, playback: { status: 'paused', speed: 1, remaining: 0, active: null } };
const DRAIN = 4;
const drain = async () => { for (let index = 0; index < DRAIN; index += 1) await Promise.resolve(); };

test('pointerup before ack retains the draft; paused polls alone never authorize; commit follows accepted pause', async (t) => {
  const h = createHarness();
  fire(h, 'pointerdown', 10, 10);
  fire(h, 'pointermove', 40, 40);
  fire(h, 'pointerup', 60, 60);
  assert.equal(intents(h, 'stroke.commit').length, 0, 'no commit before accepted pause');
  assert.deepEqual(h.model.get().draft.points, [[10, 10], [37.5, 37.5], [60, 60]], 'completed draft retained');
  push(h.state, 2, pausedEpoch1);
  await drain();
  assert.equal(intents(h, 'stroke.commit').length, 0, 'paused poll alone cannot authorize');
  h.resolveIntent('playback.control', { controlEpoch: 1 });
  await drain();
  assert.equal(intents(h, 'stroke.commit').length, 1, 'accepted pause promise authorizes');
  const command = intents(h, 'stroke.commit')[0].command;
  push(h.state, 3, { ...pausedEpoch1, artRevision: 3, document: { layers: LAYERS, marks: [command] } });
  h.resolveIntent('stroke.commit', { artRevision: 3 });
  await drain();
  assert.equal(h.model.get().draft, null, 'draft removed once accepted command is in current art');
  t.after(() => h.gesture.destroy());
});

test('already-paused sessions still request the priority pause for this gesture', async (t) => {
  const h = createHarness({ snapshot: pausedEpoch1 });
  fire(h, 'pointerdown', 10, 10);
  assert.deepEqual(intents(h, 'playback.control')[0], { type: 'playback.control', action: 'pause', generation: 'g1' });
  fire(h, 'pointerup', 30, 30);
  assert.equal(intents(h, 'stroke.commit').length, 0);
  h.resolveIntent('playback.control', { controlEpoch: 1 });
  await drain();
  assert.equal(intents(h, 'stroke.commit').length, 1);
  t.after(() => h.gesture.destroy());
});

test('pointercancel and unexpected lostpointercapture cancel, release capture, and never commit', async (t) => {
  const h = createHarness();
  fire(h, 'pointerdown', 10, 10);
  fire(h, 'pointermove', 30, 30);
  fire(h, 'pointercancel', 40, 40);
  assert.equal(h.model.get().draft, null);
  assert.equal(h.canvas.captured, null, 'capture released');
  push(h.state, 2, pausedEpoch1);
  h.resolveIntent('playback.control', { controlEpoch: 1 });
  await drain();
  assert.equal(intents(h, 'stroke.commit').length, 0);
  fire(h, 'pointerdown', 10, 10);
  h.canvas.dispatch('lostpointercapture', { pointerId: 1 });
  assert.equal(h.model.get().draft, null, 'unexpected lost capture while drawing cancels');
  t.after(() => h.gesture.destroy());
});

test('generation or instance reset invalidates a completed gesture without late writes', async (t) => {
  const h = createHarness();
  fire(h, 'pointerdown', 10, 10);
  fire(h, 'pointerup', 30, 30);
  push(h.state, 2, { instanceId: 'inst-2', docGeneration: 'g2' });
  assert.equal(h.model.get().draft, null, 'reset clears the draft');
  push(h.state, 3, { instanceId: 'inst-2', docGeneration: 'g2', ...pausedEpoch1 });
  h.resolveIntent('playback.control', { controlEpoch: 1 });
  await drain();
  assert.equal(intents(h, 'stroke.commit').length, 0, 'no late old-generation commit');
  t.after(() => h.gesture.destroy());
});

test('tool change mid-drag cancels the gesture', async (t) => {
  const h = createHarness();
  fire(h, 'pointerdown', 10, 10);
  h.state.setTool('marker');
  fire(h, 'pointermove', 30, 30);
  assert.equal(h.model.get().draft, null);
  push(h.state, 2, pausedEpoch1);
  h.resolveIntent('playback.control', { controlEpoch: 1 });
  await drain();
  assert.equal(intents(h, 'stroke.commit').length, 0);
  t.after(() => h.gesture.destroy());
});

test('uncertain commit failure refreshes then clears with notice; refresh failure keeps an actionable notice; never retries', async (t) => {
  const h = createHarness({ snapshot: pausedEpoch1 });
  fire(h, 'pointerdown', 10, 10);
  h.resolveIntent('playback.control', { controlEpoch: 1 });
  await drain();
  fire(h, 'pointerup', 30, 30);
  assert.equal(intents(h, 'stroke.commit').length, 1);
  h.rejectIntent('stroke.commit', Object.assign(new Error('request timed out'), { outcome: 'uncertain' }));
  await drain();
  assert.equal(h.requests.readStates, 1, 'readState awaited for refresh');
  assert.equal(h.model.get().draft, null);
  assert.match(h.model.get().notice.message, /studio refreshed/i);
  push(h.state, 2, pausedEpoch1);
  fire(h, 'pointerdown', 40, 40);
  h.resolveIntent('playback.control', { controlEpoch: 1 }, 2);
  await drain();
  fire(h, 'pointerup', 60, 60);
  h.requests.nextReadStateError = new Error('refresh failed');
  h.rejectIntent('stroke.commit', Object.assign(new Error('request timed out'), { outcome: 'uncertain' }), 2);
  await drain();
  assert.equal(h.requests.readStates, 2);
  assert.equal(h.model.get().draft, null);
  assert.match(h.model.get().notice.message, /refresh failed/i);
  push(h.state, 6, pausedEpoch1);
  assert.equal(intents(h, 'stroke.commit').length, 2, 'no automatic retry');
  t.after(() => h.gesture.destroy());
});

test('a second gesture is blocked while the previous commit is pending', async (t) => {
  const h = createHarness({ snapshot: pausedEpoch1 });
  fire(h, 'pointerdown', 10, 10);
  h.resolveIntent('playback.control', { controlEpoch: 1 });
  await drain();
  fire(h, 'pointerup', 30, 30);
  fire(h, 'pointerdown', 100, 100);
  assert.equal(intents(h, 'playback.control').length, 1, 'no new pause while commit pending');
  fire(h, 'pointermove', 120, 120);
  assert.equal(h.model.get().draft.points[0][0], 10, 'draft untouched by blocked pointerdown');
  const command = intents(h, 'stroke.commit')[0].command;
  push(h.state, 3, { ...pausedEpoch1, artRevision: 3, document: { layers: LAYERS, marks: [command] } });
  h.resolveIntent('stroke.commit', { artRevision: 3 });
  await drain();
  assert.equal(h.model.get().draft, null, 'accepted command reconciled once art matches');
  fire(h, 'pointerdown', 100, 100);
  h.resolveIntent('playback.control', { controlEpoch: 1 }, 2);
  await drain();
  fire(h, 'pointerup', 120, 120);
  assert.equal(intents(h, 'stroke.commit').length, 2, 'next gesture allowed after acceptance');
  t.after(() => h.gesture.destroy());
});

test('destroy during commit clears the draft and suppresses late commit effects', async (t) => {
  const h = createHarness({ snapshot: pausedEpoch1 });
  fire(h, 'pointerdown', 10, 10);
  h.resolveIntent('playback.control', { controlEpoch: 1 });
  await drain();
  fire(h, 'pointerup', 30, 30);
  h.gesture.destroy();
  assert.equal(h.model.get().draft, null, 'committing draft cleared on destroy');
  h.resolveIntent('stroke.commit', { artRevision: 3 });
  await drain();
  assert.equal(h.model.get().draft, null, 'late success has no effect');
  fire(h, 'pointerdown', 40, 40);
  assert.equal(intents(h, 'playback.control').length, 1, 'listeners detached after destroy');
});

test('hand and comment tools never gesture; non-primary buttons are ignored', async (t) => {
  const h = createHarness();
  h.model.patch({ tool: 'hand' });
  fire(h, 'pointerdown', 10, 10);
  fire(h, 'pointermove', 30, 30);
  fire(h, 'pointerup', 40, 40);
  h.model.patch({ tool: 'comment' });
  fire(h, 'pointerdown', 10, 10);
  fire(h, 'pointerup', 40, 40);
  h.model.patch({ tool: 'brush' });
  h.canvas.dispatch('pointerdown', ev(10, 10, { button: 2 }));
  h.canvas.dispatch('pointermove', ev(30, 30, { button: 2 }));
  h.canvas.dispatch('pointerup', ev(40, 40, { button: 2 }));
  assert.equal(intents(h, 'playback.control').length, 0);
  assert.equal(h.model.get().draft, null);
  t.after(() => h.gesture.destroy());
});

test('epoch lifecycle: stale pause rejection ignores a cancelled gesture; confirmed held gesture cancels on epoch intervention', async (t) => {
  const h = createHarness();
  fire(h, 'pointerdown', 10, 10);
  fire(h, 'pointercancel', 15, 15);
  assert.equal(h.model.get().draft, null, 'gesture A cancelled while its pause is pending');
  fire(h, 'pointerdown', 20, 20);
  assert.ok(h.model.get().draft, 'gesture B starts with its own pause');
  h.rejectIntent('playback.control', new Error('stale pause'), 1);
  await drain();
  assert.ok(h.model.get().draft, 'stale pause rejection does not cancel gesture B');
  push(h.state, 2, { controlEpoch: 3 });
  push(h.state, 3, { ...pausedEpoch1, controlEpoch: 3 });
  h.resolveIntent('playback.control', { controlEpoch: 3 }, 2);
  await drain();
  assert.ok(h.model.get().draft, 'gesture B confirmed while still held');
  push(h.state, 4, { ...pausedEpoch1, controlEpoch: 4 });
  assert.equal(h.model.get().draft, null, 'post-ack epoch intervention cancels');
  fire(h, 'pointerup', 40, 40);
  assert.equal(intents(h, 'stroke.commit').length, 0, 'cancelled held gesture never commits');
  t.after(() => h.gesture.destroy());
});

test('pause success against a mismatched snapshot cancels instead of leaving a stuck gesture', async (t) => {
  const h = createHarness();
  fire(h, 'pointerdown', 10, 10);
  h.resolveIntent('playback.control', { controlEpoch: 7 });
  await drain();
  assert.equal(h.model.get().draft, null, 'mismatched pause ack cancels the gesture');
  fire(h, 'pointerdown', 20, 20);
  assert.equal(intents(h, 'playback.control').length, 2, 'gesture can start again');
  t.after(() => h.gesture.destroy());
});
