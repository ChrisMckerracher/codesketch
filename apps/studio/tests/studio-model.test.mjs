import test from 'node:test';
import assert from 'node:assert/strict';
import { StudioState } from '../src/studio/state.mjs';
import { createModel } from '../src/studio/model/index.mjs';
import { handleLocal } from '../src/studio/application/local.mjs';

let revision = 0;

function pushSnapshot(state, ids) {
  revision += 1;
  state.setSnapshot({
    revision,
    document: { layers: ids.map((id) => ({ id, name: id, visible: true, opacity: 1 })), marks: [] },
  });
}

test('model seeds defaults, retained values, and safe review default from state', () => {
  const state = new StudioState();
  state.setSize(24);
  state.setColor('#1e40af');
  const model = createModel(state);
  const value = model.get();
  assert.equal(value.tool, 'brush');
  assert.equal(value.size, 24);
  assert.equal(value.opacity, 1);
  assert.equal(value.color, '#1e40af');
  assert.equal(value.targetLayer, 'paint');
  assert.equal(value.context, 'tool');
  assert.equal(value.tab, 'layers');
  assert.equal(value.filename, 'Untitled');
  assert.equal(value.connection, 'connecting');
  assert.equal(value.snapshot, null);
  assert.deepEqual(value.drawers, { left: false, right: false });
  assert.deepEqual(value.viewport, { mode: 'fit', scale: 1, x: 0, y: 0 });
  assert.equal(value.review.phase, 'closed');
  assert.equal(value.review.keepPaused, true);
  model.destroy();
});

test('model values are frozen and patches replace instead of mutate', () => {
  const model = createModel(new StudioState());
  const before = model.get();
  const next = model.patch({ tab: 'feedback', drawers: { left: true, right: false } });
  assert.notEqual(next, before);
  assert.notEqual(next.drawers, before.drawers);
  assert.deepEqual(before.drawers, { left: false, right: false });
  assert.equal(before.tab, 'layers');
  assert.ok(Object.isFrozen(next));
  assert.ok(Object.isFrozen(next.drawers));
  assert.ok(Object.isFrozen(next.review));
  assert.ok(Object.isFrozen(next.viewport));
  model.destroy();
});

test('patch prohibits snapshot and unknown fields without emitting', () => {
  const model = createModel(new StudioState());
  let events = 0;
  model.subscribe(() => events++);
  assert.throws(() => model.patch({ snapshot: {} }), TypeError);
  assert.throws(() => model.patch({ notAField: 1 }), TypeError);
  assert.equal(events, 0);
  assert.equal(model.get().snapshot, null);
  model.destroy();
});

test('patch with equal values returns the same reference without emitting', () => {
  const model = createModel(new StudioState());
  let events = 0;
  model.subscribe(() => events++);
  const same = model.patch({ tool: 'brush', drawers: { left: false, right: false } });
  assert.equal(same, model.get());
  assert.equal(events, 0);
  model.destroy();
});

test('subscriptions fan out in order, receive new and previous values, and dispose', () => {
  const model = createModel(new StudioState());
  const calls = [];
  const disposeA = model.subscribe((value, previous) => calls.push(['a', value.tab, previous.tab]));
  model.subscribe((value) => calls.push(['b', value.tab]));
  model.patch({ tab: 'feedback' });
  disposeA();
  model.patch({ tab: 'layers' });
  assert.deepEqual(calls, [
    ['a', 'feedback', 'layers'],
    ['b', 'feedback'],
    ['b', 'layers'],
  ]);
  model.destroy();
});

test('state parameter events mirror into the model exactly once per change', () => {
  const state = new StudioState();
  const model = createModel(state);
  let events = 0;
  model.subscribe(() => events++);
  state.setTool('marker');
  state.setSize(48);
  state.setOpacity(0);
  state.setColor('#AABBCC');
  state.setTargetLayer('ink');
  state.setDraft({ kind: 'stroke' });
  state.setOffline(true);
  const value = model.get();
  assert.equal(value.tool, 'marker');
  assert.equal(value.size, 48);
  assert.equal(value.opacity, 0);
  assert.equal(value.color, '#aabbcc');
  assert.equal(value.targetLayer, 'ink');
  assert.deepEqual(value.draft, { kind: 'stroke' });
  assert.equal(value.connection, 'offline');
  assert.equal(events, 7);
  state.setTool('marker');
  assert.equal(events, 7);
  model.destroy();
});

