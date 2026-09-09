// Codesketch Studio browser application entry point

import { populateIcons } from './icons.mjs';
import { StudioApi } from './api.mjs';
import { StudioState } from './state.mjs';
import { StudioRenderer } from './renderer.mjs';
import { CanvasController } from './canvas-controller.mjs';
import { ToolsUI } from './tools-ui.mjs';
import { PlaybackUI } from './playback-ui.mjs';
import { LayersUI } from './layers-ui.mjs';
import { FeedbackUI } from './feedback-ui.mjs';
import { Dialogs } from './dialogs.mjs';

export function bootstrap() {
  populateIcons(document);

  const state = new StudioState();
  const api = new StudioApi({
    onOfflineChange: (offline) => state.setOffline(offline),
    onError: (err) => state.showNotification(err),
    onReconnect: () => {
      api.fetchState(null, null).then((snap) => {
        if (snap && !snap.unchanged) {
          state.setSnapshot(snap);
        }
      }).catch(() => {});
    },
  });

  const canvas = document.getElementById('canvas');
  const renderer = new StudioRenderer(canvas);
  new CanvasController(canvas, state, api, renderer);

  new ToolsUI(state, api);
  const dialogs = new Dialogs(state, api, renderer);
  new LayersUI(state, api, dialogs);
  new PlaybackUI(state, api);
  new FeedbackUI(state, api);

  // Welcome helper overlay handling
  const welcomeBanner = document.getElementById('canvas-welcome');
  function updateWelcomeBanner() {
    if (!welcomeBanner) return;
    const hasMarks = (state.snapshot?.document?.marks?.length || 0) > 0;
    const hasRemaining = (state.snapshot?.playback?.remaining || 0) > 0;
    const isDrafting = !!state.draft;
    welcomeBanner.hidden = hasMarks || hasRemaining || isDrafting;
  }
  state.on('snapshot', updateWelcomeBanner);
  state.on('draft', updateWelcomeBanner);

  // Keyboard accessibility & shortcuts
  window.addEventListener('keydown', (e) => {
    const target = e.target;
    const isInteractive = target instanceof Element && (
      target.isContentEditable ||
      !!target.closest('input, textarea, select, button, a, [role="radio"], [contenteditable]') ||
      !!target.closest('dialog[open]') ||
      !!document.querySelector('dialog[open]')
    );
    if (isInteractive || e.repeat) return;

    const isCtrlOrMeta = e.ctrlKey || e.metaKey;

    if (isCtrlOrMeta && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      api.sendControl('undo').then((s) => state.setSnapshot(s)).catch(() => {});
    } else if (isCtrlOrMeta && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
      e.preventDefault();
      api.sendControl('redo').then((s) => state.setSnapshot(s)).catch(() => {});
    } else if (!isCtrlOrMeta && e.code === 'Space') {
      e.preventDefault();
      const isPlaying = state.snapshot?.playback?.status === 'playing';
      api.sendControl(isPlaying ? 'pause' : 'resume').then((s) => state.setSnapshot(s)).catch(() => {});
    } else if (!isCtrlOrMeta && !e.altKey) {
      if (e.key === '1' || e.key.toLowerCase() === 'b') state.setTool('brush');
      else if (e.key === '2' || e.key.toLowerCase() === 'p') state.setTool('pencil');
      else if (e.key === '3' || e.key.toLowerCase() === 'm') state.setTool('marker');
      else if (e.key === '4' || e.key.toLowerCase() === 'e') state.setTool('eraser');
    }
  });

  window.addEventListener('online', () => state.setOffline(false));
  window.addEventListener('offline', () => state.setOffline(true));

  // Polling loop: every 150ms GET /api/state?since=revision&instanceId=ID
  let isPolling = false;
  async function poll() {
    if (isPolling) return;
    isPolling = true;
    try {
      const since = state.snapshot?.revision ?? null;
      const instanceId = state.currentInstanceId ?? null;
      const res = await api.fetchState(since, instanceId);
      if (res && !res.unchanged) {
        state.setSnapshot(res);
      }
    } catch {
      // Offline/error handled in StudioApi callbacks
    } finally {
      isPolling = false;
    }
  }

  // Initial fetch immediately without query params, then 150ms intervals
  poll();
  setInterval(poll, 150);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
