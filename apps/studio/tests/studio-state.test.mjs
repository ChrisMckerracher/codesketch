import test from 'node:test';
import assert from 'node:assert/strict';
import { StudioState } from '../src/studio/state.mjs';

test('auto-selects newly added top layer when no local draft is active', () => {
  const state = new StudioState();
  const snap1 = {
    revision: 1,
    instanceId: 'inst-1',
    document: {
      layers: [{ id: 'paint', name: 'Painting', visible: true, opacity: 1 }],
      marks: [],
    },
  };
  state.setSnapshot(snap1);
  assert.equal(state.targetLayer, 'paint');

  const snap2 = {
    revision: 2,
    instanceId: 'inst-1',
    document: {
      layers: [
        { id: 'paint', name: 'Painting', visible: true, opacity: 1 },
        { id: 'distance', name: 'Distance', visible: true, opacity: 1 },
      ],
      marks: [],
    },
  };
  state.setSnapshot(snap2);
  assert.equal(state.targetLayer, 'distance', 'auto-selects newly added top layer distance');

  const snap3 = {
    revision: 3,
    instanceId: 'inst-1',
    document: {
      layers: [
        { id: 'paint', name: 'Painting', visible: true, opacity: 1 },
        { id: 'distance', name: 'Distance', visible: true, opacity: 1 },
        { id: 'details', name: 'Details', visible: true, opacity: 1 },
      ],
      marks: [],
    },
  };
  state.setSnapshot(snap3);
  assert.equal(state.targetLayer, 'details', 'auto-selects newly added top layer details');
});

test('preserves explicit layer selection during ordinary animation snapshots', () => {
  const state = new StudioState();
  state.setSnapshot({
    revision: 1,
    instanceId: 'inst-1',
    document: {
      layers: [
        { id: 'paint', name: 'Painting', visible: true, opacity: 1 },
        { id: 'land', name: 'Hills', visible: true, opacity: 1 },
      ],
      marks: [],
    },
  });

  state.setTargetLayer('paint');
  assert.equal(state.targetLayer, 'paint');

  state.setSnapshot({
    revision: 2,
    instanceId: 'inst-1',
    document: {
      layers: [
        { id: 'paint', name: 'Painting', visible: true, opacity: 1 },
        { id: 'land', name: 'Hills', visible: true, opacity: 1 },
      ],
      marks: [{ type: 'stroke', layer: 'land', points: [[1, 1], [2, 2]] }],
    },
  });
  assert.equal(state.targetLayer, 'paint', 'preserves explicit selection on ordinary snapshots');
});

test('does not auto-select new layer if local draft is currently active', () => {
  const state = new StudioState();
  state.setSnapshot({
    revision: 1,
    instanceId: 'inst-1',
    document: {
      layers: [{ id: 'paint', name: 'Painting', visible: true, opacity: 1 }],
      marks: [],
    },
  });

  state.setDraft({ type: 'stroke', layer: 'paint', points: [[10, 10]] });

  state.setSnapshot({
    revision: 2,
    instanceId: 'inst-1',
    document: {
      layers: [
        { id: 'paint', name: 'Painting', visible: true, opacity: 1 },
        { id: 'sky', name: 'Sky', visible: true, opacity: 1 },
      ],
      marks: [],
    },
  });
  assert.equal(state.targetLayer, 'paint', 'retains active draft layer without hijacking focus');
});

test('falls back to top layer if selected layer is removed', () => {
  const state = new StudioState();
  state.setSnapshot({
    revision: 1,
    instanceId: 'inst-1',
    document: {
      layers: [
        { id: 'paint', name: 'Painting', visible: true, opacity: 1 },
        { id: 'temp', name: 'Temporary', visible: true, opacity: 1 },
      ],
      marks: [],
    },
  });
  state.setTargetLayer('temp');

  state.setSnapshot({
    revision: 2,
    instanceId: 'inst-1',
    document: {
      layers: [{ id: 'paint', name: 'Painting', visible: true, opacity: 1 }],
      marks: [],
    },
  });
  assert.equal(state.targetLayer, 'paint', 'falls back to remaining top layer');
});

