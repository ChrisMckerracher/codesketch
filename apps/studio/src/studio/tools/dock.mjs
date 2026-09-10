import { el, svgIcon, TOOL_LABELS, canDispatchServer } from './shared.mjs';

const ICONS = {
  hand: '<path d="M8 12.5V5.5a1.5 1.5 0 0 1 3 0V11m0-5.5v-1a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V13m-9-.5-1.2-1.6a1.4 1.4 0 0 0-2.3 1.5l2.1 4.7A7 7 0 0 0 12.9 21h.6a6.5 6.5 0 0 0 6.5-6.5V8.5a1.5 1.5 0 0 0-3 0"/>',
  brush: '<path d="M14.5 3.5 20.5 9.5 12 18H6v-6L14.5 3.5Z"/><path d="m12.5 5.5 6 6"/><path d="M6 18c-1.6.4-2.6 1.7-2.8 3.3 1.6.1 3.2-.8 3.8-2.3"/>',
  pencil: '<path d="m4 20 1.2-4.2L16.7 4.3a2.1 2.1 0 0 1 3 3L8.2 18.8 4 20Z"/><path d="m14.5 6.5 3 3"/>',
  marker: '<path d="M5 20.5h14"/><path d="m7.5 14.5 1-8a1.8 1.8 0 0 1 1.8-1.5h3.4a1.8 1.8 0 0 1 1.8 1.5l1 8"/><path d="M6 14.5h12l-.5 3.5h-11L6 14.5Z"/>',
  eraser: '<path d="M8.5 20.5H4l-.5-4L14 6l5.5 5.5-9 9h-2Z"/><path d="m11.5 8.5 5.5 5.5"/><path d="M13 20.5h8"/>',
  rect: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="8" ry="6.5"/>',
  comment: '<path d="M4 5h16v11H10l-6 4V5Z"/>',
};

const KEYS = { hand: 'H', brush: 'B', pencil: 'Shift+P', marker: 'M', eraser: 'E', rect: 'R', ellipse: 'O', comment: 'C' };
const GROUPS = [
  { label: 'Navigation', tools: ['hand'], zoom: true },
  { label: 'Drawing instruments', tools: ['brush', 'pencil', 'marker', 'eraser'] },
  { label: 'Geometric shapes', tools: ['rect', 'ellipse'] },
  { label: 'Feedback', tools: ['comment'] },
];
const ZOOM_PRESETS = [['0.25', '25%'], ['0.5', '50%'], ['1', '100%'], ['2', '200%'], ['4', '400%']];

export function createDock(root, dispatch, signal) {
  root.classList.add('cs-dock');
  const toolButtons = new Map();
  let offPreset = null;
  let zoomSelect = null;

  GROUPS.forEach((group, index) => {
    if (index > 0) root.append(el('span', { class: 'cs-dock-divider', 'aria-hidden': 'true' }));
    const wrap = el('div', { class: 'cs-dock-group', role: 'group', 'aria-label': group.label });
    for (const tool of group.tools) {
      const label = TOOL_LABELS[tool];
      const button = el('button', {
        type: 'button', class: 'cs-dock-btn', 'aria-pressed': 'false',
        'aria-label': `${label} (${KEYS[tool]})`, title: `${label} (${KEYS[tool]})`,
      });
      button.innerHTML = svgIcon(ICONS[tool]);
      button.addEventListener('click', () => {
        if (tool === 'comment') {
          dispatch({ type: 'review.begin', scope: 'region' }).catch(() => {});
          dispatch({ type: 'tab.select', tab: 'feedback' }).catch(() => {});
          dispatch({ type: 'drawer.set', side: 'left', open: true }).catch(() => {});
          return;
        }
        dispatch({ type: 'tool.select', tool }).catch(() => {});
      }, { signal });
      toolButtons.set(tool, button);
      wrap.append(button);
    }
    if (group.zoom) {
      offPreset = el('option', { value: '', text: '' });
      offPreset.hidden = true;
      zoomSelect = el('select', { class: 'cs-dock-zoom', 'aria-label': 'Zoom' },
        el('option', { value: 'fit', text: 'Fit' }),
        ...ZOOM_PRESETS.map(([value, text]) => el('option', { value, text })),
        offPreset);
      zoomSelect.addEventListener('change', () => {
        if (zoomSelect.value === 'fit') dispatch({ type: 'view.fit' }).catch(() => {});
        else dispatch({ type: 'view.zoom', scale: Number(zoomSelect.value) }).catch(() => {});
      }, { signal });
      wrap.append(zoomSelect);
    }
    root.append(wrap);
  });

  function update(value) {
    for (const [tool, button] of toolButtons) {
      button.setAttribute('aria-pressed', value.tool === tool ? 'true' : 'false');
    }
    const commentButton = toolButtons.get('comment');
    commentButton.disabled = !canDispatchServer(value);
    const view = value.viewport;
    const focused = document.activeElement === zoomSelect;
    if (view.mode === 'fit') {
      offPreset.hidden = true;
      if (!focused && zoomSelect.value !== 'fit') zoomSelect.value = 'fit';
    } else {
      const preset = ZOOM_PRESETS.find(([scale]) => scale === String(view.scale));
      offPreset.hidden = Boolean(preset);
      if (!preset) {
        offPreset.value = String(view.scale);
        offPreset.text = `${Math.round(view.scale * 100)}%`;
      }
      if (!focused) zoomSelect.value = preset ? preset[0] : String(view.scale);
    }
  }

  return {
    update,
    destroy() {
      root.classList.remove('cs-dock');
      root.replaceChildren();
    },
  };
}
