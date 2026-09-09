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