test('setOpacity preserves zero from numeric and string input', () => {
  const state = new StudioState();
  const emitted = [];
  state.on('opacity', (value) => emitted.push(value));

  state.setOpacity(0);
  assert.equal(state.opacity, 0, 'numeric zero stays zero');
  assert.deepEqual(emitted, [0]);

  state.setOpacity('0');
  assert.equal(state.opacity, 0, 'string zero stays zero');
  assert.equal(emitted.length, 1, 'unchanged zero does not re-emit');
});

test('setOpacity accepts fractional values from numbers and strings', () => {
  const state = new StudioState();
  const emitted = [];
  state.on('opacity', (value) => emitted.push(value));

  state.setOpacity(0.35);
  assert.equal(state.opacity, 0.35, 'fractional number is kept');
  assert.deepEqual(emitted, [0.35]);

  state.setOpacity('0.75');
  assert.equal(state.opacity, 0.75, 'fractional string is parsed');
  assert.deepEqual(emitted, [0.35, 0.75]);
});

test('setOpacity clamps numbers and strings to the 0-1 range', () => {
  const state = new StudioState();
  const emitted = [];
  state.on('opacity', (value) => emitted.push(value));

  state.setOpacity(1.5);
  assert.equal(state.opacity, 1, 'numeric above range clamps to 1');
  state.setOpacity(-0.25);
  assert.equal(state.opacity, 0, 'numeric below range clamps to 0');
  state.setOpacity('2');
  assert.equal(state.opacity, 1, 'string above range clamps to 1');
  assert.deepEqual(emitted, [0, 1], 'clamped-to-current emits only the actual changes');

  state.setOpacity('-0.75');
  assert.equal(state.opacity, 0, 'string below range clamps to 0');
  assert.deepEqual(emitted, [0, 1, 0]);
});

test('setOpacity normalizes invalid input to the existing default 1', () => {
  const state = new StudioState();
  const emitted = [];
  state.on('opacity', (value) => emitted.push(value));

  assert.equal(state.opacity, 1, 'constructor default is 1');
  state.setOpacity(0.25);
  assert.deepEqual(emitted, [0.25]);

  const invalid = ['', '   ', null, undefined, 'abc', Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const value of invalid) {
    state.setOpacity(value);
    assert.equal(state.opacity, 1, `invalid ${String(value)} normalizes to default 1`);
  }
  assert.deepEqual(emitted, [0.25, 1], 'only the first invalid input changes the value');
});

test('setOpacity emits only when the normalized value changes', () => {
  const state = new StudioState();
  const emitted = [];
  state.on('opacity', (value) => emitted.push(value));

  state.setOpacity(0.5);
  state.setOpacity('0.5');
  state.setOpacity(0.5);
  assert.deepEqual(emitted, [0.5], 'equal numeric and string forms emit once');

  state.setOpacity(1);
  state.setOpacity(1);
  assert.deepEqual(emitted, [0.5, 1], 'repeat value emits once');
  assert.equal(state.opacity, 1);
});

test('setSnapshot consumes only the top-level playbackError field', () => {
  const state = new StudioState();
  const snapshot = (overrides = {}) => ({
    revision: 1,
    instanceId: 'inst-1',
    playback: { status: 'idle', speed: 1, remaining: 0, active: null },
    ...overrides,
  });

  state.setSnapshot(snapshot({ playbackError: 'replay stalled' }));
  assert.equal(state.playbackError, 'replay stalled', 'top-level string sets the error');
  assert.match(state.notification.message, /replay stalled/);

  state.setSnapshot(snapshot({ playbackError: null }));
  assert.equal(state.playbackError, null, 'explicit null clears the error');

  state.setSnapshot(snapshot({ playback: { status: 'idle', speed: 1, remaining: 0, active: null, playbackError: 'nested' } }));
  assert.equal(state.playbackError, null, 'nested-only value is not interpreted');
});
