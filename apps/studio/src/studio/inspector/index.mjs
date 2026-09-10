import { el, findLayer } from './dom.mjs';
import { createToolPanel, isDrawingTool, toolTitle } from './tool-context.mjs';
import { createLayerPanel } from './layer-context.mjs';

export function mount({ root, model, dispatch }) {
  root.classList.add('cs-inspector');
  let current = model;
  let localError = null;
  let errorTimer = null;
  const options = new AbortController();

  const title = el('h2', { class: 'cs-insp-title' });
  const subtitle = el('p', { class: 'cs-insp-subtitle' });
  const head = el('header', { class: 'cs-insp-head' }, title, subtitle);
  const notice = el('p', { class: 'cs-insp-notice' });
  const body = el('div', { class: 'cs-insp-body' });

  const report = (message) => {
    if (options.signal.aborted) return;
    localError = message;
    if (errorTimer) clearTimeout(errorTimer);
    paint();
    errorTimer = setTimeout(() => {
      errorTimer = null;
      localError = null;
      paint();
    }, 4000);
  };

  const toolPanel = createToolPanel({ dispatch, report, signal: options.signal });
  const layerPanel = createLayerPanel({ dispatch, report, signal: options.signal });
  // Shape and document context panels join this map in the next unit.
  const panels = { tool: toolPanel, layer: layerPanel };
  body.append(toolPanel.root, layerPanel.root);

  function route(value) {
    if (value.context === 'layer') return 'layer';
    if (value.context === 'tool' && isDrawingTool(value.tool)) return 'tool';
    return null;
  }

  function paint() {
    if (options.signal.aborted) return;
    const active = route(current);
    if (active !== 'layer') layerPanel.cancel();
    for (const [name, panel] of Object.entries(panels)) {
      panel.root.hidden = name !== active;
    }
    if (active === 'tool') {
      title.textContent = `${toolTitle(current.tool)} Properties`;
      subtitle.textContent = 'Contextual Tool Inspector';
      toolPanel.render(current);
    } else if (active === 'layer') {
      const layer = current.targetLayer ? findLayer(current, current.targetLayer) : null;
      title.textContent = 'Layer Properties';
      subtitle.textContent = layer ? `${layer.name} (Selected)` : 'No selected layer';
      layerPanel.render(current);
    } else {
      title.textContent = 'Properties';
      subtitle.textContent = 'Contextual Tool Inspector';
    }
    notice.textContent = localError ?? '';
    notice.hidden = !localError;
  }

  root.append(head, body, notice);
  paint();

  return {
    update(next) {
      current = next;
      paint();
    },
    destroy() {
      options.abort();
      if (errorTimer) clearTimeout(errorTimer);
      root.classList.remove('cs-inspector');
      root.replaceChildren();
    },
  };
}
