import test from 'node:test';
import assert from 'node:assert/strict';
import { StudioState } from '../src/studio/state.mjs';
import { StudioRequests } from '../src/studio/requests/index.mjs';
import { createDocuments } from '../src/studio/documents/index.mjs';

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

const project = () => ({ format: 'codesketch', version: 2, commands: [], cursor: 0, queue: [], comments: [] });

function build() {
  const state = new StudioState();
  const modelView = { snapshot: null, filename: 'meadow' };
  const calls = [];
  const downloads = [];
  const api = {
    sendControl(action, context) {
      const control = deferred();
      calls.push({ method: 'sendControl', args: [action, context], control });
      control.resolve(snapshot({ revision: 2, docGeneration: 'gen-2' }));
      return control.promise;
    },
    loadDemo(context) {
      const control = deferred();
      calls.push({ method: 'loadDemo', args: [context], control });
      control.resolve(snapshot({ revision: 2, docGeneration: 'gen-2' }));
      return control.promise;
    },
    loadProject(body, context) {
      const control = deferred();
      calls.push({ method: 'loadProject', args: [body, context], control });
      control.resolve(snapshot({ revision: 2 }));
      return control.promise;
    },
    fetchProject(context) {
      calls.push({ method: 'fetchProject', context });
      return Promise.resolve(project());
    },
  };
  const requests = new StudioRequests({ api, acceptSnapshot: (candidate) => state.setSnapshot(candidate) });
  const observe = (candidate) => { modelView.snapshot = candidate; return requests.observe(candidate); };
  const model = { get: () => ({ snapshot: modelView.snapshot, filename: modelView.filename }) };
  const documents = createDocuments({ model, requests }, {
    download: (blob, filename) => downloads.push({ blob, filename }),
    blob: (parts, type) => ({ parts, type, text: async () => parts.join('') }),
  });
  return { state, modelView, calls, downloads, requests, observe, documents };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('unknown intents return false without side effects and names are not aliased', () => {
  const { calls, documents } = build();
  assert.equal(documents.handle({ type: 'document.save' }), false, 'the obsolete save name is rejected');
  assert.equal(documents.handle({ type: 'document.exportPng' }), false, 'the obsolete export name is rejected');
  assert.equal(documents.handle({ type: 'document.rename', name: 'x' }), false);
  assert.equal(documents.handle(null), false);
  assert.equal(documents.handle('project.save'), false);
  assert.equal(calls.length, 0);
});

test('document.new sends human control new with the captured generation', async () => {
  const { state, calls, observe, documents } = build();
  observe(snapshot({ revision: 1 }));
  const done = documents.handle({ type: 'document.new' });
  assert.ok(done instanceof Promise, 'handled intents return a promise');
  await done;
  assert.deepEqual(calls[0].args, ['new', { expectedDocGeneration: 'gen-1' }]);
  assert.equal(state.snapshot.revision, 2, 'the successful ack is applied by requests');
});

test('document.demo sends loadDemo with the captured generation', async () => {
  const { calls, observe, documents } = build();
  observe(snapshot({ revision: 1 }));
  await documents.handle({ type: 'document.demo' });
  assert.deepEqual(calls[0].args, [{ expectedDocGeneration: 'gen-1' }]);
});

test('project.open rejects oversized files before reading them', async () => {
  const { calls, documents } = build();
  let read = false;
  const file = { size: 8 * 1024 * 1024 + 1, text: async () => { read = true; return '{}'; } };
  await assert.rejects(documents.handle({ type: 'project.open', file }),
    (error) => error.outcome === 'validation' && /8 MiB/.test(error.message));
  assert.equal(read, false, 'the file is never read');
  assert.equal(calls.length, 0);
});

test('project.open parses JSON and loads with the generation captured at intent time', async () => {
  const { calls, observe, documents } = build();
  observe(snapshot({ revision: 1 }));
  const text = deferred();
  const file = { size: 10, text: () => text.promise };
  const pending = documents.handle({ type: 'project.open', file });
  text.resolve(JSON.stringify(project()));
  await pending;
  assert.deepEqual(calls[0].args, [project(), { expectedDocGeneration: 'gen-1' }],
    'the generation frozen before the read is sent unchanged');
});

test('project.open rejects when the instance changes during the async read', async () => {
  const { calls, observe, documents } = build();
  observe(snapshot({ revision: 1 }));
  const text = deferred();
  const pending = documents.handle({ type: 'project.open', file: { size: 10, text: () => text.promise } });
  observe(snapshot({ revision: 1, instanceId: 'inst-2', docGeneration: 'gen-2' }));
  text.resolve(JSON.stringify(project()));
  await assert.rejects(pending, (error) => error.outcome === 'stale');
  assert.equal(calls.length, 0, 'nothing mutates after the instance rotated');
});

test('a generation rotation during the read stays stale through the coordinator', async () => {
  const { calls, observe, documents } = build();
  observe(snapshot({ revision: 1 }));
  const text = deferred();
  const pending = documents.handle({ type: 'project.open', file: { size: 10, text: () => text.promise } });
  observe(snapshot({ revision: 2, docGeneration: 'gen-5' }));
  text.resolve(JSON.stringify(project()));
  await assert.rejects(pending, (error) => error.outcome === 'stale',
    'the frozen generation never rebinds to the rotated one');
  assert.equal(calls.length, 0, 'the coordinator dispatches nothing for stale context');
});

test('project.open rejects files that are not valid JSON', async () => {
  const { calls, observe, documents } = build();
  observe(snapshot({ revision: 1 }));
  await assert.rejects(documents.handle({ type: 'project.open', file: { size: 10, text: async () => '{oops' } }),
    (error) => error.outcome === 'validation' && /valid JSON/.test(error.message));
  assert.equal(calls.length, 0);
});

test('destroy during the async read completes quietly without mutating', async () => {
  const { calls, observe, documents } = build();
  observe(snapshot({ revision: 1 }));
  const text = deferred();
  const pending = documents.handle({ type: 'project.open', file: { size: 10, text: () => text.promise } });
  documents.destroy();
  text.resolve(JSON.stringify(project()));
  assert.equal(await pending, undefined, 'the late completion resolves without error');
  assert.equal(calls.length, 0, 'destroyed intents never mutate');
  assert.equal(documents.handle({ type: 'document.new' }), false, 'destroyed documents reject new intents');
});

test('project.save downloads the exact server project JSON under the local filename', async () => {
  const { calls, downloads, observe, documents } = build();
  observe(snapshot({ revision: 1 }));
  await documents.handle({ type: 'project.save' });
  assert.deepEqual(calls.at(-1), {
    method: 'fetchProject', context: { expectedInstanceId: 'inst-1', expectedDocGeneration: 'gen-1' },
  }, 'save binds its read to the captured context');
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].filename, 'meadow.json', 'the editable local filename drives the download');
  assert.equal(await downloads[0].blob.text(), JSON.stringify(project()), 'the exact v2 JSON is saved');
  assert.equal(downloads[0].blob.type, 'application/json');
});

