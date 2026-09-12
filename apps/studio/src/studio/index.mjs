import { StudioState } from './state.mjs';
import { StudioApi } from './api.mjs';
import { StudioRenderer } from './renderer.mjs';
import { createApplication } from './application/index.mjs';
import { createWorkspace } from './workspace/index.mjs';

const canvas = document.getElementById('painting-canvas');
const state = new StudioState();
const api = new StudioApi({
  onOfflineChange: (offline) => state.setOffline(offline),
  onError: (error) => state.showNotification(error?.message ?? String(error), { tone: 'error' }),
});
const renderer = new StudioRenderer(canvas);
const application = createApplication({ state, api });
const workspace = createWorkspace({
  root: document.getElementById('workspace-root'),
  viewport: document.getElementById('studio-app'),
  canvas,
  uiCanvas: document.getElementById('ui-canvas'),
  controlsRoot: document.getElementById('control-host'),
  renderer,
  application,
});

let pollTimer = null;
let pollDelay = 100;
let tornDown = false;

function schedulePoll() {
  if (tornDown) return;
  pollTimer = setTimeout(async () => {
    pollTimer = null;
    if (tornDown) return;
    try {
      await application.requests.readState();
      pollDelay = 100;
    } catch {
      pollDelay = 1000;
    }
    schedulePoll();
  }, pollDelay);
}

schedulePoll();

function teardown() {
  if (tornDown) return;
  tornDown = true;
  if (pollTimer !== null) clearTimeout(pollTimer);
  pollTimer = null;
  workspace.destroy();
  application.destroy();
}

window.addEventListener('pagehide', (event) => {
  if (event.persisted === true) return;
  teardown();
});
