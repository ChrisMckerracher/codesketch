import { StudioState } from './state.mjs';
import { StudioApi } from './api.mjs';
import { StudioRenderer } from './renderer.mjs';
import { createApplication } from './application/index.mjs';
import { createGesture } from './gesture/index.mjs';
import { mount as mountHeader } from './header/index.mjs';
import { mount as mountPlayback } from './playback/index.mjs';
import { mount as mountLayers } from './layers/index.mjs';
import { mount as mountInspector } from './inspector/index.mjs';
import { mount as mountTools } from './tools/index.mjs';
import { mount as mountViewport } from './viewport/index.mjs';
import { mount as mountReview } from './review/index.mjs';

const canvas = document.getElementById('painting-canvas');
const state = new StudioState();
const api = new StudioApi({ onOfflineChange: (offline) => state.setOffline(offline) });
const renderer = new StudioRenderer(canvas);
const application = createApplication({ state, api });
const model = application.model;
const dispatch = application.dispatch;

const components = [];
function mountComponent(mount, root, extra = {}) {
  components.push(mount({ root, model: model.get(), dispatch, ...extra }));
}

const viewport = mountViewport({ root: document.getElementById('stage-viewport'), model: model.get(), dispatch });
components.push(viewport);
mountComponent(mountHeader, document.getElementById('global-header'));
mountComponent(mountPlayback, document.getElementById('director-hud'));
mountComponent(mountLayers, document.getElementById('layer-panel'));
mountComponent(mountInspector, document.getElementById('right-inspector'));
mountComponent(mountTools, document.getElementById('tool-dock'));
components.push(mountReview({
  root: document.getElementById('feedback-panel'),
  model: model.get(),
  dispatch,
  composer: document.getElementById('feedback-composer'),
  overlay: document.getElementById('stage-overlay'),
  canvas,
  point: viewport.point,
}));

const gesture = createGesture({
  model,
  dispatch,
  requests: application.requests,
  canvas,
  point: viewport.point,
});

let lastRenderSignature = null;
let lastDraft = null;
let tornDown = false;
const notice = document.getElementById('studio-notice');

function artSignature(value) {
  const snapshot = value.snapshot;
  if (!snapshot) return null;
  const active = snapshot.playback?.active ?? null;
  const activeSignature = active ? `${active.command?.id ?? 'command'}:${active.progress}` : '';
  return `${snapshot.instanceId}:${snapshot.docGeneration}:${snapshot.artRevision}:${activeSignature}`;
}

function applyValue(value) {
  const snapshot = value.snapshot;
  const active = snapshot?.playback?.active ?? null;
  const signature = artSignature(value);
  if (snapshot && (signature !== lastRenderSignature || value.draft !== lastDraft)) {
    renderer.render(snapshot.document, active, value.draft);
    lastRenderSignature = signature;
  }
  lastDraft = value.draft;
  for (const component of components) component.update(value);
  notice.textContent = value.notice?.message ?? '';
}

applyValue(model.get());
const unsubscribeModel = model.subscribe((value) => applyValue(value));

let pollTimer = null;
let pollInterval = 100;

function schedulePoll() {
  if (tornDown) return;
  pollTimer = setTimeout(async () => {
    if (tornDown) return;
    try {
      await application.requests.readState();
      pollInterval = 100;
    } catch {
      pollInterval = 1000;
    }
    schedulePoll();
  }, pollInterval);
}

schedulePoll();

function teardown() {
  tornDown = true;
  if (pollTimer !== null) clearTimeout(pollTimer);
  pollTimer = null;
  gesture.destroy();
  for (const component of components) component.destroy?.();
  unsubscribeModel();
  application.destroy();
}

window.addEventListener('pagehide', teardown, { once: true });