test('project.save freezes the intent-time filename before the fetch resolves', async () => {
  const { modelView, downloads, observe } = build();
  const api = {
    fetchProject: () => fetch.promise,
  };
  const requests = new StudioRequests({ api, acceptSnapshot: (candidate) => true });
  const documents = createDocuments({ model: { get: () => ({ snapshot: modelView.snapshot, filename: modelView.filename }) }, requests }, {
    download: (blob, filename) => downloads.push({ blob, filename }),
    blob: (parts, type) => ({ parts, type, text: async () => parts.join('') }),
  });
  const fetch = deferred();
  observe(snapshot({ revision: 1 }));
  const pending = documents.handle({ type: 'project.save' });
  modelView.filename = 'renamed-later';
  fetch.resolve(project());
  await pending;
  assert.equal(downloads[0].filename, 'meadow.json',
    'the intent-time filename is captured before the await');
});

test('project.save rejects a rotated context after the async fetch and never downloads', async () => {
  const { modelView, downloads, observe, documents } = build();
  const fetch = deferred();
  const requests = new StudioRequests({
    api: { fetchProject: () => fetch.promise },
    acceptSnapshot: (candidate) => true,
  });
  const currentModel = { get: () => ({ snapshot: modelView.snapshot, filename: modelView.filename }) };
  const guarded = createDocuments({ model: currentModel, requests }, {
    download: (blob, filename) => downloads.push({ blob, filename }),
    blob: (parts, type) => ({ parts, type }),
  });
  observe(snapshot({ revision: 1 }));
  const pending = guarded.handle({ type: 'project.save' });
  modelView.snapshot = snapshot({ revision: 2, instanceId: 'inst-2', docGeneration: 'gen-2' });
  fetch.resolve(project());
  await assert.rejects(pending, (error) => error.outcome === 'stale');
  assert.equal(downloads.length, 0);
});