test('first accepted snapshot promotes connecting to online', () => {
  const state = new StudioState();
  const model = createModel(state);
  pushSnapshot(state, ['paint']);
  assert.equal(model.get().connection, 'online');
  assert.equal(model.get().snapshot.document.layers.length, 1);
  state.setOffline(true);
  assert.equal(model.get().connection, 'offline');
  state.setOffline(false);
  assert.equal(model.get().connection, 'online');
  model.destroy();
});

test('handleLocal tool.select switches context and retains parameters and target', () => {
  const state = new StudioState();
  state.setSize(24);
  state.setOpacity(0.5);
  state.setColor('#123456');
  pushSnapshot(state, ['paint', 'ink']);
  const model = createModel(state);
  assert.equal(handleLocal({ type: 'layer.inspect', id: 'paint' }, { state, model }), true);
  assert.equal(model.get().context, 'layer');
  assert.equal(model.get().targetLayer, 'paint');
  assert.equal(handleLocal({ type: 'tool.select', tool: 'rect' }, { state, model }), true);
  const value = model.get();
  assert.equal(value.tool, 'rect');
  assert.equal(value.context, 'tool');
  assert.equal(value.size, 24);
  assert.equal(value.opacity, 0.5);
  assert.equal(value.color, '#123456');
  assert.equal(value.targetLayer, 'paint');
  assert.equal(state.tool, 'rect');
  assert.equal(value.drawers.right, true);
  model.destroy();
});

test('comment tool selection returns false for review delegation and changes nothing', () => {
  const state = new StudioState();
  const model = createModel(state);
  const before = model.get();
  assert.equal(handleLocal({ type: 'tool.select', tool: 'comment' }, { state, model }), false);
  assert.equal(model.get(), before);
  assert.equal(state.tool, 'brush');
  model.destroy();
});

test('handleLocal rejects unknown intents and malformed payloads', () => {
  const state = new StudioState();
  const model = createModel(state);
  const before = model.get();
  assert.equal(handleLocal({ type: 'layer.add', name: 'x' }, { state, model }), false);
  assert.equal(handleLocal({ type: 'tool.select', tool: 'select' }, { state, model }), false);
  assert.equal(handleLocal(null, { state, model }), false);
  assert.equal(handleLocal({ type: 'tool.properties', size: 0 }, { state, model }), false);
  assert.equal(handleLocal({ type: 'tool.properties', size: 101 }, { state, model }), false);
  assert.equal(handleLocal({ type: 'tool.properties', size: 2.5 }, { state, model }), false);
  assert.equal(handleLocal({ type: 'tool.properties', opacity: 1.5 }, { state, model }), false);
  assert.equal(handleLocal({ type: 'tool.properties', opacity: 'high' }, { state, model }), false);
  assert.equal(handleLocal({ type: 'tool.properties', color: 'blue' }, { state, model }), false);
  assert.equal(handleLocal({ type: 'tool.properties', color: '#12345' }, { state, model }), false);
  assert.equal(handleLocal({ type: 'tool.properties' }, { state, model }), false);
  assert.equal(model.get(), before);
  model.destroy();
});

test('tool.properties applies validated parameters including zero opacity and uppercase hex', () => {
  const state = new StudioState();
  const model = createModel(state);
  assert.equal(handleLocal({ type: 'tool.properties', opacity: 0, color: '#AABBCC' }, { state, model }), true);
  assert.equal(model.get().opacity, 0);
  assert.equal(model.get().color, '#aabbcc');
  assert.equal(state.opacity, 0);
  assert.equal(handleLocal({ type: 'tool.properties', color: '#AbCdEf' }, { state, model }), true);
  assert.equal(model.get().color, '#abcdef');
  assert.equal(handleLocal({ type: 'tool.properties', size: 8 }, { state, model }), true);
  assert.equal(model.get().size, 8);
  model.destroy();
});

test('layer.inspect requires an existing layer, opens properties context and right drawer', () => {
  const state = new StudioState();
  const model = createModel(state);
  assert.equal(handleLocal({ type: 'layer.inspect', id: 'ghost' }, { state, model }), false);
  assert.equal(model.get().context, 'tool');
  pushSnapshot(state, ['paint', 'ink']);
  assert.equal(handleLocal({ type: 'layer.inspect', id: 'ink' }, { state, model }), true);
  assert.equal(model.get().context, 'layer');
  assert.equal(model.get().targetLayer, 'ink');
  assert.equal(state.targetLayer, 'ink');
  assert.equal(model.get().drawers.right, true);
  model.destroy();
});

