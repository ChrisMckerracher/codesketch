import test from 'node:test';
import assert from 'node:assert/strict';
import { StudioState } from '../src/studio/state.mjs';
import { StudioRequests } from '../src/studio/requests/index.mjs';
import { createDocuments } from '../src/studio/documents/index.mjs';
import { createRenderer } from '../src/painting/rendering/index.mjs';

const artwork = {
  version: 1,
  width: 1000,
  height: 700,
  background: '#f7f3e8',
  layers: [{ id: 'paint', name: 'Painting', visible: true, opacity: 1 }],
  marks: [{ type: 'stroke', layer: 'paint', color: '#253d38', opacity: 1, size: 8,
    brush: 'brush', points: [[10, 10], [40, 40]] }],
};

function snapshot(overrides = {}) {
  return {
    revision: 1,
    instanceId: 'inst-1',
    docGeneration: 'gen-1',
    controlEpoch: 0,
    requiresGrant: false,
    activeGrant: null,
    document: artwork,
    playback: { status: 'paused', speed: 1, remaining: 0, active: null },
    history: { cursor: 0, total: 0 },
    comments: [],
    storageError: null,
    playbackError: null,
    heartbeat: { lastSeenAt: null },
    ...overrides,
  };
}

function fakeContext(ops) {
  return new Proxy({}, {
    get: (target, prop) => (prop in target ? target[prop] : (...args) => ops.push([prop, ...args])),
    set: (target, prop, value) => { target[prop] = value; return true; },
  });
}

function fakeCanvas(toBlob) {
  const canvas = {
    width: 0,
    height: 0,
    ops: [],
    getContext: () => fakeContext(canvas.ops),
    toBlob: toBlob ?? ((callback) => callback({ size: 42, type: 'image/png' })),
  };
  return canvas;
}

function build({ toBlob, renderer } = {}) {
  const state = new StudioState();
  const modelView = { snapshot: null, filename: 'meadow' };
  const requests = new StudioRequests({
    api: {},
    acceptSnapshot: (candidate) => state.setSnapshot(candidate),
  });
  const observe = (candidate) => { modelView.snapshot = candidate; return requests.observe(candidate); };
  observe(snapshot({ revision: 1 }));
  const downloads = [];
  const created = [];
  const documents = createDocuments({
    model: { get: () => ({ snapshot: modelView.snapshot, filename: modelView.filename }) },
    requests,
  }, {
    createCanvas: (width, height) => {
      const canvas = fakeCanvas(toBlob);
      created.push(canvas);
      return canvas;
    },
    renderer,
    download: (blob, filename) => downloads.push({ blob, filename }),
  });
  return { state, modelView, downloads, created, observe, documents };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const originalDocument = globalThis.document;
globalThis.document = { createElement: () => fakeCanvas() };
test.after(() => { globalThis.document = originalDocument; });

test('png.export renders only committed artwork on a separate canvas', async () => {
  const renderCalls = [];
  const { downloads, created, documents } = build({
    renderer: (canvas) => {
      const render = createRenderer(canvas);
      return (document, active, draft) => {
        renderCalls.push({ document, active, draft });
        return render(document, active, draft);
      };
    },
  });
  documents.handle({ type: 'png.export' });
  await settle();
  assert.equal(created.length, 1, 'the export uses its own offscreen canvas');
  assert.equal(created[0].width, 1000);
  assert.equal(created[0].height, 700);
  assert.equal(renderCalls.length, 1);
  assert.equal(renderCalls[0].document, artwork);
  assert.equal(renderCalls[0].active, null, 'no active playback mark is drawn');
  assert.equal(renderCalls[0].draft, null, 'no local draft is drawn');
  assert.deepEqual(downloads, [{ blob: { size: 42, type: 'image/png' }, filename: 'meadow.png' }],
    'the local editable filename drives the download');
});

test('png.export freezes the filename at intent time before the blob completes', async () => {
  let deliver;
  const { downloads, modelView, documents } = build({
    toBlob: (callback) => { deliver = callback; },
  });
  const pending = documents.handle({ type: 'png.export' });
  await settle();
  modelView.filename = 'renamed-later';
  deliver({ size: 42, type: 'image/png' });
  await pending;
  assert.equal(downloads[0].filename, 'meadow.png', 'the intent-time filename wins');
});

test('destroy before the blob completes prevents the download', async () => {
  let deliver;
  const { downloads, documents } = build({
    toBlob: (callback) => { deliver = callback; },
  });
  const pending = documents.handle({ type: 'png.export' });
  await settle();
  documents.destroy();
  deliver({ size: 42, type: 'image/png' });
  assert.equal(await pending, undefined, 'the late blob resolves without downloading');
  assert.deepEqual(downloads, [], 'destroyed exports never download');
});

test('the canonical renderer draws the committed document through the export canvas', async () => {
  const { created, documents } = build();
  documents.handle({ type: 'png.export' });
  await settle();
  const main = created[0];
  assert.equal(main.ops[0][0], 'fillRect', 'the canonical renderer painted the background');
  assert.deepEqual(main.ops[0].slice(1), [0, 0, 1000, 700]);
});

test('downloads use local filenames with object URL cleanup', async () => {
  const { state, modelView } = build();
  const createdUrls = [];
  const revoked = [];
  const anchors = [];
  const fakeUrl = {
    createObjectURL: (blob) => {
      createdUrls.push(blob);
      return 'blob:local-1';
    },
    revokeObjectURL: (url) => revoked.push(url),
  };
  const fakeDocument = {
    createElement: () => {
      const anchor = { click: () => { anchor.clicked = true; }, remove: () => { anchor.removed = true; } };
      anchors.push(anchor);
      return anchor;
    },
    body: { appendChild: () => {} },
  };
  const requests = new StudioRequests({ api: {}, acceptSnapshot: (candidate) => state.setSnapshot(candidate) });
  const documents = createDocuments({
    model: { get: () => ({ snapshot: modelView.snapshot, filename: modelView.filename }) },
    requests,
  }, {
    document: fakeDocument,
    url: fakeUrl,
    blob: (parts, type) => ({ parts, type }),
    createCanvas: () => fakeCanvas(),
  });
  documents.handle({ type: 'png.export' });
  await settle();
  assert.equal(createdUrls.length, 1);
  assert.deepEqual(revoked, ['blob:local-1'], 'the object URL is always revoked');
  assert.ok(anchors[0].clicked && anchors[0].removed, 'the anchor is clicked and removed');
  assert.equal(anchors[0].href, 'blob:local-1');
  assert.equal(anchors[0].download, 'meadow.png');
});
