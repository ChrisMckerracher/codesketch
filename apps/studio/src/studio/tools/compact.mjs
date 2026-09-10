import { TOOL_LABELS } from './shared.mjs';

export function wireCompact({ signal, dispatch }) {
  const drawers = {
    left: document.getElementById('compact-layers-drawer'),
    right: document.getElementById('compact-inspector-drawer'),
  };
  const openers = { left: null, right: null };

  for (const button of document.querySelectorAll('[data-drawer-open]')) {
    button.addEventListener('click', () => {
      const side = button.dataset.drawerOpen;
      openers[side] = button;
      if (side === 'left' && button.dataset.tab) {
        dispatch({ type: 'tab.select', tab: button.dataset.tab }).catch(() => {});
      }
      dispatch({ type: 'drawer.set', side, open: true }).catch(() => {});
    }, { signal });
  }
  for (const button of document.querySelectorAll('[data-drawer-close]')) {
    button.addEventListener('click', () => {
      closeDrawer(button.dataset.drawerClose, true);
    }, { signal });
  }

  const stage = document.getElementById('stage-viewport');
  stage?.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest('#director-hud, #tool-dock, #feedback-composer, .drawer')) return;
    for (const side of ['left', 'right']) {
      if (drawers[side]?.matches('[data-open="true"]')) {
        closeDrawer(side, false);
      }
    }
  }, { signal });

  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.isComposing) return;
    const side = ['left', 'right'].find((candidate) => drawers[candidate]?.matches('[data-open="true"]'));
    if (!side) return;
    event.preventDefault();
    closeDrawer(side, true);
  }, { signal });

  const rightTriggers = [...document.querySelectorAll('[data-drawer-open="right"]')];
  const colorChip = rightTriggers.find((button) => /color/i.test(button.getAttribute('aria-label') ?? ''));
  const propertiesTrigger = rightTriggers.find((button) => button !== colorChip);
  if (colorChip) colorChip.dataset.colorChip = 'true';

  function closeDrawer(side, restoreFocus) {
    dispatch({ type: 'drawer.set', side, open: false }).catch(() => {});
    if (!restoreFocus) return;
    const opener = openers[side];
    const fallback = document.getElementById('painting-canvas') ?? stage;
    (opener?.isConnected ? opener : fallback)?.focus?.();
  }

  return {
    update(value) {
      for (const side of ['left', 'right']) {
        const open = value.drawers[side] === true;
        if (drawers[side]) {
          if (open) drawers[side].setAttribute('data-open', 'true');
          else drawers[side].removeAttribute('data-open');
        }
        for (const button of document.querySelectorAll(`[data-drawer-open="${side}"]`)) {
          button.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
      }
      if (propertiesTrigger) {
        const contextLabel = value.context === 'layer' || value.context === 'document' || value.tool === 'hand'
          ? `${value.context === 'layer' ? 'Layer' : 'Document'} properties`
          : `${TOOL_LABELS[value.tool] ?? 'Tool'} properties`;
        propertiesTrigger.setAttribute('aria-label', contextLabel);
        propertiesTrigger.title = contextLabel;
      }
      if (colorChip) {
        const color = /^#[0-9a-f]{6}$/i.test(value.color ?? '') ? value.color : '';
        colorChip.style.background = color;
        colorChip.setAttribute('aria-label', `Color ${color}`);
      }
    },
  };
}
