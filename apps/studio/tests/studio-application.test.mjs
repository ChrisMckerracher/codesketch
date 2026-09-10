import test from 'node:test';
import assert from 'node:assert/strict';
import { StudioState } from '../src/studio/state.mjs';
import { createApplication } from '../src/studio/application/index.mjs';

const LAYERS = [{ id: 'paint', name: 'Painting', visible: true, opacity: 1 }];
const flush = () => new Promise((resolve) => setImmediate(resolve));

function snapshot(revision, generation, epoch, artRevision, overrides = {}) {
  return {
    revision, instanceId: 'inst-1', docGeneration: generation, controlEpoch: epoch, artRevision,
    document: { layers: LAYERS.map((layer) => ({ ...layer })), marks: [] },
    history: { cursor: 0, total: 0 },
    playback: { status: 'idle', speed: 1, remaining: 0, active: null },
    ...overrides,
  };
}

async function createApp(initialOverrides = {}) {
  const state = new StudioState();
  const api = {
    commands: [], controls: [], gates: new Map(), next: 0, full: null,
    setFull(full) { this.full = full; },
    async fetchState() { return this.full; },
    async sendCommands(cmds, options) {
      const index = this.next;
      this.next += 1;
      this.commands.push({ index, cmds, options });
      return new Promise((resolve, reject) => { this.gates.set(`cmd-${index}`, { resolve, reject }); });
    },
    async sendControl(action, context) {
      const index = this.next;
      this.next += 1;
      this.controls.push({ index, action, context });
      return new Promise((resolve, reject) => { this.gates.set(`ctl-${index}`, { resolve, reject }); });
    },
    resolveKey(key, value) {
      const gate = this.gates.get(key);
      if (gate) { this.gates.delete(key); gate.resolve(value); }
    },
    async createComment() {}, async resolveComment() {},
    async fetchProject() {}, async loadProject() {}, async loadDemo() {},
  };
  const application = createApplication({ state, api });
  api.setFull(snapshot(1, 'g1', 0, 1, initialOverrides));
  await application.requests.readState();
  return { state, api, application, model: application.model };
}

test('stroke.commit honors the supplied generation exactly and sends human immediate commands', async (t) => {
  const h = await createApp();
  const command = { type: 'stroke', layer: 'paint', brush: 'brush', color: '#253d38', size: 8, opacity: 1, points: [[1, 1]] };
  const pending = h.application.dispatch({ type: 'stroke.commit', command, generation: 'g1' });
  await flush();
  assert.equal(h.api.commands.length, 1);
  assert.equal(h.api.commands[0].options.expectedDocGeneration, 'g1');
  assert.equal(h.api.commands[0].options.immediate, true);
  assert.equal(h.api.commands[0].options.play, false);
  assert.deepEqual(h.api.commands[0].cmds, [command]);
  h.api.resolveKey('cmd-0', snapshot(2, 'g1', 0, 2, { document: { layers: LAYERS.map((l) => ({ ...l })), marks: [command] } }));
  await pending;
  t.after(() => h.application.destroy());
});

test('a supplied stale generation is never silently recaptured', async (t) => {
  const h = await createApp();
  await assert.rejects(
    h.application.dispatch({ type: 'stroke.commit', command: { type: 'stroke', layer: 'paint', points: [[1, 1]] }, generation: 'g-old' }),
    /refresh|stale|rotated/i,
  );
  await flush();
  assert.equal(h.api.commands.length, 0, 'no command was sent with a recaptured generation');
  assert.match(h.model.get().notice.message, /Drawing failed/i);
  t.after(() => h.application.destroy());
});

test('layer.update sends exact fields and captures the current generation when absent', async (t) => {
  const h = await createApp();
  const pending = h.application.dispatch({ type: 'layer.update', id: 'paint', opacity: 0.5 });
  await flush();
  assert.deepEqual(h.api.commands[0].cmds, [{ type: 'layer.update', id: 'paint', opacity: 0.5 }]);
  assert.equal(h.api.commands[0].options.expectedDocGeneration, 'g1');
  h.api.resolveKey('cmd-0', snapshot(2, 'g1', 0, 2));
  await pending;
  t.after(() => h.application.destroy());
});

