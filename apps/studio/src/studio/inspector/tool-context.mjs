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
const SHAPE_TOOLS = new Set(['rect', 'ellipse']);
const TOOL_TITLES = {
  brush: 'Brush', pencil: 'Pencil', marker: 'Marker', eraser: 'Eraser',
  rect: 'Rectangle', ellipse: 'Ellipse',
};

export function isDrawingTool(tool) {
  return DRAW_TOOLS.has(tool);
}

export function isShapeTool(tool) {
  return SHAPE_TOOLS.has(tool);
}

export function toolTitle(tool) {
  return TOOL_TITLES[tool] ?? 'Tool';
}

function wireColorPair(chip, hex, { signal, send, rerender }) {
  chip.addEventListener('input', () => send({ type: 'tool.properties', color: chip.value }), { signal });
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
}

function wireFractionPair(range, number, { signal, rerender, onInput, onCommit }) {
  range.addEventListener('input', () => {
    if (document.activeElement !== number) number.value = range.value;
    number.dataset.dirty = 'true';
    onInput();
  }, { signal });
  number.addEventListener('input', () => {
    const fraction = fromPercent(number.value);
    if (fraction === null) return;
    if (document.activeElement !== range) range.value = toPercent(fraction);
    range.dataset.dirty = 'true';
    onInput();
  }, { signal });
  number.addEventListener('blur', () => {
    if (fromPercent(number.value) === null) rerender();
  }, { signal });
  number.addEventListener('change', () => {
    const fraction = fromPercent(number.value);
    if (fraction === null) {
      rerender();
      return;
    }
    number.value = toPercent(fraction);
    range.value = toPercent(fraction);
    onCommit(fraction);
  }, { signal });
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
  const percentRange = (label) =>
    el('input', { type: 'range', class: 'cs-insp-range', min: '0', max: '100', step: '1', 'aria-label': label });
  const percentNumber = (label) =>
    el('input', { type: 'number', class: 'cs-insp-number', min: '0', max: '100', step: '1', 'aria-label': label });

  const sizeRange = el('input', { type: 'range', class: 'cs-insp-range', min: '1', max: '100', step: '1', 'aria-label': 'Brush size' });
  const sizeNumber = el('input', { type: 'number', class: 'cs-insp-number', min: '1', max: '100', step: '1', 'aria-label': 'Brush size in pixels' });
  const presets = el('div', { class: 'cs-insp-presets', role: 'group', 'aria-label': 'Size presets' },
    ...PRESETS.map((size) => el('button', { type: 'button', class: 'cs-insp-preset', 'data-size': String(size) }, String(size))));
  const opacityRange = percentRange('Opacity');
  const opacityNumber = percentNumber('Opacity percent');
  const chip = el('input', { type: 'color', class: 'cs-insp-chip', 'aria-label': 'Color picker' });
  const hex = el('input', {
    type: 'text', class: 'cs-insp-hex', spellcheck: 'false', autocomplete: 'off',
    maxlength: '7', placeholder: '#000000', 'aria-label': 'Color hex value',
  });
  const swatchRow = el('div', { class: 'cs-insp-swatches', role: 'group', 'aria-label': 'Document colors' });
  const swatchWrap = el('div', { class: 'cs-insp-swatch-wrap' },
    el('span', { class: 'cs-insp-hint' }, 'Document colors'), swatchRow);
  const fillRange = percentRange('Fill opacity');
  const fillNumber = percentNumber('Fill opacity percent');
  const fillChip = el('input', { type: 'color', class: 'cs-insp-chip', 'aria-label': 'Fill color picker' });
  const fillHex = el('input', {
    type: 'text', class: 'cs-insp-hex', spellcheck: 'false', autocomplete: 'off',
    maxlength: '7', placeholder: '#000000', 'aria-label': 'Fill color hex value',
  });
  const draftLine = el('p', { class: 'cs-insp-draft', hidden: true });
  const targetName = el('span', { class: 'cs-insp-target-name' });
  const hiddenBadge = el('span', { class: 'cs-insp-badge', hidden: true }, 'Hidden');
  const showButton = el('button', { type: 'button', class: 'cs-btn', hidden: true }, 'Show');
  const inspectButton = el('button', { type: 'button', class: 'cs-btn' }, 'Inspect');

  const strokeGroup = group('Stroke dynamics',
    row(el('span', { class: 'cs-insp-label' }, 'Size'), sizeRange, sizeNumber, el('span', { class: 'cs-insp-unit' }, 'px')),
    presets,
    row(el('span', { class: 'cs-insp-label' }, 'Opacity'), opacityRange, opacityNumber, el('span', { class: 'cs-insp-unit' }, '%')),
  );
  const colorGroup = group('Color', row(chip, hex), swatchWrap);
  const fillGroup = group('Fill',
    row(fillChip, fillHex),
    row(el('span', { class: 'cs-insp-label' }, 'Opacity'), fillRange, fillNumber, el('span', { class: 'cs-insp-unit' }, '%')),
    draftLine,
  );
  const targetGroup = group('Target',
    el('div', { class: 'cs-insp-target' },
      el('div', { class: 'cs-insp-target-info' },
        el('span', { class: 'cs-insp-kicker' }, 'Painting onto'),
        el('span', { class: 'cs-insp-target-line' }, targetName, hiddenBadge),
      ),
      el('div', { class: 'cs-insp-target-actions' }, showButton, inspectButton),
    ),
  );
  const root = el('div', { class: 'cs-insp-panel' }, strokeGroup, colorGroup, fillGroup, targetGroup);

  const send = (intent, onAccepted) => run(dispatch, intent, report, onAccepted);
  const fractionHandlers = (range, number) => ({
    onInput: () => {
      const fraction = fromPercent(range.value);
      if (fraction !== null) send({ type: 'tool.properties', opacity: fraction });
    },
    onCommit: (fraction) => {
      number.value = toPercent(fraction);
      range.value = toPercent(fraction);
      send({ type: 'tool.properties', opacity: fraction });
    },
  });

  for (const range of [sizeRange, opacityRange, fillRange]) {
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

  wireFractionPair(opacityRange, opacityNumber, { signal, rerender, ...fractionHandlers(opacityRange, opacityNumber) });
  wireFractionPair(fillRange, fillNumber, { signal, rerender, ...fractionHandlers(fillRange, fillNumber) });
  wireColorPair(chip, hex, { signal, send, rerender });
  wireColorPair(fillChip, fillHex, { signal, send, rerender });

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
    const drawing = isDrawingTool(value.tool);
    const shaping = isShapeTool(value.tool);
    strokeGroup.hidden = !drawing;
    colorGroup.hidden = !drawing;
    fillGroup.hidden = !shaping;
    const size = Math.min(100, Math.max(1, Number(value.size)));
    syncField(sizeRange, size);
    syncField(sizeNumber, size);
    for (const button of presets.children) {
      button.setAttribute('aria-pressed', Number(button.dataset.size) === size ? 'true' : 'false');
    }
    const percent = Math.round(value.opacity * 100);
    syncField(opacityRange, percent);
    syncField(opacityNumber, percent);
    syncField(chip, value.color);
    syncField(hex, value.color);
    const fillPercent = Math.round(value.opacity * 100);
    syncField(fillRange, fillPercent);
    syncField(fillNumber, fillPercent);
    syncField(fillChip, value.color);
    syncField(fillHex, value.color);
    const draft = shaping ? value.draft : null;
    const dims = draft && draft.type === value.tool
      && Number.isFinite(draft.width) && Number.isFinite(draft.height)
      ? `Draft ${Math.round(draft.width)} × ${Math.round(draft.height)} px`
      : null;
    draftLine.hidden = dims === null;
    if (dims !== null) draftLine.textContent = dims;
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
