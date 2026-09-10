// Playback controls, status pills, speed selector, and undo/redo handling

import { createSvgIcon } from './icons.mjs';

export class PlaybackUI {
  constructor(state, api) {
    this.state = state;
    this.api = api;

    this.btnPlayPause = document.getElementById('btn-play-pause');
    this.labelPlayPause = document.getElementById('label-play-pause');
    this.btnStep = document.getElementById('btn-step');
    this.btnClear = document.getElementById('btn-clear');
    this.selectSpeed = document.getElementById('select-speed');
    this.btnFinish = document.getElementById('btn-finish');
    this.finishBusy = false;

    this.btnUndo = document.getElementById('btn-undo');
    this.btnRedo = document.getElementById('btn-redo');

    this.statusIndicator = document.getElementById('status-indicator');
    this.statusLabel = document.getElementById('status-label');
    this.queueCount = document.getElementById('queue-count');
    this.queueIconSlot = document.getElementById('queue-icon-slot');

    if (this.queueIconSlot) {
      this.queueIconSlot.replaceChildren(createSvgIcon('queue', 14));
    }

    this.bindEvents();
    this.subscribeState();
  }

  bindEvents() {
    this.btnPlayPause.addEventListener('click', async () => {
      const isPlaying = this.state.snapshot?.playback?.status === 'playing';
      const action = isPlaying ? 'pause' : 'resume';
      try {
        const snap = await this.api.sendControl(action);
        this.state.setSnapshot(snap);
      } catch (err) {
        this.state.showNotification(`Playback error: ${err.message}`);
      }
    });

    this.btnStep.addEventListener('click', async () => {
      try {
        const snap = await this.api.sendControl('step');
        this.state.setSnapshot(snap);
      } catch (err) {
        this.state.showNotification(`Step error: ${err.message}`);
      }
    });

    this.btnClear.addEventListener('click', async () => {
      try {
        const snap = await this.api.sendControl('clear');
        this.state.setSnapshot(snap);
      } catch (err) {
        this.state.showNotification(`Clear queue error: ${err.message}`);
      }
    });

    this.btnFinish.addEventListener('click', async () => {
      if (this.finishBusy || this.btnFinish.disabled) return;
      this.finishBusy = true;
      this.renderFinishState();
      try {
        const snap = await this.api.sendControl('finish');
        this.state.setSnapshot(snap);
        this.state.showNotification('Drawing complete');
      } catch (err) {
        this.state.showNotification(`Finish error: ${err.message}`);
      } finally {
        this.finishBusy = false;
        this.renderFinishState();
      }
    });

    this.selectSpeed.addEventListener('change', async (e) => {
      const speed = Number(e.target.value);
      try {
        const snap = await this.api.sendControl('speed', speed);
        this.state.setSnapshot(snap);
      } catch (err) {
        this.state.showNotification(`Speed error: ${err.message}`);
      }
    });

    this.btnUndo.addEventListener('click', async () => {
      try {
        const snap = await this.api.sendControl('undo');
        this.state.setSnapshot(snap);
      } catch (err) {
        this.state.showNotification(`Undo error: ${err.message}`);
      }
    });

    this.btnRedo.addEventListener('click', async () => {
      try {
        const snap = await this.api.sendControl('redo');
        this.state.setSnapshot(snap);
      } catch (err) {
        this.state.showNotification(`Redo error: ${err.message}`);
      }
    });
  }

  subscribeState() {
    this.state.on('snapshot', (snap) => this.renderSnapshot(snap));
    this.state.on('offline', (offline) => this.renderOffline(offline));
  }

  renderSnapshot(snap) {
    if (!snap) return;
    const playback = snap.playback || {};
    const history = snap.history || {};

    const isPlaying = playback.status === 'playing';
    this.labelPlayPause.textContent = isPlaying ? 'Pause' : 'Play';
    this.btnPlayPause.setAttribute('aria-label', isPlaying ? 'Pause playback' : 'Resume playback');
    this.btnPlayPause.title = isPlaying ? 'Pause (Space)' : 'Play (Space)';
    const iconSlot = this.btnPlayPause.querySelector('.btn-icon');
    if (iconSlot) {
      iconSlot.replaceChildren(createSvgIcon(isPlaying ? 'pause' : 'play', 14));
    }

    if (playback.speed && Number(this.selectSpeed.value) !== playback.speed) {
      this.selectSpeed.value = String(playback.speed);
    }

    // Status pill
    if (!this.state.isOffline) {
      this.statusIndicator.className = `status-pill status-${playback.status || 'idle'}`;
      this.statusLabel.textContent = (playback.status || 'idle').replace(/^\w/, (c) => c.toUpperCase());
    }

    // Queue count
    const remaining = playback.remaining || 0;
    this.queueCount.textContent = String(remaining);

    // Undo / Redo button disabled states
    const cursor = history.cursor ?? 0;
    const total = history.total ?? 0;
    this.btnUndo.disabled = cursor <= 0;
    this.btnRedo.disabled = cursor >= total;
    this.renderFinishState();
  }

  renderFinishState() {
    const remaining = this.state.snapshot?.playback?.remaining ?? 0;
    this.btnFinish.disabled = this.finishBusy || this.state.isOffline || remaining === 0;
  }

  renderOffline(offline) {
    if (offline) {
      this.statusIndicator.className = 'status-pill status-offline';
      this.statusLabel.textContent = 'Offline';
      this.renderFinishState();
    } else if (this.state.snapshot?.playback) {
      this.renderSnapshot(this.state.snapshot);
    }
  }
}
