import { canDispatchServer } from './shared.mjs';

const TOOL_KEYS = { b: 'brush', p: 'pencil', m: 'marker', e: 'eraser', r: 'rect', o: 'ellipse', h: 'hand' };

function editableTarget(event) {
  const target = event.target;
  if (!(target instanceof Element)) return true;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));
}

function buttonLikeTarget(event) {
  const target = event.target;
  return Boolean(target instanceof Element && target.closest('button, [role="button"], a[href], summary'));
}

export function handleShortcut(event, value, dispatch) {
  if (event.isComposing || event.keyCode === 229) return;
  if (editableTarget(event)) return;
  const mod = event.metaKey || event.ctrlKey;
  const history = value.snapshot?.history;
  if (mod && !event.altKey) {
    if (event.key === 'z' || event.key === 'Z') {
      if (!canDispatchServer(value) || !history) return;
      const action = event.shiftKey ? 'redo' : 'undo';
      if (action === 'undo' && history.cursor <= 0) return;
      if (action === 'redo' && history.cursor >= history.total) return;
      event.preventDefault();
      dispatch({ type: 'playback.control', action }).catch(() => {});
      return;
    }
    if ((event.key === 's' || event.key === 'S') && !event.shiftKey) {
      if (!canDispatchServer(value)) return;
      event.preventDefault();
      dispatch({ type: 'project.save' }).catch(() => {});
      return;
    }
  }
  if (mod || event.altKey) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (key === ' ') {
    if (event.repeat || buttonLikeTarget(event)) return;
    if (!canDispatchServer(value)) return;
    const playing = value.snapshot?.playback?.status === 'playing';
    event.preventDefault();
    dispatch({ type: 'playback.control', action: playing ? 'pause' : 'resume' }).catch(() => {});
    return;
  }
  if (key === ']') {
    if (!canDispatchServer(value) || !(value.snapshot?.playback?.remaining > 0)) return;
    event.preventDefault();
    dispatch({ type: 'playback.control', action: 'step' }).catch(() => {});
    return;
  }
  if (key === 'c') {
    if (!canDispatchServer(value)) return;
    event.preventDefault();
    dispatch({ type: 'review.begin', scope: 'region' }).catch(() => {});
    dispatch({ type: 'tab.select', tab: 'feedback' }).catch(() => {});
    dispatch({ type: 'drawer.set', side: 'left', open: true }).catch(() => {});
    return;
  }
  if (key === 'l') {
    event.preventDefault();
    dispatch({ type: 'tab.select', tab: 'layers' }).catch(() => {});
    dispatch({ type: 'drawer.set', side: 'left', open: true }).catch(() => {});
    return;
  }
  const tool = TOOL_KEYS[key];
  if (!tool) return;
  if (tool === 'pencil' && !event.shiftKey) return;
  event.preventDefault();
  dispatch({ type: 'tool.select', tool }).catch(() => {});
}
