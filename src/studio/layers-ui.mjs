// Layers inspector managing list, selection, visibility, opacity, and creation

import { createSvgIcon } from './icons.mjs';

export class LayersUI {
  constructor(state, api, dialogs) {
    this.state = state;
    this.api = api;
    this.dialogs = dialogs;

    this.layerList = document.getElementById('layer-list');
    this.btnAddLayer = document.getElementById('btn-add-layer');
    this.sliderOpacity = document.getElementById('slider-layer-opacity');
    this.labelOpacity = document.getElementById('label-layer-opacity');
    this.lastSignature = '';

    this.bindEvents();
    this.subscribeState();
  }

  bindEvents() {
    this.btnAddLayer.addEventListener('click', async () => {
      const name = await this.dialogs.promptInput('Add Layer', 'Enter a name for the new layer:', 'Foreground');
      if (!name) return;

      const baseId = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^-+|-+$/g, '') || 'layer';
      const existingIds = (this.state.snapshot?.document?.layers || []).map((l) => l.id);
      let candidate = baseId.slice(0, 30);
      if (!/^[a-zA-Z]/.test(candidate)) candidate = `layer-${candidate}`;
      let id = candidate;
      let counter = 1;
      while (existingIds.includes(id)) {
        id = `${candidate}-${counter++}`;
      }

      try {
        const snap = await this.api.sendCommands([{ type: 'layer.add', id, name }], {
          immediate: true,
          play: false,
        });
        this.state.setTargetLayer(id);
        this.state.setSnapshot(snap);
      } catch (err) {
        this.state.showNotification(`Failed to add layer: ${err.message}`);
      }
    });

    this.sliderOpacity.addEventListener('input', (e) => {
      const pct = Number(e.target.value);
      this.labelOpacity.textContent = `${pct}%`;
    });

    this.sliderOpacity.addEventListener('change', async (e) => {
      const opacity = Math.max(0, Math.min(1, Number(e.target.value) / 100));
      const targetId = this.state.targetLayer;
      try {
        const snap = await this.api.sendCommands([{ type: 'layer.update', id: targetId, opacity }], {
          immediate: true,
          play: false,
        });
        this.state.setSnapshot(snap);
      } catch (err) {
        this.state.showNotification(`Failed to update layer opacity: ${err.message}`);
      }
    });
  }

  subscribeState() {
    this.state.on('snapshot', () => this.render());
    this.state.on('targetLayer', () => this.updateSelection());
  }

  render() {
    const layers = this.state.snapshot?.document?.layers || [];
    const sig = layers.map((l) => `${l.id}:${l.name}:${l.visible}:${l.opacity}`).join('|');

    if (sig === this.lastSignature && this.layerList.children.length === layers.length) {
      this.updateSelection();
      return;
    }

    this.lastSignature = sig;

    const activeEl = document.activeElement;
    const focusedLayerId = activeEl?.closest('.layer-item')?.getAttribute('data-layer-id');
    const focusedIsVisBtn = activeEl?.classList.contains('layer-btn-visibility');

    this.layerList.replaceChildren();

    // Display topmost layer first (reverse copy, preserving domain order in snapshot)
    const displayLayers = [...layers].reverse();

    for (const layer of displayLayers) {
      const isSelected = layer.id === this.state.targetLayer;

      const item = document.createElement('div');
      item.className = `layer-item${isSelected ? ' active' : ''}`;
      item.setAttribute('role', 'radio');
      item.setAttribute('aria-checked', String(isSelected));
      item.setAttribute('tabindex', '0');
      item.setAttribute('data-layer-id', layer.id);

      const info = document.createElement('div');
      info.className = 'layer-main-info';

      const dot = document.createElement('span');
      dot.className = 'layer-radio-dot';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'layer-name-text';
      nameSpan.textContent = layer.name;

      info.appendChild(dot);
      info.appendChild(nameSpan);

      info.addEventListener('click', () => {
        this.state.setTargetLayer(layer.id);
      });

      item.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          this.state.setTargetLayer(layer.id);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          const next = item.nextElementSibling;
          if (next) {
            next.focus();
            const nextId = next.getAttribute('data-layer-id');
            if (nextId) this.state.setTargetLayer(nextId);
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = item.previousElementSibling;
          if (prev) {
            prev.focus();
            const prevId = prev.getAttribute('data-layer-id');
            if (prevId) this.state.setTargetLayer(prevId);
          }
        }
      });

      const btnVis = document.createElement('button');
      btnVis.type = 'button';
      btnVis.className = `layer-btn-visibility${layer.visible ? '' : ' hidden-layer'}`;
      btnVis.setAttribute('aria-label', `${layer.visible ? 'Hide' : 'Show'} layer ${layer.name}`);
      btnVis.title = layer.visible ? 'Hide layer' : 'Show layer';

      const icon = createSvgIcon(layer.visible ? 'eye' : 'eyeOff', 14);
      if (icon) btnVis.appendChild(icon);

      btnVis.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          const snap = await this.api.sendCommands([{ type: 'layer.update', id: layer.id, visible: !layer.visible }], {
            immediate: true,
            play: false,
          });
          this.state.setSnapshot(snap);
        } catch (err) {
          this.state.showNotification(`Failed to toggle visibility: ${err.message}`);
        }
      });

      item.appendChild(info);
      item.appendChild(btnVis);
      this.layerList.appendChild(item);
    }

    this.updateSelection();

    if (focusedLayerId) {
      const el = this.layerList.querySelector(`[data-layer-id="${focusedLayerId}"]`);
      if (el) {
        if (focusedIsVisBtn) {
          el.querySelector('.layer-btn-visibility')?.focus();
        } else {
          el.focus();
        }
      }
    }
  }

  updateSelection() {
    const layers = this.state.snapshot?.document?.layers || [];
    let activeLayer = null;

    for (const item of this.layerList.children) {
      const id = item.getAttribute('data-layer-id');
      const isSelected = id === this.state.targetLayer;
      item.setAttribute('aria-checked', String(isSelected));
      if (isSelected) {
        item.classList.add('active');
        activeLayer = layers.find((l) => l.id === id);
      } else {
        item.classList.remove('active');
      }
    }

    if (activeLayer) {
      const pct = Math.round((activeLayer.opacity ?? 1) * 100);
      this.sliderOpacity.value = String(pct);
      this.labelOpacity.textContent = `${pct}%`;
      this.sliderOpacity.disabled = false;
    } else {
      this.sliderOpacity.disabled = true;
    }
  }
}
