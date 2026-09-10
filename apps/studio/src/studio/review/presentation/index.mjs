import { canvasPoint, selectionRect } from '../../comments/index.mjs';
import { createComposer } from './composer.mjs';
import { createList } from './list.mjs';
import { destroyReviewOverlay, renderReviewOverlay } from './overlay.mjs';

const ACTIVE_PHASES = new Set(['pausing', 'selecting', 'composing', 'submitting', 'uncertain', 'stale']);
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 700;

export function mount({ root, model, dispatch, composer: composerMount, overlay: overlayMount, canvas: canvasMount, point } = {}) {
  const composerEl = composerMount ?? document.querySelector('#feedback-composer');
  const overlaySvg = overlayMount ?? document.querySelector('#stage-overlay');
  const canvasEl = canvasMount ?? document.querySelector('#painting-canvas');
  if (!root || !composerEl || !overlaySvg || !canvasEl) {
    throw new Error('Review presentation needs the panel, composer, overlay, and canvas mounts');
  }
  const toPoint = point ?? ((event) => canvasPoint(
    event.clientX, event.clientY, canvasEl.getBoundingClientRect(), CANVAS_WIDTH, CANVAS_HEIGHT));
  let current = model;
  let destroyed = false;
  let drag = null;
  let selectedId = null;
  const pendingTransitions = new Set();
  const reviewPins = new Map();

  const send = (intent) => {
    if (destroyed) return Promise.resolve();
    try {
      return Promise.resolve(dispatch(intent)).catch((error) => {
        list.setError(error?.message ?? 'The action failed.');
      });
    } catch (error) {
      list.setError(error?.message ?? 'The action failed.');
      return Promise.resolve();
    }
  };

  const list = createList({
    onBegin: (scope) => send({ type: 'review.begin', scope }),
    onTransition: (intent) => {
      if (pendingTransitions.has(intent.id)) return;
      pendingTransitions.add(intent.id);
      render();
      send(intent).finally(() => {
        pendingTransitions.delete(intent.id);
        render();
      });
    },
    onSelect: (id) => {
      selectedId = id;
      render();
    },
  });
  const composer = createComposer({
    onBegin: (scope) => send({ type: 'review.begin', scope }),
    onText: (text) => send({ type: 'review.text', text }),
    onHold: (value) => send({ type: 'review.hold', value }),
    onSubmit: () => send({ type: 'review.submit' }),
    onRetry: () => send({ type: 'review.retry' }),
    onReselect: () => send({ type: 'review.reselect' }),
    onCancel: () => send({ type: 'review.cancel' }),
  });
  root.appendChild(list.element);
  composerEl.appendChild(composer.element);

  const contextOf = (value) => {
    const snap = value.snapshot;
    return snap ? {
      instanceId: snap.instanceId,
      generation: snap.docGeneration,
      artRevision: snap.artRevision,
    } : null;
  };

  const dragValid = (value) => {
    if (!drag || value.review.phase !== 'selecting' || value.tool !== 'comment') return false;
    const context = contextOf(value);
    return Boolean(context && context.instanceId === drag.instanceId &&
      context.generation === drag.generation && context.artRevision === drag.artRevision);
  };

  const dropDrag = () => {
    if (!drag) return;
    const pointerId = drag.pointerId;
    drag = null;
    try {
      if (canvasEl.hasPointerCapture?.(pointerId)) canvasEl.releasePointerCapture(pointerId);
    } catch { /* best-effort release */ }
  };

  const render = () => {
    if (destroyed) return;
    const value = current;
    root.hidden = value.tab !== 'feedback';
    list.update(value, { selectedId, pending: pendingTransitions, connection: value.connection });
    composer.update(value);
    renderReviewOverlay(overlaySvg, value, {
      dragRect: drag ? selectionRect(drag.a, drag.b) : null,
      selectedId,
      pins: reviewPins,
      onSelect: (id) => {
        selectedId = id;
        render();
      },
    });
  };

  const onPointerDown = (event) => {
    if (destroyed || drag || event.button !== 0) return;
    const value = current;
    const context = contextOf(value);
    if (value.tool !== 'comment' || value.review.phase !== 'selecting' || !context ||
        value.connection === 'offline') return;
    drag = { pointerId: event.pointerId, a: toPoint(event), b: toPoint(event), ...context };
    try { canvasEl.setPointerCapture(event.pointerId); } catch { /* best-effort capture */ }
    event.preventDefault();
    render();
  };

  const onPointerMove = (event) => {
    if (destroyed || !drag || event.pointerId !== drag.pointerId) return;
    drag.b = toPoint(event);
    render();
  };

  const onPointerUp = (event) => {
    if (destroyed || !drag || event.pointerId !== drag.pointerId) return;
    const rect = dragValid(current) ? selectionRect(drag.a, toPoint(event)) : null;
    dropDrag();
    if (rect) send({ type: 'review.rect', rect });
    render();
  };

  const onPointerCancel = () => {
    dropDrag();
    render();
  };

  const onKeyDown = (event) => {
    if (destroyed || event.key !== 'Escape' || event.isComposing) return;
    if (ACTIVE_PHASES.has(current.review.phase)) send({ type: 'review.cancel' });
  };

  canvasEl.addEventListener('pointerdown', onPointerDown);
  canvasEl.addEventListener('pointermove', onPointerMove);
  canvasEl.addEventListener('pointerup', onPointerUp);
  canvasEl.addEventListener('pointercancel', onPointerCancel);
  canvasEl.addEventListener('lostpointercapture', onPointerCancel);
  document.addEventListener('keydown', onKeyDown);

  render();

  return {
    update(next) {
      if (destroyed) return;
      current = next;
      if (drag && !dragValid(current)) dropDrag();
      render();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      dropDrag();
      canvasEl.removeEventListener('pointerdown', onPointerDown);
      canvasEl.removeEventListener('pointermove', onPointerMove);
      canvasEl.removeEventListener('pointerup', onPointerUp);
      canvasEl.removeEventListener('pointercancel', onPointerCancel);
      canvasEl.removeEventListener('lostpointercapture', onPointerCancel);
      document.removeEventListener('keydown', onKeyDown);
      list.element.remove();
      composer.element.remove();
      destroyReviewOverlay(overlaySvg);
      reviewPins.clear();
    },
  };
}
