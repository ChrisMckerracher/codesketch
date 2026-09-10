// Native range interaction with local edit ownership across server snapshots.
const RANGE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

export class LayerOpacity {
  constructor(state, api, slider, label) {
    this.state = state;
    this.api = api;
    this.slider = slider;
    this.label = label;
    this.edit = null;
    this.pointerId = null;
    this.suppressed = false;
    this.pendingSave = Promise.resolve();

    slider.addEventListener('pointerdown', event => {
      if (event.button !== 0 || this.pointerId !== null || slider.disabled) return;
      this.pointerId = event.pointerId;
      this.begin();
    });
    window.addEventListener('pointerup', event => {
      if (event.pointerId !== this.pointerId) return;
      this.pointerId = null;
      if (this.edit?.phase === 'editing') {
        if (this.edit.dirty) this.save();
        else this.cancel();
      }
    });
    window.addEventListener('pointercancel', event => {
      if (event.pointerId !== this.pointerId) return;
      this.cancel();
      this.pointerId = null;
    });
    slider.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.edit?.phase === 'editing') {
        event.preventDefault();
        this.cancel();
      } else if (RANGE_KEYS.has(event.key)) {
        this.begin();
      }
    });
    slider.addEventListener('keyup', event => {
      if (RANGE_KEYS.has(event.key) && this.pointerId === null && this.edit?.phase === 'editing' && !this.edit.dirty) this.cancel();
    });
    slider.addEventListener('blur', () => this.cancel());
    slider.addEventListener('input', () => {
      if (this.suppressed) { this.sync(); return; }
      // Input without a pointer/key event supports native accessibility actions.
      if (this.edit?.phase !== 'editing') this.begin();
      if (!this.edit) return;
      this.edit.value = Number(slider.value);
      this.edit.dirty = true;
      this.label.textContent = `${this.edit.value}%`;
    });
    slider.addEventListener('change', () => this.save());
  }

  begin() {
    if (this.slider.disabled) return;
    this.suppressed = false;
    this.edit = { target: this.state.targetLayer, instance: this.state.currentInstanceId,
      value: Number(this.slider.value), phase: 'editing', dirty: false };
  }

  cancel() {
    if (this.edit?.phase !== 'editing') return;
    this.edit = null;
    // Native change/input may still follow a cancelled pointer gesture.
    this.suppressed = true;
    this.sync();
  }

  sync() {
    const layer = this.state.snapshot?.document?.layers.find(item => item.id === this.state.targetLayer);
    if (this.edit && (!layer || this.edit.target !== layer.id || this.edit.instance !== this.state.currentInstanceId)) {
      this.edit = null;
      this.suppressed = this.pointerId !== null;
    }
    this.slider.disabled = !layer;
    if (!layer) return;
    const value = this.edit?.value ?? Math.round(layer.opacity * 100);
    this.slider.value = String(value);
    this.label.textContent = `${value}%`;
  }

  save() {
    const edit = this.edit;
    // Some browsers emit change before blur during a held range gesture.
    // Pointer release owns its commit; keyboard change keeps native timing.
    if (this.pointerId !== null || !edit || edit.phase !== 'editing' || !edit.dirty || this.suppressed) return;
    edit.phase = 'saving';
    // Preserve gesture order at the server as well as local edit identity.
    this.pendingSave = this.pendingSave.then(() => this.submit(edit));
  }

  async submit(edit) {
    try {
      const snapshot = await this.api.sendCommands([
        { type: 'layer.update', id: edit.target, opacity: edit.value / 100 },
      ], { immediate: true, play: false });
      // StudioState rejects stale revisions; sync preserves any newer local edit.
      this.state.setSnapshot(snapshot);
    } catch (error) {
      if (this.edit === edit) this.state.showNotification(`Failed to update layer opacity: ${error.message}`);
    } finally {
      // Completion belongs to this particular edit, even after selection changes.
      if (this.edit === edit) {
        this.edit = null;
        this.sync();
      }
    }
  }
}
