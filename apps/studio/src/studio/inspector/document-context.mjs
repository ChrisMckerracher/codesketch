import { HEX_COLOR, canDispatchServer, el, run, syncField } from './dom.mjs';

export function createDocumentPanel({ dispatch, report, signal }) {
  let last = null;
  let edit = null;
  let backgroundPending = false;
  let examplePending = false;
  const rerender = () => {
    if (!signal.aborted && last) render(last);
  };
  const row = (...children) => el('div', { class: 'cs-insp-row' }, ...children);
  const group = (label, ...children) =>
    el('section', { class: 'cs-insp-group', role: 'group', 'aria-label': label },
      el('h3', { class: 'cs-insp-group-label' }, label), ...children);

  const dimsValue = el('span', { class: 'cs-insp-dims' }, '—');
  const chip = el('input', { type: 'color', class: 'cs-insp-chip', 'aria-label': 'Canvas background color' });
  const hex = el('input', {
    type: 'text', class: 'cs-insp-hex', spellcheck: 'false', autocomplete: 'off',
    maxlength: '7', placeholder: '#000000', 'aria-label': 'Canvas background hex value',
  });
  const exampleButton = el('button', { type: 'button', class: 'cs-btn' }, 'Load Example Composition');

  const root = el('div', { class: 'cs-insp-panel' },
    group('Canvas', row(el('span', { class: 'cs-insp-label' }, 'Dimensions'), dimsValue)),
    group('Background', row(chip, hex)),
    group('Example', exampleButton),
  );

  const send = (intent) => run(dispatch, intent, report, null);
  const currentDocument = () => last?.snapshot?.document ?? null;
  const ownedFocus = () => {
    const active = document.activeElement;
    return active === chip || active === hex ? active : null;
  };

  // Freeze instance/generation at edit start so a held color edit cannot alter a replacement document.
  function freezeEdit() {
    if (edit) return edit;
    edit = {
      instanceId: last?.snapshot?.instanceId ?? null,
      generation: last?.snapshot?.docGeneration ?? null,
    };
    return edit;
  }

  function cancelEdit() {
    edit = null;
    const active = ownedFocus();
    if (active) active.blur();
    delete chip.dataset.dirty;
    delete hex.dataset.dirty;
    const documentValue = currentDocument();
    if (documentValue) {
      chip.value = documentValue.background;
      hex.value = documentValue.background;
    }
  }

  function reconcileEdit(value) {
    if (!edit) return;
    const rotated = edit.instanceId !== value.snapshot?.instanceId
      || edit.generation !== value.snapshot?.docGeneration;
    if (rotated) cancelEdit();
  }

  function setBackground(control, color) {
    if (!edit || backgroundPending || !canDispatchServer(last)) {
      rerender();
      return;
    }
    backgroundPending = true;
    control.dataset.dirty = 'true';
    chip.disabled = true;
    hex.disabled = true;
    send({ type: 'background.set', color, generation: edit.generation }).then(() => {
      backgroundPending = false;
      rerender();
    });
  }

  for (const field of [chip, hex]) {
    field.addEventListener('focus', () => freezeEdit(), { signal });
    field.addEventListener('pointerdown', () => freezeEdit(), { signal });
  }

  chip.addEventListener('change', () => setBackground(chip, chip.value), { signal });

  hex.addEventListener('change', () => {
    const value = hex.value.trim().toLowerCase();
    if (!HEX_COLOR.test(value)) {
      rerender();
      return;
    }
    hex.value = value;
    setBackground(hex, value);
  }, { signal });

  hex.addEventListener('blur', () => {
    if (!HEX_COLOR.test(hex.value.trim().toLowerCase())) rerender();
  }, { signal });

  exampleButton.addEventListener('click', () => {
    if (examplePending || !canDispatchServer(last)) return;
    examplePending = true;
    exampleButton.disabled = true;
    send({ type: 'document.demo' }).then(() => {
      examplePending = false;
      rerender();
    });
  }, { signal });

  function render(value) {
    last = value;
    const documentValue = currentDocument();
    const canServer = canDispatchServer(value);
    reconcileEdit(value);
    dimsValue.textContent = documentValue ? `${documentValue.width} × ${documentValue.height} px` : '—';
    chip.disabled = !canServer || backgroundPending;
    hex.disabled = !canServer || backgroundPending;
    exampleButton.disabled = !canServer || examplePending;
    if (documentValue) {
      syncField(chip, documentValue.background);
      syncField(hex, documentValue.background);
    }
  }

  return { root, render, cancel: cancelEdit };
}
