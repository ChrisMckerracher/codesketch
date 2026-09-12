import test from 'node:test';
import assert from 'node:assert/strict';
import { StudioState } from '../src/studio/state.mjs';
import { createModel } from '../src/studio/model/index.mjs';
import { handleLocal } from '../src/studio/application/local.mjs';
import { buildStroke } from '../src/studio/gesture/command.mjs';
import { createGesture } from '../src/studio/gesture/index.mjs';
import { smoothPoints } from '../src/studio/gesture/smoothing.mjs';

const RAW = [[0, 0], [10, 40], [30, 5], [60, 45], [100, 0]];
const event = (x, y) => ({ button: 0, pointerId: 1, clientX: x, clientY: y, preventDefault() {} });

function createCanvasStub() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      const list = listeners.get(type) ?? [];
      list.push(listener);
      listeners.set(type, list);
    },
    dispatch(type, value) {
      for (const listener of [...(listeners.get(type) ?? [])]) listener(value);
    },
    setPointerCapture() {},
    releasePointerCapture() {},
    focus() {},
  };
}

test('smoothing zero clones raw points while nonzero smoothing changes only interior points', () => {
  const zero = smoothPoints(RAW, 0);
  const nonzero = smoothPoints(RAW, 75);
  const three = smoothPoints([[0, 0], [10, 40], [30, 5]], 75);
  assert.deepEqual(zero, RAW);
  assert.notEqual(zero, RAW);
  assert.notDeepEqual(nonzero.slice(1, -1), RAW.slice(1, -1));
  assert.deepEqual(nonzero[0], RAW[0]);
  assert.deepEqual(nonzero.at(-1), RAW.at(-1));
  assert.deepEqual(three, [[0, 0], [12.5, 21.25], [30, 5]]);
});

test('smoothing is deterministic, preserves endpoints, and never mutates input', () => {
  const input = RAW.map((point) => [...point]);
  const first = smoothPoints(input, 50);
  const second = smoothPoints(input, 50);
  assert.deepEqual(first, second);
  assert.deepEqual(first[0], input[0]);
  assert.deepEqual(first.at(-1), input.at(-1));
  assert.deepEqual(input, RAW);
  first[1][0] = 999;
  assert.notEqual(input[1][0], 999);
});

test('buildStroke stores the expected smoothed points before clamping', () => {
  const frozen = { layer: 'paint', brush: 'brush', color: '#123456', size: 8, opacity: 1, smoothing: 60 };
  const points = RAW.map((point) => [...point]);
  const command = buildStroke(frozen, points);
  assert.deepEqual(command.points, [[0, 0], [12, 25], [32, 20], [62, 28], [100, 0]]);
  assert.deepEqual(points, RAW);
});

test('smoothing is local model state and tool properties validate its range', () => {
  const state = new StudioState();
  const model = createModel(state);
  assert.equal(model.get().smoothing, 75);
  assert.equal(handleLocal({ type: 'tool.properties', smoothing: 0 }, { state, model }), true);
  assert.equal(model.get().smoothing, 0);
  assert.equal(state.smoothing, undefined);
  for (const smoothing of [-1, 101, 1.5]) {
    assert.equal(handleLocal({ type: 'tool.properties', smoothing }, { state, model }), false);
  }
  assert.equal(model.get().smoothing, 0);
  model.destroy();
});

test('eraser keeps its canonical brush, caps size, and freezes size and smoothing', async (t) => {
  const state = new StudioState();
  state.setTool('eraser');
  state.setSize(60);
  const model = createModel(state);
  state.setSnapshot({
    revision: 1,
    instanceId: 'inst-1',
    docGeneration: 'g1',
    controlEpoch: 0,
    artRevision: 1,
    document: { layers: [{ id: 'paint' }], marks: [] },
    playback: { status: 'idle' },
  });
  model.patch({ smoothing: 0 });
  const canvas = createCanvasStub();
  const calls = [];
  let resolvePause;
  const dispatch = (intent) => {
    calls.push(intent);
    if (intent.type === 'playback.control') return new Promise((resolve) => { resolvePause = resolve; });
    return Promise.resolve({ artRevision: 2 });
  };
  const gesture = createGesture({ model, dispatch, requests: {}, canvas, point: (value) => [value.clientX, value.clientY] });

  canvas.dispatch('pointerdown', event(0, 0));
  assert.equal(model.get().draft.brush, 'eraser');
  assert.equal(model.get().draft.size, 100);
  model.patch({ smoothing: 100 });
  state.setSize(10);
  canvas.dispatch('pointermove', event(10, 40));
  canvas.dispatch('pointermove', event(30, 5));
  canvas.dispatch('pointermove', event(60, 45));
  assert.equal(model.get().draft.size, 100);
  assert.deepEqual(model.get().draft.points, [[0, 0], [10, 40], [30, 5], [60, 45]]);

  state.setSnapshot({
    ...state.snapshot,
    revision: 2,
    controlEpoch: 1,
    artRevision: 2,
    playback: { status: 'paused' },
  });
  resolvePause({ controlEpoch: 1 });
  await Promise.resolve();
  canvas.dispatch('pointerup', event(100, 0));
  const commit = calls.find((intent) => intent.type === 'stroke.commit');
  assert.equal(commit.command.brush, 'eraser');
  assert.equal(commit.command.size, 100);
  assert.deepEqual(commit.command.points, model.get().draft.points);
  t.after(() => gesture.destroy());
});
