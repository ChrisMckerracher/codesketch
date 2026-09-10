// Canvas pointer interaction and immediate local draft coordination

export class CanvasController {
  constructor(canvas, state, api, renderer) {
    this.canvas = canvas;
    this.state = state;
    this.api = api;
    this.renderer = renderer;

    this.isDrawing = false;
    this.isSubmitting = false;
    this.currentDraft = null;
    this.activePointerId = null;

    this.bindEvents();
    this.subscribeState();
  }

  getCanvasCoordinates(event) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = Math.round((event.clientX - rect.left) * scaleX);
    const y = Math.round((event.clientY - rect.top) * scaleY);
    return [
      Math.max(0, Math.min(this.canvas.width, x)),
      Math.max(0, Math.min(this.canvas.height, y)),
    ];
  }

  bindEvents() {
    this.canvas.addEventListener('pointerdown', this.onPointerDown.bind(this));
    this.canvas.addEventListener('pointermove', this.onPointerMove.bind(this));
    this.canvas.addEventListener('pointerup', this.onPointerUp.bind(this));
    this.canvas.addEventListener('pointercancel', this.onPointerCancel.bind(this));
  }

  subscribeState() {
    this.state.on('tool', (tool) => {
      // Entering comment mode discards a still-held manual stroke before the
      // comment pause handshake starts; selection must not inherit draft
      // pixels. Strokes already submitting keep their own completion path.
      if (tool === 'comment') this.cancelHeldStroke();
      if (tool === 'eraser') {
        this.canvas.classList.add('cursor-eraser');
      } else {
        this.canvas.classList.remove('cursor-eraser');
      }
    });

    this.state.on('artChange', () => this.refreshView());
    this.state.on('draft', () => this.refreshView());
  }

  // Synchronously cancels an in-progress manual stroke: releases the captured
  // pointer and clears the draft so the swallowed pointerup cannot strand it.
  cancelHeldStroke() {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    try {
      this.canvas.releasePointerCapture(this.activePointerId);
    } catch {
      // Capture may already be gone
    }
    this.activePointerId = null;
    this.currentDraft = null;
    this.state.setDraft(null);
    this.refreshView();
  }

  refreshView() {
    if (!this.state.snapshot?.document) return;
    const active = this.state.snapshot.playback?.active;
    this.renderer.render(this.state.snapshot.document, active, this.state.draft);
  }

  async onPointerDown(event) {
    // Comment mode owns the canvas: block painting before and after pause ACK
    if (this.state.tool === 'comment') return;
    // Block new drawing if another button, drawing already, or prior submit pending
    if (event.button !== 0 || this.isDrawing || this.isSubmitting) return;
    this.isDrawing = true;
    this.activePointerId = event.pointerId;

    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // Ignore if pointer capture fails
    }

    // Immediately pause playback on pointerdown
    this.api.sendControl('pause').catch(() => {});

    const [x, y] = this.getCanvasCoordinates(event);
    this.currentDraft = {
      type: 'stroke',
      layer: this.state.targetLayer || 'paint',
      brush: this.state.tool,
      color: this.state.color,
      size: this.state.size,
      opacity: this.state.opacity,
      points: [[x, y]],
    };

    this.state.setDraft(this.currentDraft);
  }

  onPointerMove(event) {
    if (!this.isDrawing || event.pointerId !== this.activePointerId || !this.currentDraft) return;
    const [x, y] = this.getCanvasCoordinates(event);
    const points = this.currentDraft.points;
    const lastPoint = points[points.length - 1];

    if (lastPoint && Math.hypot(x - lastPoint[0], y - lastPoint[1]) < 1.5) {
      return;
    }

    if (points.length < 2000) {
      points.push([x, y]);
      this.state.setDraft(this.currentDraft);
    }
  }

  async onPointerUp(event) {
    if (!this.isDrawing || event.pointerId !== this.activePointerId) return;
    this.isDrawing = false;
    this.activePointerId = null;

    try {
      this.canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore
    }

    if (!this.currentDraft) return;

    // Append final pointerup coordinate if moved
    const [x, y] = this.getCanvasCoordinates(event);
    const points = this.currentDraft.points;
    const lastPoint = points[points.length - 1];
    if (lastPoint && (lastPoint[0] !== x || lastPoint[1] !== y) && points.length < 2000) {
      points.push([x, y]);
      this.state.setDraft(this.currentDraft);
    }

    const markToSubmit = this.currentDraft;
    if (!markToSubmit || !markToSubmit.points.length) {
      this.currentDraft = null;
      this.state.setDraft(null);
      return;
    }

    // Keep local draft visible until POST finishes and block concurrent pointerdowns
    this.isSubmitting = true;
    try {
      const snapshot = await this.api.sendCommands([markToSubmit], {
        immediate: true,
        play: false,
      });
      if (this.currentDraft === markToSubmit) {
        this.currentDraft = null;
        this.state.setDraft(null);
      }
      this.state.setSnapshot(snapshot);
    } catch (err) {
      if (this.currentDraft === markToSubmit) {
        this.currentDraft = null;
        this.state.setDraft(null);
      }
      this.state.showNotification(`Stroke failed: ${err.message}`);
      this.refreshView();
    } finally {
      this.isSubmitting = false;
    }
  }

  onPointerCancel(event) {
    if (event.pointerId === this.activePointerId) {
      this.isDrawing = false;
      this.activePointerId = null;
      this.currentDraft = null;
      this.state.setDraft(null);
      this.refreshView();
    }
  }
}
