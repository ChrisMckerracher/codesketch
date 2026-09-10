function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.filter(Boolean));
  return node;
}

const SPEEDS = [0.5, 1, 2, 5];

function statusLabel(playback, pausingPending) {
  if (pausingPending) return { text: 'Pausing…', tone: 'warn' };
  if (!playback || playback.status === 'idle') return { text: 'Idle', tone: 'muted' };
  if (playback.status === 'playing') return { text: `Playing · ${Number(playback.speed)}x`, tone: 'playing' };
  if (playback.status === 'paused') return { text: 'Paused', tone: 'warn' };
  return { text: 'Idle', tone: 'muted' };
}

function canDispatchServer(value) {
  return Boolean(value.snapshot) && value.connection !== 'offline' && value.connection !== 'uncertain';
}

export function mount({ root, model, dispatch }) {
  root.classList.add('cs-hud');
  let current = model;
  let localError = null;
  let errorTimer = null;
  let speedPending = null;
  let pauseAction = null;
  const pending = new Set();
  const options = new AbortController();

  const statusWrap = el('span', { class: 'cs-hud-status cs-tone-muted', 'aria-live': 'polite' },
    el('span', { class: 'cs-dot', 'aria-hidden': 'true' }));
  const statusText = el('span', { class: 'cs-hud-status-text' });
  statusWrap.append(statusText);
  const remainingText = el('span', { class: 'cs-hud-remaining' });
  const activeFill = el('div', { class: 'cs-hud-fill' });
  const activeRow = el('div', { class: 'cs-hud-active', hidden: true },
    el('span', { class: 'cs-hud-active-label' }, 'Active command'),
    el('div', { class: 'cs-hud-track' }, activeFill),
    el('span', { class: 'cs-hud-active-value' }));
  const activeValue = activeRow.lastChild;
  const pauseButton = el('button', { type: 'button', class: 'cs-btn' }, 'Pause');
  const stepButton = el('button', { type: 'button', class: 'cs-btn' }, 'Step');
  const clearButton = el('button', { type: 'button', class: 'cs-btn' }, 'Clear Pending');
  const finishButton = el('button', { type: 'button', class: 'cs-btn' }, 'Finish All');
  const offPreset = el('option', { value: '', text: '' });
  offPreset.hidden = true;
  const speedSelect = el('select', { class: 'cs-select', 'aria-label': 'Playback speed' },
    ...SPEEDS.map((speed) => el('option', { value: String(speed), text: `${speed}x` })),
    offPreset);

  function render() {
    const playback = current.snapshot?.playback ?? null;
    const canServer = canDispatchServer(current);
    const hasWork = Boolean(playback) && playback.remaining > 0;
    const pauseInFlight = pauseAction === 'pause' || current.pending.includes('playback.pause');
    const info = localError
      ? { text: localError, tone: 'error' }
      : statusLabel(playback, pauseInFlight);
    statusWrap.className = `cs-hud-status cs-tone-${info.tone}`;
    statusText.textContent = info.text;
    remainingText.textContent = playback ? `${playback.remaining} commands remaining` : '';
    const active = playback?.active ?? null;
    activeRow.hidden = !active;
    if (active) {
      const fraction = Math.max(0, Math.min(1, Number(active.progress) || 0));
      const percent = Math.round(fraction * 100);
      activeFill.style.width = `${percent}%`;
      activeValue.textContent = `${percent}%`;
    }
    pauseButton.textContent = playback?.status === 'playing' || pauseInFlight ? 'Pause' : 'Resume';
    pauseButton.disabled = pending.has(pauseButton) || !canServer;
    stepButton.disabled = pending.has(stepButton) || !canServer || !hasWork;
    clearButton.disabled = pending.has(clearButton) || !canServer || !hasWork;
    finishButton.disabled = pending.has(finishButton) || !canServer || !hasWork;
    speedSelect.disabled = speedPending !== null || !canServer;
    if (speedPending !== null) {
      const isPreset = SPEEDS.includes(speedPending);
      offPreset.hidden = isPreset;
      if (!isPreset) {
        offPreset.value = String(speedPending);
        offPreset.text = `${speedPending}x`;
      }
      speedSelect.value = String(speedPending);
    } else if (playback) {
      const speed = Number(playback.speed);
      const focused = document.activeElement === speedSelect;
      if (SPEEDS.includes(speed)) {
        offPreset.hidden = true;
        if (!focused && speedSelect.value !== String(speed)) speedSelect.value = String(speed);
      } else if (Number.isFinite(speed)) {
        offPreset.hidden = false;
        offPreset.value = String(speed);
        offPreset.text = `${speed}x`;
        if (!focused) speedSelect.value = String(speed);
      }
    }
  }

  function submit(intent, button) {
    if (button) {
      button.disabled = true;
      pending.add(button);
    }
    render();
    return dispatch(intent).then(
      () => {
        localError = null;
      },
      (error) => {
        localError = error && error.message ? String(error.message) : 'Action failed';
        if (errorTimer) clearTimeout(errorTimer);
        errorTimer = setTimeout(() => {
          localError = null;
          errorTimer = null;
          render();
        }, 4000);
      },
    ).finally(() => {
      if (button) {
        pending.delete(button);
        button.disabled = false;
      }
      render();
    });
  }

  function control(action, button) {
    button.addEventListener('click', () => {
      submit({ type: 'playback.control', action }, button);
    }, { signal: options.signal });
  }

  control('step', stepButton);
  control('clear', clearButton);
  control('finish', finishButton);
  pauseButton.addEventListener('click', () => {
    const playing = current.snapshot?.playback?.status === 'playing';
    pauseAction = playing ? 'pause' : 'resume';
    submit({ type: 'playback.control', action: pauseAction }, pauseButton).finally(() => {
      pauseAction = null;
      render();
    });
  }, { signal: options.signal });
  speedSelect.addEventListener('change', () => {
    const chosen = Number(speedSelect.value);
    speedPending = chosen;
    submit({ type: 'playback.control', action: 'speed', speed: chosen }, null).finally(() => {
      speedPending = null;
      render();
    });
  }, { signal: options.signal });
  speedSelect.addEventListener('blur', () => {
    if (speedPending === null) render();
  }, { signal: options.signal });

  root.append(statusWrap, remainingText, activeRow, pauseButton, stepButton, clearButton, finishButton, speedSelect);
  render();

  return {
    update(next) {
      current = next;
      render();
    },
    destroy() {
      options.abort();
      if (errorTimer) clearTimeout(errorTimer);
      root.classList.remove('cs-hud');
      root.replaceChildren();
    },
  };
}
