import { canvasPoint } from '../comments/index.mjs';

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 700;
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

export function handleView(intent, { model }) {
  if (!intent || typeof intent !== 'object' || typeof intent.type !== 'string') return false;
  const viewport = model.get().viewport;
  switch (intent.type) {
    case 'view.fit':
      model.patch({ viewport: { ...viewport, mode: 'fit', x: 0, y: 0 } });
      return true;
    case 'view.actual':
      model.patch({ viewport: { ...viewport, mode: 'manual', scale: 1, x: 0, y: 0 } });
      return true;
    case 'view.zoom': {
      const scale = Number(intent.scale);
      if (!Number.isFinite(scale)) return false;
      const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
      model.patch({ viewport: { ...viewport, mode: 'manual', scale: clamped } });
      return true;
    }
    case 'view.pan': {
      const x = Number(intent.x);
      const y = Number(intent.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      const scale = Number(intent.scale);
      const validScale = Number.isFinite(scale) && scale > 0 && scale <= MAX_SCALE;
      model.patch({
        viewport: {
          ...viewport,
          mode: 'manual',
          x,
          y,
          scale: validScale ? scale : viewport.scale,
        },
      });
      return true;
    }
    default:
      return false;
  }
}

export function mount({ root, model, dispatch }) {
  root.classList.add('cs-stage');
  let current = model;
  let dragging = null;
  const options = new AbortController();
  const wrapper = root.querySelector('#canvas-wrapper');
  const canvas = root.querySelector('#painting-canvas');
  if (!wrapper || !canvas) throw new Error('viewport mount requires #canvas-wrapper and #painting-canvas');

  function fitLayout() {
    const stage = root.getBoundingClientRect();
    if (stage.width < 40 || stage.height < 40) return { scale: 1, offsetY: 0 };
    const stageTop = stage.top;
    const stageBottom = stage.bottom;
    const hud = document.getElementById('director-hud')?.getBoundingClientRect();
    const dock = document.getElementById('tool-dock')?.getBoundingClientRect();
    const top = hud && hud.height > 0 ? hud.bottom - stageTop + 12 : 16;
    const bottom = dock && dock.height > 0 ? stageBottom - dock.top + 12 : 16;
    const availableWidth = stage.width - 32;
    const availableHeight = stage.height - top - bottom;
    const offsetY = (top - bottom) / 2;
    if (availableWidth < 40 || availableHeight < 40) return { scale: 0.05, offsetY };
    const scale = Math.min(availableWidth / CANVAS_WIDTH, availableHeight / CANVAS_HEIGHT);
    return { scale: Math.min(MAX_SCALE, Math.max(0.05, scale)), offsetY };
  }

  function applyTransform() {
    const view = current.viewport;
    root.classList.toggle('cs-stage-hand', current.tool === 'hand');
    if (view.mode === 'fit') {
      const { scale, offsetY } = fitLayout();
      wrapper.style.transform = `translate(0px, ${offsetY}px) scale(${scale})`;
    } else {
      wrapper.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    }
  }

  function dragTarget(event) {
    if (current.tool !== 'hand' || event.button !== 0) return false;
    if (event.target.closest('#director-hud, #tool-dock, #feedback-composer, #compact-layers-drawer, #compact-inspector-drawer')) return false;
    return true;
  }

  root.addEventListener('pointerdown', (event) => {
    if (!dragTarget(event)) return;
    const stageRect = root.getBoundingClientRect();
    const rendered = canvas.getBoundingClientRect();
    dragging = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseX: (rendered.left + rendered.right) / 2 - (stageRect.left + stageRect.right) / 2,
      baseY: (rendered.top + rendered.bottom) / 2 - (stageRect.top + stageRect.bottom) / 2,
      scale: rendered.width > 0 ? rendered.width / CANVAS_WIDTH : current.viewport.scale,
    };
    root.classList.add('cs-stage-panning');
    root.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, { signal: options.signal });

  root.addEventListener('pointermove', (event) => {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    dispatch({
      type: 'view.pan',
      x: dragging.baseX + (event.clientX - dragging.startX),
      y: dragging.baseY + (event.clientY - dragging.startY),
      scale: dragging.scale,
    }).catch(() => {});
  }, { signal: options.signal });

  function stopDrag(event) {
    if (!dragging) return;
    if (event && event.pointerId !== undefined && event.pointerId !== dragging.pointerId) return;
    const pointerId = dragging.pointerId;
    dragging = null;
    root.classList.remove('cs-stage-panning');
    if (root.hasPointerCapture?.(pointerId)) {
      try {
        root.releasePointerCapture(pointerId);
      } catch {}
    }
  }

  root.addEventListener('pointerup', stopDrag, { signal: options.signal });
  root.addEventListener('pointercancel', stopDrag, { signal: options.signal });
  root.addEventListener('lostpointercapture', stopDrag, { signal: options.signal });

  const observer = new ResizeObserver(() => applyTransform());
  observer.observe(root);
  for (const id of ['director-hud', 'tool-dock']) {
    const zone = document.getElementById(id);
    if (zone) observer.observe(zone);
  }

  function point(event) {
    return canvasPoint(event.clientX, event.clientY, canvas.getBoundingClientRect(), CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  function fit() {
    return dispatch({ type: 'view.fit' });
  }

  applyTransform();

  return {
    update(next) {
      current = next;
      if (dragging && current.tool !== 'hand') stopDrag();
      applyTransform();
    },
    point,
    fit,
    destroy() {
      stopDrag();
      observer.disconnect();
      options.abort();
      root.classList.remove('cs-stage', 'cs-stage-hand', 'cs-stage-panning');
      wrapper.style.transform = '';
    },
  };
}
