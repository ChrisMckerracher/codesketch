// Region selection instrument: capture-phase pointer/keyboard handling that
// suspends canvas painting while a comment region is being drawn.

import { canvasPoint, selectionRect } from './geometry.mjs';

export class RegionSelection {
  constructor({ canvas, onSelect, onCancel, onDraft }) {
    this.canvas = canvas;
    this.onSelect = onSelect || (() => {});
    this.onCancel = onCancel || (() => {});
    this.onDraft = onDraft || (() => {});

    this.enabled = false;
    this.destroyed = false;
    this.activePointerId = null;
    this.startPoint = null;

    this.bound = {
      pointerdown: this.onPointerDown.bind(this),
      pointermove: this.onPointerMove.bind(this),
      pointerup: this.onPointerUp.bind(this),
      pointercancel: this.onPointerCancel.bind(this),
      keydown: this.onKeyDown.bind(this),
    };

    // Capture phase so these run before CanvasController's bubble listeners.
    for (const [type, handler] of Object.entries(this.bound)) {
      this.canvas.addEventListener(type, handler, { capture: true });
    }
  }

  // Enables selection; the parent must have acknowledged the pause first.
  activate() {
    if (this.destroyed || this.enabled) return;
    this.enabled = true;
    if (!this.canvas.hasAttribute('tabindex')) {
      this.canvas.setAttribute('tabindex', '0');
    }
  }

  // Disables selection and clears any in-progress pointer drag and draft.
  deactivate() {
    if (this.destroyed) return;
    if (this.activePointerId !== null) {
      this.releasePointer(this.activePointerId);
      this.activePointerId = null;
    }
    this.startPoint = null;
    this.enabled = false;
    this.onDraft(null);
  }

  destroy() {
    if (this.destroyed) return;
    this.deactivate();
    this.destroyed = true;
    for (const [type, handler] of Object.entries(this.bound)) {
      this.canvas.removeEventListener(type, handler, { capture: true });
    }
    this.bound = null;
  }

  // While enabled, swallow pointer events so the canvas painter never sees
  // them; returns false when selection is off and events must pass through.
  swallow(event) {
    if (!this.enabled) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }

  onPointerDown(event) {
    if (!this.swallow(event)) return;
    if (event.button !== 0 || this.activePointerId !== null) return;
    this.activePointerId = event.pointerId;
    this.startPoint = canvasPoint(
      event.clientX,
      event.clientY,
      this.canvas.getBoundingClientRect(),
    );
    this.capturePointer(event.pointerId);
    this.onDraft(null);
  }

  onPointerMove(event) {
    if (!this.swallow(event)) return;
    if (event.pointerId !== this.activePointerId || !this.startPoint) return;
    const point = canvasPoint(
      event.clientX,
      event.clientY,
      this.canvas.getBoundingClientRect(),
    );
    this.onDraft(selectionRect(this.startPoint, point));
  }

  onPointerUp(event) {
    if (!this.swallow(event)) return;
    if (event.pointerId !== this.activePointerId) return;
    const rect = selectionRect(
      this.startPoint,
      canvasPoint(event.clientX, event.clientY, this.canvas.getBoundingClientRect()),
    );
    this.activePointerId = null;
    this.startPoint = null;
    this.releasePointer(event.pointerId);
    this.onDraft(null);
    if (rect) {
      // Zero-area drags produce no comment; the parent keeps the rectangle.
      this.onSelect(rect);
    }
  }

  onPointerCancel(event) {
    if (!this.swallow(event)) return;
    if (event.pointerId !== this.activePointerId) return;
    this.activePointerId = null;
    this.startPoint = null;
    this.releasePointer(event.pointerId);
    this.onDraft(null);
    this.onCancel();
  }

  onKeyDown(event) {
    if (!this.enabled || event.isComposing) return;
    if (event.key !== 'Enter' && event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === 'Enter') {
      this.onSelect(null); // whole-canvas comment
    } else {
      this.onCancel();
    }
  }

  capturePointer(pointerId) {
    try {
      this.canvas.setPointerCapture(pointerId);
    } catch {
      // Pointer capture is best-effort; drag still works in-window.
    }
  }

  releasePointer(pointerId) {
    try {
      this.canvas.releasePointerCapture(pointerId);
    } catch {
      // Capture may already be gone (e.g. browser-initiated release).
    }
  }
}