test('background.set maps to a fill command and layer.add generates unique valid ids and names', async (t) => {
  const h = await createApp();
  const background = h.application.dispatch({ type: 'background.set', color: '#f7f3e8' });
  await flush();
  assert.deepEqual(h.api.commands[0].cmds, [{ type: 'fill', color: '#f7f3e8' }]);
  h.api.resolveKey('cmd-0', snapshot(2, 'g1', 0, 2));
  await background;
  const add = h.application.dispatch({ type: 'layer.add', name: 'Ink' });
  await flush();
  assert.deepEqual(h.api.commands[1].cmds, [{ type: 'layer.add', id: 'layer-2', name: 'Ink' }]);
  h.api.resolveKey('cmd-1', snapshot(3, 'g1', 0, 3, { document: { layers: LAYERS.concat([{ id: 'layer-2', name: 'Ink', visible: true, opacity: 1 }]), marks: [] } }));
  await add;
  const second = h.application.dispatch({ type: 'layer.add', name: 'Tone' });
  await flush();
  assert.deepEqual(h.api.commands[2].cmds, [{ type: 'layer.add', id: 'layer-3', name: 'Tone' }]);
  h.api.resolveKey('cmd-2', snapshot(4, 'g1', 0, 4));
  await second;
  t.after(() => h.application.destroy());
});

test('playback pause uses the requests priority pause, exposes the pending key, and returns the confirmed snapshot', async (t) => {
  const h = await createApp();
  const confirmed = snapshot(2, 'g1', 1, 1, paused);
  const pending = h.application.dispatch({ type: 'playback.control', action: 'pause', generation: 'g1' });
  await flush();
  assert.deepEqual([...h.model.get().pending], ['playback.pause']);
  assert.equal(h.api.controls[0].action, 'pause');
  assert.deepEqual(h.api.controls[0].context, { expectedDocGeneration: 'g1' });
  h.api.resolveKey('ctl-0', confirmed);
  const result = await pending;
  assert.deepEqual(result, confirmed, 'confirmed snapshot returned to the caller');
  assert.deepEqual([...h.model.get().pending], [], 'pending cleared after settlement');
  t.after(() => h.application.destroy());
});

test('concurrent different action keys stay independent; duplicate same-key dispatches are rejected', async (t) => {
  const h = await createApp();
  const step = h.application.dispatch({ type: 'playback.control', action: 'step', source: 'human' });
  await flush();
  await assert.rejects(
    h.application.dispatch({ type: 'playback.control', action: 'step' }),
    /already in progress/,
  );
  const fresh = h.application.dispatch({ type: 'document.new' });
  await flush();
  assert.deepEqual([...h.model.get().pending].sort(), ['document.new', 'playback.control']);
  h.api.resolveKey('ctl-0', snapshot(2, 'g1', 0, 1));
  await step;
  await flush();
  const pendingKeys = [...h.api.gates.keys()];
  assert.deepEqual(pendingKeys, ['ctl-1'], 'document.new dispatches a single sendControl(new) request');
  h.api.resolveKey(pendingKeys[0], snapshot(3, 'g1', 0, 1));
  await fresh;
  t.after(() => h.application.destroy());
});

test('concurrent same-context pauses share one coordinator pause promise', async (t) => {
  const h = await createApp();
  const first = h.application.dispatch({ type: 'playback.control', action: 'pause', generation: 'g1' });
  const second = h.application.dispatch({ type: 'playback.control', action: 'pause', generation: 'g1' });
  await flush();
  assert.equal(h.api.controls.length, 1, 'single underlying pause control');
  const confirmed = snapshot(2, 'g1', 1, 1, paused);
  h.api.resolveKey('ctl-0', confirmed);
  assert.deepEqual(await first, confirmed);
  assert.deepEqual(await second, confirmed);
  t.after(() => h.application.destroy());
});

