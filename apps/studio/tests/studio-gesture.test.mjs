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
  const dispatch = (intent) => {
    const index = next;
    next += 1;
    calls.push({ index, intent });
    if (intent.type === 'tool.return') {
      state.setTool('brush');
      model.patch({ context: 'tool' });
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => { gates.set(index, { resolve, reject }); });
  };
  const canvas = createCanvasStub();
  const gesture = createGesture({
    model, dispatch, requests: {}, canvas,
    point: (event) => [Math.round(event.clientX), Math.round(event.clientY)],
  });
  push(state, 1, overrides.snapshot);
  const harness = { ...overrides, state, model, calls, canvas, gesture };
  harness.resolveIntent = (type, result, occurrence = 1) => {
    const matches = calls.filter((call) => call.intent.type === type);
    const gate = gates.get(matches[occurrence - 1].index);
    gates.delete(matches[occurrence - 1].index);
    gate.resolve(result);
  };
  return harness;
}

const intents = (h, type) => h.calls.filter((call) => call.intent.type === type).map((call) => call.intent);
const fire = (h, type, x, y) => h.canvas.dispatch(type, ev(x, y));
const pausedEpoch1 = { controlEpoch: 1, playback: { status: 'paused', speed: 1, remaining: 0, active: null } };

async function acceptPause(h) {
  push(h.state, 2, pausedEpoch1);
  assert.equal(intents(h, 'stroke.commit').length, 0, 'paused poll alone cannot authorize');
  h.resolveIntent('playback.control', { controlEpoch: 1 });
  await flush();
}

async function resolveCommit(h, command, artRevision) {
  const occurrence = intents(h, 'stroke.commit').length;
  push(h.state, artRevision, { ...pausedEpoch1, artRevision, document: { layers: LAYERS, marks: [command] } });
  h.resolveIntent('stroke.commit', { artRevision }, occurrence);
  await flush();
}

test('brush stroke requests priority pause, acks at incremented epoch, and commits frozen command', async (t) => {
  const h = createHarness();
  fire(h, 'pointerdown', 10, 10);
  assert.deepEqual(intents(h, 'playback.control')[0], { type: 'playback.control', action: 'pause', generation: 'g1' });
  assert.deepEqual(h.model.get().draft.points, [[10, 10]]);
  fire(h, 'pointermove', 20, 30);
  await acceptPause(h);
  fire(h, 'pointerup', 40, 40);
  const commits = intents(h, 'stroke.commit');
  assert.equal(commits.length, 1);
  assert.deepEqual(commits[0], {
    type: 'stroke.commit', generation: 'g1',
    command: { type: 'stroke', layer: 'paint', brush: 'brush', color: '#253d38', size: 12, opacity: 1, points: [[10, 10], [20, 30], [40, 40]] },
  });
  await resolveCommit(h, commits[0].command, 3);
  assert.equal(h.model.get().draft, null, 'draft removed once accepted command is in current art');
  t.after(() => h.gesture.destroy());
});

test('layer context really returns to brush on the same pointerdown and retains the target layer', async (t) => {
  const h = createHarness({ snapshot: { document: { layers: LAYERS.concat([{ id: 'ink', name: 'Ink', visible: true, opacity: 1 }]), marks: [] } } });
  h.state.setTool('marker');
  h.model.patch({ context: 'layer', targetLayer: 'ink' });
  fire(h, 'pointerdown', 5, 5);
  assert.equal(h.model.get().tool, 'brush', 'tool.return applied synchronously');
  assert.equal(h.model.get().context, 'tool');
  assert.equal(intents(h, 'playback.control').length, 1, 'pause follows in the same pointerdown');
  await acceptPause(h);
  fire(h, 'pointerup', 30, 30);
  const commit = intents(h, 'stroke.commit')[0];
  assert.equal(commit.command.layer, 'ink', 'target layer retained');
  assert.equal(commit.command.brush, 'brush');
  t.after(() => h.gesture.destroy());
});

test('held parameters freeze despite UI changes during the drag', async (t) => {
  const h = createHarness();
  h.state.setColor('#aabbcc');
  h.state.setSize(33);
  fire(h, 'pointerdown', 1, 1);
  fire(h, 'pointermove', 50, 50);
  h.state.setColor('#112233');
  h.state.setSize(7);
  fire(h, 'pointermove', 60, 60);
  assert.equal(h.model.get().draft.color, '#aabbcc');
  assert.equal(h.model.get().draft.size, 33);
  await acceptPause(h);
  fire(h, 'pointerup', 70, 70);
  const command = intents(h, 'stroke.commit')[0].command;
  assert.equal(command.color, '#aabbcc');
  assert.equal(command.size, 33);
  t.after(() => h.gesture.destroy());
});

test('point budget bounds strokes to 2000 samples while preserving the final endpoint', async (t) => {
  const h = createHarness({ snapshot: pausedEpoch1 });
  fire(h, 'pointerdown', 5, 5);
  h.resolveIntent('playback.control', { controlEpoch: 1 });
  await flush();
  for (let index = 0; index < 2500; index += 1) fire(h, 'pointermove', index % 1000, index % 700);
  fire(h, 'pointerup', 600, 600);
  const command = intents(h, 'stroke.commit')[0].command;
  assert.ok(command.points.length <= 2000, `points bounded: ${command.points.length}`);
  assert.deepEqual(command.points[0], [5, 5]);
  assert.deepEqual(command.points[command.points.length - 1], [600, 600]);
  t.after(() => h.gesture.destroy());
});

test('shapes normalize, clamp, refuse zero area; layer-context shape tool still draws brush strokes', async (t) => {
  const h = createHarness({ snapshot: pausedEpoch1 });
  h.state.setTool('rect');
  fire(h, 'pointerdown', 100, 100);
  h.resolveIntent('playback.control', { controlEpoch: 1 });
  await flush();
  fire(h, 'pointermove', 50, 150);
  fire(h, 'pointerup', 50, 150);
  const first = intents(h, 'stroke.commit')[0].command;
  assert.deepEqual(first, { type: 'rect', layer: 'paint', color: '#253d38', opacity: 1, x: 50, y: 100, width: 50, height: 50 });
  await resolveCommit(h, first, 3);
  fire(h, 'pointerdown', 990, 690);
  h.resolveIntent('playback.control', { controlEpoch: 1 }, 2);
  await flush();
  fire(h, 'pointermove', 1200, 800);
  fire(h, 'pointerup', 1200, 800);
  const clamped = intents(h, 'stroke.commit')[1].command;
  assert.deepEqual(clamped, { type: 'rect', layer: 'paint', color: '#253d38', opacity: 1, x: 990, y: 690, width: 10, height: 10 });
  await resolveCommit(h, clamped, 4);
  fire(h, 'pointerdown', 50, 50);
  fire(h, 'pointerup', 50, 50);
  assert.equal(intents(h, 'stroke.commit').length, 2, 'zero-area shape writes nothing');
  assert.equal(h.model.get().draft, null);
  h.model.patch({ context: 'layer', targetLayer: 'paint' });
  h.state.setTool('rect');
  fire(h, 'pointerdown', 10, 10);
  assert.equal(h.model.get().draft.type, 'stroke', 'layer context forces brush strokes');
  t.after(() => h.gesture.destroy());
});