test('tool.return restores brush context while retaining target and parameters', () => {
  const state = new StudioState();
  state.setOpacity(0.25);
  state.setColor('#abcdef');
  pushSnapshot(state, ['paint', 'ink']);
  const model = createModel(state);
  handleLocal({ type: 'layer.inspect', id: 'ink' }, { state, model });
  handleLocal({ type: 'tool.properties', size: 7 }, { state, model });
  assert.equal(handleLocal({ type: 'tool.return' }, { state, model }), true);
  const value = model.get();
  assert.equal(value.tool, 'brush');
  assert.equal(value.context, 'tool');
  assert.equal(value.targetLayer, 'ink');
  assert.equal(value.size, 7);
  assert.equal(value.opacity, 0.25);
  assert.equal(value.color, '#abcdef');
  assert.equal(state.tool, 'brush');
  assert.equal(value.drawers.right, true);
  model.destroy();
});

test('tab, filename, and drawer intents validate payloads and open the left drawer', () => {
  const model = createModel(new StudioState());
  assert.equal(handleLocal({ type: 'drawer.set', side: 'right', open: true }, { state: null, model }), true);
  assert.equal(handleLocal({ type: 'tab.select', tab: 'feedback' }, { state: null, model }), true);
  assert.equal(model.get().tab, 'feedback');
  assert.deepEqual(model.get().drawers, { left: true, right: true });
  assert.equal(handleLocal({ type: 'tab.select', tab: 'history' }, { state: null, model }), false);
  assert.equal(handleLocal({ type: 'filename.set', value: '  City.codesketch  ' }, { state: null, model }), true);
  assert.equal(model.get().filename, 'City.codesketch');
  assert.equal(handleLocal({ type: 'filename.set', value: '   ' }, { state: null, model }), false);
  assert.equal(handleLocal({ type: 'filename.set', value: 'x'.repeat(121) }, { state: null, model }), false);
  assert.equal(handleLocal({ type: 'drawer.set', side: 'left', open: false }, { state: null, model }), true);
  assert.deepEqual(model.get().drawers, { left: false, right: true });
  assert.equal(handleLocal({ type: 'drawer.set', side: 'up', open: true }, { state: null, model }), false);
  assert.equal(handleLocal({ type: 'drawer.set', side: 'left', open: 'yes' }, { state: null, model }), false);
  assert.deepEqual(model.get().drawers, { left: false, right: true });
  model.destroy();
});

test('deep detach: realistic artwork values, mutated source repatch, size patch keeps snapshot identity', () => {
  const state = new StudioState();
  const model = createModel(state);
  state.setSnapshot({ revision: 1, document: { layers: [{ id: 'paint', name: 'Painting', visible: true, opacity: 1 }, { id: 'ink', name: 'Ink', visible: false, opacity: 0.5 }], marks: [{ type: 'stroke', points: [[1, 2]] }] } });
  const value = model.get();
  assert.throws(() => { value.snapshot.document.layers[1].opacity = 1; }, TypeError);
  assert.throws(() => { value.snapshot.document.marks[0].points[0][0] = 9; }, TypeError);
  assert.equal(state.snapshot.document.layers[1].opacity, 0.5);
  assert.deepEqual(state.snapshot.document.marks[0].points[0], [1, 2]);
  state.snapshot.document.layers[0].opacity = 0;
  assert.equal(value.snapshot.document.layers[0].opacity, 1);
  const draft = { type: 'stroke', points: [[1, 2]], layer: 'paint', brush: 'brush', size: 12, opacity: 1, color: '#253d38' };
  state.setDraft(draft);
  const withDraft = model.get();
  assert.notEqual(withDraft.draft, draft);
  assert.throws(() => { withDraft.draft.points[0][1] = 7; }, TypeError);
  draft.points[0][1] = 99;
  draft.size = 48;
  assert.equal(withDraft.draft.size, 12);
  state.setDraft(draft);
  const repatched = model.get();
  assert.notEqual(repatched.draft, withDraft.draft);
  assert.equal(repatched.draft.size, 48);
  assert.equal(repatched.draft.points[0][1], 99);
  const before = model.get();
  state.setSize(24);
  const after = model.get();
  assert.equal(after.size, 24);
  assert.notEqual(after, before);
  assert.equal(after.snapshot, before.snapshot);
  model.destroy();
});

test('destroy detaches state listeners and clears subscriptions', () => {
  const state = new StudioState();
  const model = createModel(state);
  let events = 0;
  model.subscribe(() => events++);
  model.destroy();
  state.setTool('marker');
  assert.equal(events, 0);
  assert.equal(model.get().tool, 'brush');
  model.destroy();
});
