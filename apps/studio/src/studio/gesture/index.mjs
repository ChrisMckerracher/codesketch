import { buildShape, buildStroke, boundedPoints, clampPoint } from './command.mjs';
import { createBrushGuide } from './overlay.mjs';

const PAINT_TOOLS = new Set(['brush', 'pencil', 'marker', 'eraser']);
const SHAPE_TOOLS = new Set(['rect', 'ellipse']);

function serverReady(value) {
  return Boolean(value.snapshot) && value.connection !== 'offline' && value.connection !== 'uncertain';
}

function sameInstanceGeneration(value, gesture) {
  const snapshot = value.snapshot;
  return Boolean(snapshot)
    && snapshot.instanceId === gesture.instanceId
    && snapshot.docGeneration === gesture.generation;
}

function pausedAtEpoch(value, gesture) {
  return sameInstanceGeneration(value, gesture)
    && value.snapshot.controlEpoch === gesture.epoch
    && value.snapshot.playback?.status === 'paused';
}

function effectiveSize(value) {
  return value.tool === 'eraser' ? Math.min(100, 2 * value.size) : value.size;
}

export function createGesture({ model, dispatch, requests, canvas, point }) {
  let current = model.get();
  let gesture = null;
  let phase = 'idle';
  let acked = false;
  let start = null;
  let points = null;
  let draft = null;
  let pointerId = null;
  let nextToken = 0;
  let destroyed = false;
  const options = new AbortController();
  const guide = createBrushGuide(typeof document === 'undefined' ? null : document.getElementById('stage-overlay'));

  function isCurrent(token) {
    return !destroyed && gesture !== null && gesture.token === token;
  }

  function clearDraft() {
    if (model.get().draft !== null) model.patch({ draft: null });
  }

  function releasePointer(capturedId) {
    if (capturedId === null) return;
    try {
      canvas.releasePointerCapture(capturedId);
    } catch {}
  }

  function cancelGesture() {
    if (phase !== 'drawing' && phase !== 'completed') return;
    phase = 'idle';
    gesture = null;
    acked = false;
    start = null;
    points = null;
    draft = null;
    clearDraft();
    guide.hide();
    releasePointer(pointerId);
    pointerId = null;
  }

  function reconcileCommit() {
    if (phase !== 'committing' || !gesture.acceptedArtRevision) return;
    const snapshot = model.get().snapshot;
    if (snapshot && snapshot.instanceId === gesture.instanceId && snapshot.artRevision >= gesture.acceptedArtRevision) {
      clearDraft();
      phase = 'idle';
      gesture = null;
    }
  }

  function commit(token) {
    if (!isCurrent(token)) return;
    phase = 'committing';
    dispatch({ type: 'stroke.commit', command: model.get().draft, generation: gesture.generation }).then((accepted) => {
      if (!isCurrent(token) || phase !== 'committing') return;
      gesture.acceptedArtRevision = accepted && Number.isSafeInteger(accepted.artRevision) ? accepted.artRevision : null;
      reconcileCommit();
    }, async (error) => {
      if (!isCurrent(token) || phase !== 'committing') return;
      if (error?.outcome === 'uncertain') {
        let refreshed = true;
        try {
          await requests.readState();
        } catch {
          refreshed = false;
        }
        if (!isCurrent(token)) return;
        clearDraft();
        phase = 'idle';
        gesture = null;
        model.patch({ notice: {
          message: refreshed
            ? 'Your stroke may not have been saved. The studio refreshed; check the canvas and draw again if the mark is missing.'
            : 'Your stroke may not have been saved, and the refresh failed. Reconnect or reload to check the canvas before drawing again.',
          tone: 'warn',
        } });
        return;
      }
      clearDraft();
      phase = 'idle';
      gesture = null;
    });
  }

  function requestPause(token) {
    dispatch({ type: 'playback.control', action: 'pause', generation: gesture.generation }).then((ack) => {
      if (!isCurrent(token) || phase === 'committing') return;
      const epoch = ack && Number.isSafeInteger(ack.controlEpoch) ? ack.controlEpoch : null;
      if (epoch === null) return cancelGesture();
      gesture.epoch = epoch;
      if (pausedAtEpoch(model.get(), gesture)) {
        acked = true;
        if (phase === 'completed') commit(token);
      } else {
        cancelGesture();
      }
    }, () => {
      if (!isCurrent(token)) return;
      cancelGesture();
    });
  }

  function onPointerDown(event) {
    if (destroyed || phase !== 'idle' || event.button !== 0) return;
    const value = model.get();
    if (!serverReady(value)) return;
    if (value.tool === 'hand' || value.tool === 'comment') return;
    const kind = PAINT_TOOLS.has(value.tool) ? 'stroke' : SHAPE_TOOLS.has(value.tool) ? value.tool : null;
    if (!kind) return;
    if (!value.snapshot.document?.layers?.some((layer) => layer?.id === value.targetLayer)) return;
    const token = ++nextToken;
    gesture = {
      token,
      instanceId: value.snapshot.instanceId,
      generation: value.snapshot.docGeneration,
      epoch: null,
      artRevision: value.snapshot.artRevision,
      acceptedArtRevision: null,
      layer: value.targetLayer,
      kind,
      brush: kind === 'stroke' ? value.tool : null,
      color: value.color,
      size: effectiveSize(value),
      smoothing: value.smoothing,
      opacity: value.opacity,
    };
    acked = false;
    pointerId = event.pointerId;
    try {
      canvas.setPointerCapture(pointerId);
    } catch {}
    start = clampPoint(point(event));
    points = [start];
    draft = kind === 'stroke' ? buildStroke(gesture, points) : buildShape(gesture, kind, start, start);
    model.patch({ draft });
    phase = 'drawing';
    try {
      canvas.focus({ preventScroll: true });
    } catch {}
    requestPause(token);
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (pointerId !== null && event.pointerId !== undefined && event.pointerId !== pointerId) return;
    const coords = clampPoint(point(event));
    if (phase === 'idle') {
      if (PAINT_TOOLS.has(current.tool)) guide.show(coords[0], coords[1], effectiveSize(current));
      else guide.hide();
      return;
    }
    if (phase !== 'drawing' || !gesture) return;
    guide.show(coords[0], coords[1], gesture.size);
    if (gesture.kind === 'stroke') {
      points = boundedPoints([...points, coords]);
      draft = buildStroke(gesture, points);
    } else {
      draft = buildShape(gesture, gesture.kind, start, coords);
    }
    model.patch({ draft });
  }

  function onPointerUp(event) {
    if (phase !== 'drawing') return;
    if (event.pointerId !== undefined && event.pointerId !== pointerId) return;
    const coords = clampPoint(point(event));
    const command = gesture.kind === 'stroke'
      ? buildStroke(gesture, boundedPoints([...points, coords]))
      : buildShape(gesture, gesture.kind, start, coords);
    const capturedId = pointerId;
    pointerId = null;
    phase = command ? 'completed' : 'drawing';
    releasePointer(capturedId);
    if (!command) {
      cancelGesture();
      return;
    }
    draft = command;
    model.patch({ draft });
    phase = 'completed';
    if (acked) commit(gesture.token);
  }

  function onUpdate(value) {
    if (destroyed) return;
    current = value;
    if (phase === 'drawing' || phase === 'completed') {
      if (!sameInstanceGeneration(value, gesture)) return cancelGesture();
      const expectedTool = gesture.kind === 'stroke' ? gesture.brush : gesture.kind;
      if (value.tool !== expectedTool) return cancelGesture();
      if (acked && !pausedAtEpoch(value, gesture)) return cancelGesture();
    }
    if (phase === 'committing') {
      if (!sameInstanceGeneration(value, gesture)) {
        clearDraft();
        phase = 'idle';
        gesture = null;
        return;
      }
      reconcileCommit();
    }
  }

  const unsubscribe = model.subscribe((value) => onUpdate(value));
  canvas.addEventListener('pointerdown', onPointerDown, { signal: options.signal });
  canvas.addEventListener('pointermove', onPointerMove, { signal: options.signal });
  canvas.addEventListener('pointerup', onPointerUp, { signal: options.signal });
  canvas.addEventListener('pointercancel', (event) => {
    if (pointerId !== null && event.pointerId !== undefined && event.pointerId !== pointerId) return;
    cancelGesture();
  }, { signal: options.signal });
  canvas.addEventListener('lostpointercapture', () => {
    if (phase === 'drawing' && pointerId !== null) cancelGesture();
  }, { signal: options.signal });

  return {
    destroy() {
      destroyed = true;
      options.abort();
      if (gesture) clearDraft();
      gesture = null;
      unsubscribe();
      guide.destroy();
      releasePointer(pointerId);
      pointerId = null;
    },
  };
}
