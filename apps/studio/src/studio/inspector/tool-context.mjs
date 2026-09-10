import {
  HEX_COLOR,
  canDispatchServer,
  documentColors,
  el,
  findLayer,
  fromPercent,
  fromSize,
  run,
  syncField,
  toPercent,
} from './dom.mjs';

const PRESETS = [2, 8, 16, 24, 48];
const DRAW_TOOLS = new Set(['brush', 'pencil', 'marker', 'eraser']);
const TOOL_TITLES = { brush: 'Brush', pencil: 'Pencil', marker: 'Marker', eraser: 'Eraser' };

export function isDrawingTool(tool) {
  return DRAW_TOOLS.has(tool);
}

export function toolTitle(tool) {
  return TOOL_TITLES[tool] ?? 'Tool';
}

export function createToolPanel({ dispatch, report, signal }) {
  let last = null;
  const rerender = () => {
    if (!signal.aborted && last) render(last);
  };
  const row = (...children) => el('div', { class: 'cs-insp-row' }, ...children);
  const group = (label, ...children) =>
    el('section', { class: 'cs-insp-group', role: 'group', 'aria-label': label },
      el('h3', { class: 'cs-insp-group-label' }, label), ...children);

  const sizeRange = el('input', { type: 'range', class: 'cs-insp-range', min: '1', max: '100', step: '1', 'aria-label': 'Brush size' });
  const sizeNumber = el('input', { type: 'number', class: 'cs-insp-number', min: '1', max: '100', step: '1', 'aria-label': 'Brush size in pixels' });
  const presets = el('div', { class: 'cs-insp-presets', role: 'group', 'aria-label': 'Size presets' },
    ...PRESETS.map((size) => el('button', { type: 'button', class: 'cs-insp-preset', 'data-size': String(size) }, String(size))));
  const opacityRange = el('input', { type: 'range', class: 'cs-insp-range', min: '0', max: '100', step: '1', 'aria-label': 'Opacity' });
  const opacityNumber = el('input', { type: 'number', class: 'cs-insp-number', min: '0', max: '100', step: '1', 'aria-label': 'Opacity percent' });
  const chip = el('input', { type: 'color', class: 'cs-insp-chip', 'aria-label': 'Color picker' });
  const hex = el('input', {
    type: 'text', class: 'cs-insp-hex', spellcheck: 'false', autocomplete: 'off',
    maxlength: '7', placeholder: '#000000', 'aria-label': 'Color hex value',
  });
  const swatchRow = el('div', { class: 'cs-insp-swatches', role: 'group', 'aria-label': 'Document colors' });
  const swatchWrap = el('div', { class: 'cs-insp-swatch-wrap' },
    el('span', { class: 'cs-insp-hint' }, 'Document colors'), swatchRow);
  const targetName = el('span', { class: 'cs-insp-target-name' });
  const hiddenBadge = el('span', { class: 'cs-insp-badge', hidden: true }, 'Hidden');
  const showButton = el('button', { type: 'button', class: 'cs-btn', hidden: true }, 'Show');
  const inspectButton = el('button', { type: 'button', class: 'cs-btn' }, 'Inspect');

  const root = el('div', { class: 'cs-insp-panel' },
    group('Stroke dynamics',
      row(el('span', { class: 'cs-insp-label' }, 'Size'), sizeRange, sizeNumber, el('span', { class: 'cs-insp-unit' }, 'px')),
      presets,
      row(el('span', { class: 'cs-insp-label' }, 'Opacity'), opacityRange, opacityNumber, el('span', { class: 'cs-insp-unit' }, '%')),
    ),
    group('Color', row(chip, hex), swatchWrap),
    group('Target',
      el('div', { class: 'cs-insp-target' },
        el('div', { class: 'cs-insp-target-info' },
          el('span', { class: 'cs-insp-kicker' }, 'Painting onto'),
          el('span', { class: 'cs-insp-target-line' }, targetName, hiddenBadge),
        ),
        el('div', { class: 'cs-insp-target-actions' }, showButton, inspectButton),
      ),
    ),
  );

  const send = (intent, onAccepted) => run(dispatch, intent, report, onAccepted);

  for (const range of [sizeRange, opacityRange]) {
    range.addEventListener('pointerdown', () => { range.dataset.held = 'true'; }, { signal });
    for (const type of ['pointerup', 'pointercancel', 'blur', 'change']) {
      range.addEventListener(type, () => { delete range.dataset.held; }, { signal });
    }
  }

  sizeRange.addEventListener('input', () => {
    if (document.activeElement !== sizeNumber) sizeNumber.value = sizeRange.value;
    send({ type: 'tool.properties', size: Number(sizeRange.value) });
  }, { signal });

  sizeNumber.addEventListener('input', () => {
    const size = fromSize(sizeNumber.value);
    if (size === null) return;
    if (document.activeElement !== sizeRange) sizeRange.value = String(size);
    sizeRange.dataset.dirty = 'true';
    send({ type: 'tool.properties', size });
  }, { signal });

  sizeNumber.addEventListener('blur', () => {
    if (fromSize(sizeNumber.value) === null) rerender();
  }, { signal });

  sizeNumber.addEventListener('change', () => {
    const parsed = Number(sizeNumber.value);
    if (!Number.isFinite(parsed)) {
      rerender();
      return;
    }
    const size = Math.min(100, Math.max(1, Math.round(parsed)));
    sizeNumber.value = String(size);
    sizeRange.value = String(size);
    send({ type: 'tool.properties', size });
  }, { signal });

  presets.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-size]');
    if (button) send({ type: 'tool.properties', size: Number(button.dataset.size) });
  }, { signal });

  opacityRange.addEventListener('input', () => {
    if (document.activeElement !== opacityNumber) opacityNumber.value = opacityRange.value;
    const fraction = fromPercent(opacityRange.value);
    if (fraction !== null) send({ type: 'tool.properties', opacity: fraction });
  }, { signal });

  opacityNumber.addEventListener('input', () => {
    const fraction = fromPercent(opacityNumber.value);
    if (fraction === null) return;
    if (document.activeElement !== opacityRange) opacityRange.value = toPercent(fraction);
    opacityRange.dataset.dirty = 'true';
    send({ type: 'tool.properties', opacity: fraction });
  }, { signal });

  opacityNumber.addEventListener('blur', () => {
    if (fromPercent(opacityNumber.value) === null) rerender();
  }, { signal });

  opacityNumber.addEventListener('change', () => {
    const fraction = fromPercent(opacityNumber.value);
    if (fraction === null) {
      rerender();
      return;
    }
    opacityNumber.value = toPercent(fraction);
    opacityRange.value = toPercent(fraction);
    send({ type: 'tool.properties', opacity: fraction });
  }, { signal });

  chip.addEventListener('input', () => {
    send({ type: 'tool.properties', color: chip.value });
  }, { signal });

  hex.addEventListener('input', () => {
    if (!HEX_COLOR.test(hex.value)) return;
    send({ type: 'tool.properties', color: hex.value.toLowerCase() });
  }, { signal });

  hex.addEventListener('change', () => {
    const value = hex.value.trim().toLowerCase();
    if (HEX_COLOR.test(value)) {
      hex.value = value;
      send({ type: 'tool.properties', color: value });
    } else {
      rerender();
    }
  }, { signal });

  hex.addEventListener('blur', () => {
    if (!HEX_COLOR.test(hex.value.trim().toLowerCase())) rerender();
  }, { signal });

  swatchRow.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-color]');
    if (button) send({ type: 'tool.properties', color: button.dataset.color });
  }, { signal });

  showButton.addEventListener('click', () => {
    const value = last;
    const layer = value && findLayer(value, value.targetLayer);
    if (!layer || !canDispatchServer(value)) return;
    send({ type: 'layer.update', id: layer.id, visible: true, generation: value.snapshot.docGeneration });
  }, { signal });

  inspectButton.addEventListener('click', () => {
    if (last?.targetLayer) send({ type: 'layer.inspect', id: last.targetLayer });
  }, { signal });

  function renderSwatches(colors) {
    for (const child of [...swatchRow.children]) {
      if (!colors.includes(child.dataset.color)) child.remove();
    }
    colors.forEach((color, index) => {
      let button = swatchRow.querySelector(`[data-color="${color}"]`);
      if (!button) {
        button = el('button', {
          type: 'button', class: 'cs-insp-swatch', 'data-color': color,
          title: color, 'aria-label': `Use color ${color}`,
        });
        button.style.backgroundColor = color;
      }
      if (swatchRow.children[index] !== button) {
        const next = swatchRow.children[index];
        if (next) next.before(button);
        else swatchRow.append(button);
      }
    });
  }

  function render(value) {
    last = value;
    const canServer = canDispatchServer(value);
    const size = Math.min(100, Math.max(1, Number(value.size)));
    syncField(sizeRange, size);
    syncField(sizeNumber, size);
    const percent = Math.round(value.opacity * 100);
    syncField(opacityRange, percent);
    syncField(opacityNumber, percent);
    for (const button of presets.children) {
      button.setAttribute('aria-pressed', Number(button.dataset.size) === size ? 'true' : 'false');
    }
    syncField(chip, value.color);
    syncField(hex, value.color);
    const colors = documentColors(value);
    renderSwatches(colors);
    swatchWrap.hidden = colors.length === 0;
    const layer = value.targetLayer ? findLayer(value, value.targetLayer) : null;
    targetName.textContent = layer ? layer.name : 'No layer selected';
    hiddenBadge.hidden = !layer || layer.visible;
    showButton.hidden = !layer || layer.visible;
    showButton.disabled = !canServer;
    inspectButton.disabled = !layer;
  }

  return { root, render };
}
