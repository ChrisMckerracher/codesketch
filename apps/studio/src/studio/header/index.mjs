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

function statusInfo(value, sending, applied) {
  const snap = value.snapshot;
  if (snap?.storageError) return { text: `Storage error: ${snap.storageError}`, tone: 'error' };
  if (snap?.playbackError) return { text: `Playback error: ${snap.playbackError}`, tone: 'error' };
  if (value.connection === 'offline') return { text: 'Offline', tone: 'offline' };
  if (value.connection === 'uncertain') return { text: 'Connection uncertain', tone: 'warn' };
  if (value.connection === 'connecting') return { text: 'Connecting', tone: 'muted' };
  if (sending) return { text: 'Sending…', tone: 'warn' };
  if (applied) return { text: 'Changes applied', tone: 'ok' };
  return { text: 'Connected', tone: 'ok' };
}

const MENU_ID = 'cs-document-menu';

export function mount({ root, model, dispatch }) {
  root.classList.add('cs-header');
  let current = model;
  let localError = null;
  let errorTimer = null;
  let localPending = 0;
  let lastRevision = current.snapshot?.revision ?? null;
  let appliedUntil = 0;
  let appliedTimer = null;
  const pending = new Set();
  const options = new AbortController();

  const brand = el('span', { class: 'cs-brand', 'aria-hidden': 'true' });
  const filenameInput = el('input', {
    type: 'text', class: 'cs-filename', value: current.filename,
    spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Filename',
  });
  filenameInput.addEventListener('change', () => {
    submit({ type: 'filename.set', value: filenameInput.value }, null);
  }, { signal: options.signal });

  const menuButton = el('button', {
    type: 'button', class: 'cs-btn', popovertarget: MENU_ID,
    'aria-haspopup': 'menu', 'aria-expanded': 'false',
  }, 'Document');
  const menuList = el('div', { class: 'cs-menu-list', id: MENU_ID, popover: 'auto' });
  const fileInput = el('input', { type: 'file', accept: 'application/json,.json', class: 'cs-sr' });

  function menuItem(label, intentFactory) {
    const button = el('button', { type: 'button', class: 'cs-menu-item' }, label);
    button.addEventListener('click', () => {
      if (menuList.matches(':popover-open')) menuList.hidePopover();
      const intent = intentFactory();
      if (intent) submit(intent, button);
    }, { signal: options.signal });
    menuList.append(button);
    return button;
  }

  const newButton = menuItem('New Document', () => ({ type: 'document.new' }));
  const demoButton = menuItem('Load Example Composition', () => ({ type: 'document.demo' }));
  const openButton = menuItem('Open Project JSON…', () => {
    fileInput.click();
    return null;
  });
  const saveButton = menuItem('Save Project JSON', () => ({ type: 'project.save' }));
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (file) submit({ type: 'project.open', file }, openButton);
  }, { signal: options.signal });

  function positionMenu() {
    if (!menuList.matches(':popover-open')) return;
    const rect = menuButton.getBoundingClientRect();
    menuList.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 200))}px`;
    menuList.style.top = `${Math.round(rect.bottom + 4)}px`;
  }

  menuList.addEventListener('toggle', (event) => {
    menuButton.setAttribute('aria-expanded', event.newState === 'open' ? 'true' : 'false');
    if (event.newState === 'open') positionMenu();
  }, { signal: options.signal });
  window.addEventListener('resize', positionMenu, { signal: options.signal });
  window.addEventListener('scroll', positionMenu, { capture: true, passive: true, signal: options.signal });

  const statusText = el('span', { class: 'cs-status-text' });
  const status = el('div', { class: 'cs-status cs-tone-muted' }, el('span', { class: 'cs-dot', 'aria-hidden': 'true' }), statusText);
  const undoButton = el('button', { type: 'button', class: 'cs-btn' }, 'Undo');
  const redoButton = el('button', { type: 'button', class: 'cs-btn' }, 'Redo');
  const fitButton = el('button', { type: 'button', class: 'cs-btn' }, 'Fit');
  const zoomButton = el('button', { type: 'button', class: 'cs-btn' }, '100%');
  const exportButton = el('button', { type: 'button', class: 'cs-btn cs-btn-primary' }, 'Export PNG');
  exportButton.setAttribute('aria-label', 'Export PNG (committed artwork)');

  function render() {
    const snap = current.snapshot;
    if (document.activeElement !== filenameInput && filenameInput.value !== current.filename) {
      filenameInput.value = current.filename;
    }
    const canServer = Boolean(snap) && current.connection !== 'offline' && current.connection !== 'uncertain';
    for (const button of [newButton, demoButton, openButton, saveButton, exportButton]) {
      button.disabled = pending.has(button) || !canServer;
    }
    const history = snap?.history;
    undoButton.disabled = pending.has(undoButton) || !canServer || !history || history.cursor <= 0;
    redoButton.disabled = pending.has(redoButton) || !canServer || !history || history.cursor >= history.total;
    fitButton.setAttribute('aria-pressed', current.viewport.mode === 'fit' ? 'true' : 'false');
    zoomButton.setAttribute('aria-pressed', current.viewport.mode === 'manual' && current.viewport.scale === 1 ? 'true' : 'false');
    const sending = localPending > 0 || current.pending.length > 0;
    const applied = Date.now() < appliedUntil;
    const info = localError ? { text: localError, tone: 'error' } : statusInfo(current, sending, applied);
    statusText.textContent = info.text;
    status.className = `cs-status cs-tone-${info.tone}`;
  }

  function observe() {
    const revision = current.snapshot?.revision ?? null;
    if (revision === null || revision === lastRevision) return;
    lastRevision = revision;
    appliedUntil = Date.now() + 2000;
    if (appliedTimer) clearTimeout(appliedTimer);
    appliedTimer = setTimeout(() => {
      appliedTimer = null;
      render();
    }, 2000);
  }

  function submit(intent, button) {
    localPending += 1;
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
      localPending -= 1;
      if (button) {
        pending.delete(button);
        button.disabled = false;
      }
      render();
    });
  }

  function action(button, intentFactory) {
    button.addEventListener('click', () => {
      const intent = intentFactory();
      if (intent) submit(intent, button);
    }, { signal: options.signal });
  }

  action(undoButton, () => ({ type: 'playback.control', action: 'undo' }));
  action(redoButton, () => ({ type: 'playback.control', action: 'redo' }));
  action(fitButton, () => ({ type: 'view.fit' }));
  action(zoomButton, () => ({ type: 'view.actual' }));
  action(exportButton, () => ({ type: 'png.export' }));

  root.append(
    brand,
    filenameInput,
    menuButton,
    el('div', { class: 'cs-header-spacer' }),
    status,
    el('div', { class: 'cs-header-spacer' }),
    undoButton,
    redoButton,
    el('span', { class: 'cs-header-sep', 'aria-hidden': 'true' }),
    fitButton,
    zoomButton,
    el('span', { class: 'cs-header-sep', 'aria-hidden': 'true' }),
    exportButton,
    fileInput,
    menuList,
  );
  render();

  return {
    update(next) {
      current = next;
      observe();
      render();
    },
    destroy() {
      options.abort();
      if (errorTimer) clearTimeout(errorTimer);
      if (appliedTimer) clearTimeout(appliedTimer);
      root.classList.remove('cs-header');
      root.replaceChildren();
    },
  };
}