test('pause with an invalid supplied generation rejects validation without fallback', async (t) => {
  const h = await createApp();
  await assert.rejects(
    h.application.dispatch({ type: 'playback.control', action: 'pause', generation: '' }),
    /pause generation/,
  );
  await assert.rejects(
    h.application.dispatch({ type: 'playback.control', action: 'pause', generation: 5 }),
    /pause generation/,
  );
  await flush();
  assert.equal(h.api.controls.length, 0, 'no fallback to the current generation');
  t.after(() => h.application.destroy());
});

test('unknown intents reject validation and comment tool selection maps to a region review begin', async (t) => {
  const h = await createApp();
  await assert.rejects(h.application.dispatch({ type: 'layer.remove', id: 'paint' }), /Unhandled intent type/);
  await assert.rejects(h.application.dispatch('stroke'), /intent object/);
  const begin = h.application.dispatch({ type: 'tool.select', tool: 'comment' });
  await flush();
  assert.equal(h.api.controls[0].action, 'pause', 'review begin drives the priority pause handshake');
  assert.equal(h.model.get().review.phase, 'pausing');
  h.api.resolveKey('ctl-0', snapshot(2, 'g1', 1, 1, paused));
  await begin;
  await h.application.dispatch({ type: 'tool.select', tool: 'brush' });
  assert.equal(h.model.get().tool, 'brush', 'non-comment tool applies locally');
  t.after(() => h.application.destroy());
});

test('validation rejections carry the validation outcome', async (t) => {
  const h = await createApp();
  const error = await h.application.dispatch({ type: 'layer.remove', id: 'paint' }).then(
    () => { throw new Error('expected rejection'); },
    (caught) => caught,
  );
  assert.equal(error.outcome, 'validation');
  assert.equal(error.code, 'INVALID_INPUT');
  t.after(() => h.application.destroy());
});

test('playback controls honor a supplied generation without recapture', async (t) => {
  const h = await createApp();
  const pending = h.application.dispatch({ type: 'playback.control', action: 'step', generation: 'g1' });
  await flush();
  assert.equal(h.api.controls[0].context.expectedDocGeneration, 'g1');
  h.api.resolveKey('ctl-0', snapshot(2, 'g1', 0, 1));
  await pending;
  await assert.rejects(
    h.application.dispatch({ type: 'playback.control', action: 'step', generation: 'g-old' }),
    (error) => error.outcome === 'stale',
  );
  assert.equal(h.api.controls.length, 1, 'stale generation never reaches the wire');
  t.after(() => h.application.destroy());
});

test('heartbeat publishes through the central state without touching snapshot identity or revision', async (t) => {
  const h = await createApp();
  const before = h.model.get().snapshot;
  h.api.setFull({ unchanged: true, heartbeat: { lastSeenAt: '2026-01-01T00:00:01Z' } });
  await h.application.requests.readState();
  const after = h.model.get().snapshot;
  assert.equal(after.revision, before.revision, 'revision preserved');
  assert.equal(after.instanceId, before.instanceId, 'instance preserved');
  assert.equal(after.docGeneration, before.docGeneration, 'generation preserved');
  assert.equal(after.heartbeat.lastSeenAt, '2026-01-01T00:00:01Z', 'heartbeat published');
  t.after(() => h.application.destroy());
});

test('selecting a non-comment tool cancels an active review; a closed review stays untouched', async (t) => {
  const h = await createApp();
  const begin = h.application.dispatch({ type: 'tool.select', tool: 'comment' });
  await flush();
  assert.equal(h.model.get().review.phase, 'pausing');
  h.api.resolveKey('ctl-0', snapshot(2, 'g1', 1, 1, paused));
  await begin;
  assert.notEqual(h.model.get().review.phase, 'closed', 'review active after begin');
  await h.application.dispatch({ type: 'tool.select', tool: 'brush' });
  assert.equal(h.model.get().tool, 'brush', 'local tool applied');
  assert.equal(h.model.get().review.phase, 'closed', 'active review cancelled by tool selection');
  const before = h.model.get().review;
  await h.application.dispatch({ type: 'tool.return' });
  assert.deepEqual(h.model.get().review, before, 'closed review untouched');
  t.after(() => h.application.destroy());
});

const paused = { playback: { status: 'paused', speed: 1, remaining: 0, active: null } };
