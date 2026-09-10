import { canDispatchServer, el, findLayer, fromPercent, run, syncField, toPercent } from './dom.mjs';

export function createLayerPanel({ dispatch, report, signal }) {
  let last = null;
  let session = null;
  const rerender = () => {
    if (!signal.aborted && last) render(last);
  };
  const row = (...children) => el('div', { class: 'cs-insp-row' }, ...children);

  const returnButton = el('button', { type: 'button', class: 'cs-insp-return' },
    el('span', { 'aria-hidden': 'true' }, '←'), 'Return to Brush Properties (B)');
  const nameInput = el('input', {
    type: 'text', class: 'cs-insp-name', spellcheck: 'false', autocomplete: 'off',
    maxlength: '80', 'aria-label': 'Layer name',
  });
  const visibilityButton = el('button', { type: 'button', class: 'cs-btn cs-insp-visibility', 'aria-pressed': 'true' });
  const opacityRange = el('input', { type: 'range', class: 'cs-insp-range', min: '0', max: '100', step: '1', 'aria-label': 'Layer opacity' });
  const opacityNumber = el('input', { type: 'number', class: 'cs-insp-number', min: '0', max: '100', step: '1', 'aria-label': 'Layer opacity percent' });
  const pendingLabel = el('span', { class: 'cs-insp-pending', hidden: true }, 'Pending…');
  const note = el('p', { class: 'cs-insp-note', hidden: true }, 'This layer is no longer in the document.');

  const root = el('div', { class: 'cs-insp-panel' },
    returnButton,
    el('section', { class: 'cs-insp-group', role: 'group', 'aria-label': 'Layer attributes' },
      el('h3', { class: 'cs-insp-group-label' }, 'Layer attributes'),
      row(el('span', { class: 'cs-insp-label' }, 'Name'), nameInput),
      row(el('span', { class: 'cs-insp-label' }, 'Visibility'), visibilityButton),
      row(el('span', { class: 'cs-insp-label' }, 'Opacity'), opacityRange, opacityNumber, el('span', { class: 'cs-insp-unit' }, '%')),
      el('div', { class: 'cs-insp-status' }, pendingLabel),
    ),
    note,
  );

  const send = (intent) => run(dispatch, intent, report, null);
  const currentLayer = () => (last && last.targetLayer ? findLayer(last, last.targetLayer) : null);

  // Freeze instance/generation/layer at edit start; commits carry the frozen generation.
  function freezeSession(layer) {
    if (session && session.id === layer.id) return session;
    session = {
      id: layer.id,
      instanceId: last?.snapshot?.instanceId ?? null,
      generation: last?.snapshot?.docGeneration ?? null,
      inflight: 0,
      nameInFlight: false,
      opacityInFlight: false,
      visibilityInFlight: false,
    };
    return session;
  }

  function restoreValues(layer) {
    nameInput.value = layer ? layer.name : '';
    const percent = layer ? String(Math.round(layer.opacity * 100)) : '0';
    opacityRange.value = percent;
    opacityNumber.value = percent;
  }

  function cancelSession() {
    session = null;
    const active = document.activeElement;
    if (active === nameInput || active === opacityRange || active === opacityNumber) active.blur();
    delete opacityRange.dataset.held;
    for (const field of [nameInput, opacityRange, opacityNumber]) delete field.dataset.dirty;
    pendingLabel.hidden = true;
    restoreValues(currentLayer());
  }

  function reconcileSession(value, layer) {
    if (!session) return;
    const rotated = session.instanceId !== value.snapshot?.instanceId
      || session.generation !== value.snapshot?.docGeneration;
    if (rotated || !layer || session.id !== value.targetLayer) cancelSession();
  }

  function renderPending(current) {
    pendingLabel.hidden = !(session === current && current.inflight > 0);
  }

  function finish(current, field) {
    if (session === current) {
      current[field] = false;
      current.inflight -= 1;
      renderPending(current);
    }
    rerender();
  }

  function commitName() {
    const current = session;
    if (!last || !current || current.nameInFlight) return;
    const layer = findLayer(last, current.id);
    if (!layer || !canDispatchServer(last)) return;
    const raw = nameInput.value;
    const name = raw.trim();
    if (!name || name.length > 80) {
      nameInput.dataset.dirty = 'true';
      report('Layer name must be 1–80 characters');
      return;
    }
    if (name === layer.name) {
      nameInput.value = name;
      delete nameInput.dataset.dirty;
      return;
    }
    current.nameInFlight = true;
    current.inflight += 1;
    nameInput.dataset.dirty = 'true';
    nameInput.disabled = true;
    renderPending(current);
    send({ type: 'layer.update', id: current.id, name, generation: current.generation })
      .then(() => finish(current, 'nameInFlight'));
  }

  function commitOpacity() {
    const current = session;
    if (!last || !current || current.opacityInFlight) return;
    const layer = findLayer(last, current.id);
    if (!layer || !canDispatchServer(last)) return;
    if (document.activeElement === opacityNumber && opacityNumber.value.trim() === '') {
      rerender();
      return;
    }
    const fraction = fromPercent(opacityRange.value);
    if (fraction === null) {
      rerender();
      return;
    }
    if (fraction === layer.opacity) {
      delete opacityRange.dataset.dirty;
      delete opacityNumber.dataset.dirty;
      return;
    }
    current.opacityInFlight = true;
    current.inflight += 1;
    opacityRange.dataset.dirty = 'true';
    opacityNumber.dataset.dirty = 'true';
    opacityRange.disabled = true;
    opacityNumber.disabled = true;
    renderPending(current);
    send({ type: 'layer.update', id: current.id, opacity: fraction, generation: current.generation })
      .then(() => finish(current, 'opacityInFlight'));
  }

  returnButton.addEventListener('click', () => {
    send({ type: 'tool.return' }).then(rerender);
  }, { signal });

  for (const field of [nameInput, opacityRange, opacityNumber]) {
    field.addEventListener('focus', () => {
      const layer = currentLayer();
      if (layer) freezeSession(layer);
    }, { signal });
    field.addEventListener('input', () => {
      const layer = currentLayer();
      if (layer) freezeSession(layer);
    }, { signal });
  }

  opacityRange.addEventListener('pointerdown', () => {
    opacityRange.dataset.held = 'true';
    const layer = currentLayer();
    if (layer) freezeSession(layer);
  }, { signal });
  for (const type of ['pointerup', 'pointercancel', 'blur', 'change']) {
    opacityRange.addEventListener(type, () => { delete opacityRange.dataset.held; }, { signal });
  }

  nameInput.addEventListener('change', commitName, { signal });
  nameInput.addEventListener('blur', commitName, { signal });

  opacityRange.addEventListener('input', () => {
    if (document.activeElement !== opacityNumber) opacityNumber.value = opacityRange.value;
    opacityNumber.dataset.dirty = 'true';
  }, { signal });
  opacityRange.addEventListener('change', commitOpacity, { signal });
  opacityRange.addEventListener('blur', commitOpacity, { signal });

  opacityNumber.addEventListener('input', () => {
    const fraction = fromPercent(opacityNumber.value);
    if (fraction === null) return;
    if (document.activeElement !== opacityRange) opacityRange.value = toPercent(fraction);
    opacityRange.dataset.dirty = 'true';
  }, { signal });
  opacityNumber.addEventListener('change', commitOpacity, { signal });
  opacityNumber.addEventListener('blur', commitOpacity, { signal });

  visibilityButton.addEventListener('click', () => {
    const value = last;
    const layer = currentLayer();
    if (!value || !layer || !canDispatchServer(value)) return;
    const current = freezeSession(layer);
    if (current.visibilityInFlight) return;
    current.visibilityInFlight = true;
    current.inflight += 1;
    visibilityButton.disabled = true;
    renderPending(current);
    send({ type: 'layer.update', id: layer.id, visible: !layer.visible, generation: current.generation })
      .then(() => finish(current, 'visibilityInFlight'));
  }, { signal });

  function render(value) {
    last = value;
    const layer = currentLayer();
    const canServer = canDispatchServer(value);
    reconcileSession(value, layer);
    const current = session && layer && session.id === layer.id ? session : null;
    const missing = !layer;
    note.hidden = !missing;
    nameInput.disabled = missing || !canServer || Boolean(current?.nameInFlight);
    visibilityButton.disabled = missing || !canServer || Boolean(current?.visibilityInFlight);
    opacityRange.disabled = missing || !canServer || Boolean(current?.opacityInFlight);
    opacityNumber.disabled = missing || !canServer || Boolean(current?.opacityInFlight);
    if (missing) {
      restoreValues(null);
      visibilityButton.textContent = '—';
      visibilityButton.removeAttribute('aria-pressed');
      pendingLabel.hidden = true;
      return;
    }
    syncField(nameInput, layer.name);
    visibilityButton.textContent = layer.visible ? 'Visible' : 'Hidden';
    visibilityButton.setAttribute('aria-pressed', layer.visible ? 'true' : 'false');
    const percent = Math.round(layer.opacity * 100);
    syncField(opacityRange, percent);
    syncField(opacityNumber, percent);
    pendingLabel.hidden = !current || current.inflight === 0;
  }

  return { root, render, cancel: cancelSession };
}
