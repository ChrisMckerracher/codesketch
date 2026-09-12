// Contract: root is the 1000x700 container; point maps its rect to unbounded units; model is application state, ui mutable, artwork chrome-free.
// dispatch is `(action, payload) => Promise`; optional hit metadata blocks chrome.
import { hexToHsv, samplePixel } from "../palette/index.mjs";
import {
  canonicalRect, clampPoint, containsPoint, handleAtPoint, moveRect,
  rectFromPoints, resizeRect, visibleBounds,
} from "./selection.mjs";
const LAYERS = { x: 740, y: 272, width: 260, height: 200 };
const COMMENTS = { x: 740, y: 514, width: 260, height: 140 };
const PHASES = new Set(["selecting", "composing"]);
const CANCELLABLE_PHASES = new Set(["selecting", "composing", "pausing"]);
const SEMANTIC = new Set(["BUTTON", "INPUT", "TEXTAREA"]);
// The renderer reads ui.selection as the live transient marquee. It is separate
// from model.review.rect, which changes only after a confirmed pause and dispatch.
export function createWorkspaceInput({
  root, canvas, model, dispatch, ui = {}, changed, point, artwork,
  getControls = () => [], getBlockedRects = () => [], getThreadViewport = () => null,
} = {}) {
  if (!root || !canvas || typeof model?.get !== "function" || typeof point !== "function" || typeof dispatch !== "function") {
    throw new TypeError("Workspace input needs root, canvas, model.get, point, and dispatch");
  }
  if (typeof getControls !== "function" || typeof getBlockedRects !== "function" || typeof getThreadViewport !== "function") {
    throw new TypeError("Workspace input needs control and thread viewport callbacks");
  }
  const view = root.ownerDocument?.defaultView;
  const listeners = [];
  const handledDown = new WeakSet();
  let drag = null;
  let pickerDrag = null;
  let ownedPointer = null;
  let destroyed = false;
  const listen = (target, type, handler) => {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, true);
    listeners.push(() => target.removeEventListener?.(type, handler, true));
  };
  const state = () => model.get() ?? {};
  const bounds = () => visibleBounds(Boolean(ui.collapsed));
  const phase = () => state().review?.phase;
  const reviewActive = () => Boolean(ui.feedbackOpen) && PHASES.has(phase());
  const coords = (event) => point(event);
  const send = (action, payload) => {
    try {
      return Promise.resolve(dispatch(action, payload)).catch(() => undefined);
    } catch {
      return Promise.resolve();
    }
  };
  const primary = (event) => event?.button == null || event.button === 0;
  const same = (event, id) => event?.pointerId === id;
  const consume = (event) => {
    event?.preventDefault?.();
    event?.stopImmediatePropagation?.();
    event?.stopPropagation?.();
  };
  const capture = (id) => { try { root.setPointerCapture?.(id); } catch {} };
  const release = (id) => { if (id != null) try { root.releasePointerCapture?.(id); } catch {} };
  function semanticTarget(target) {
    for (let node = target, depth = 0; node && depth < 8; node = node.parentNode, depth += 1) {
      if (SEMANTIC.has(String(node.tagName ?? node.nodeName ?? "").toUpperCase())) return true;
    }
    return false;
  }
  function textareaTarget(target) {
    for (let node = target, depth = 0; node && depth < 8; node = node.parentNode, depth += 1) {
      if (String(node.tagName ?? node.nodeName ?? "").toUpperCase() === "TEXTAREA") return true;
    }
    return false;
  }
  function descriptorAt(p) {
    const controls = getControls();
    return (Array.isArray(controls) ? controls : []).some((item) => item
      && p[0] >= item.x && p[0] <= item.x + item.width
      && p[1] >= item.y && p[1] <= item.y + item.height);
  }
  function blockedAt(p) {
    const rects = getBlockedRects();
    return (Array.isArray(rects) ? rects : []).some((item) => {
      const r = item?.rect ?? item;
      return r && p[0] >= r.x && p[0] <= r.x + r.width && p[1] >= r.y && p[1] <= r.y + r.height;
    });
  }
  const controlTarget = (event, p) => semanticTarget(event?.target) || descriptorAt(p) || blockedAt(p);
  const inside = (p) => {
    const r = bounds();
    return p[0] >= r.x && p[0] <= r.x + r.width && p[1] >= r.y && p[1] <= r.y + r.height;
  };
  const preview = (rect) => {
    ui.selection = rect ? { ...rect } : null;
    try { changed?.(); } catch {}
  };
  function stopDrag() {
    if (!drag) return;
    const id = drag.pointerId;
    drag = null;
    if (ownedPointer === id) ownedPointer = null;
    release(id);
    preview(null);
  }
  function stopPickerDrag() {
    if (!pickerDrag) return;
    const id = pickerDrag.pointerId;
    pickerDrag = null;
    if (ownedPointer === id) ownedPointer = null;
    release(id);
  }
  function startSelection(event, p) {
    const current = canonicalRect(state().review?.rect);
    if (!current) {
      drag = { kind: "create", pointerId: event.pointerId, start: clampPoint(p, bounds()), rect: null };
    } else {
      const handle = handleAtPoint(current, p);
      if (handle) drag = { kind: "resize", pointerId: event.pointerId, handle, rect: current };
      else if (containsPoint(current, p)) {
        drag = { kind: "move", pointerId: event.pointerId, rect: current,
          anchor: [p[0] - current.x, p[1] - current.y] };
      } else drag = { kind: "create", pointerId: event.pointerId, start: clampPoint(p, bounds()), rect: null };
    }
    ownedPointer = event.pointerId;
    capture(event.pointerId);
    preview(drag.rect);
  }
  function updateSelection(p) {
    if (!drag) return;
    if (drag.kind === "create") drag.rect = rectFromPoints(drag.start, p, bounds());
    else if (drag.kind === "move") drag.rect = moveRect(drag.rect, p, drag.anchor, bounds());
    else drag.rect = resizeRect(drag.rect, drag.handle, p, bounds());
    preview(drag.rect);
  }
  function finishSelection(event) {
    if (!drag || !same(event, drag.pointerId)) return;
    const rect = drag.rect;
    consume(event);
    stopDrag();
    if (reviewActive() && rect) send("review.rect", { rect });
  }
  const picker = () => ui.picker && typeof ui.picker === "object" ? ui.picker : null;
  const setPickerPoint = (p) => {
    const current = picker();
    if (!current) return;
    current.point = clampPoint(p, bounds());
    try { changed?.(); } catch {}
  };
  function samplePicker(p) {
    const current = picker();
    if (!current || !inside(p)) return;
    const color = samplePixel(artwork, ...clampPoint(p));
    const hsv = hexToHsv(color);
    Object.assign(current, hsv, { color: color.toLowerCase(), picking: false });
    try { changed?.(); } catch {}
  }
  function startPicker(event, p) {
    pickerDrag = { pointerId: event.pointerId, inside: inside(p) };
    ownedPointer = event.pointerId;
    setPickerPoint(p);
    capture(event.pointerId);
  }
  function finishPicker(event, p) {
    if (!pickerDrag || !same(event, pickerDrag.pointerId)) return;
    const allowed = pickerDrag.inside && inside(p);
    consume(event);
    stopPickerDrag();
    if (allowed) samplePicker(p);
  }
  function onPointerDown(event) {
    if (destroyed || handledDown.has(event)) return;
    handledDown.add(event);
    const p = coords(event);
    if (semanticTarget(event?.target)) return;
    if (!primary(event)) { if (ui.feedbackOpen || picker()?.picking) consume(event); return; }
    if (ownedPointer !== null && event.pointerId !== ownedPointer) { consume(event); return; }
    const currentPicker = picker();
    if (currentPicker?.picking) {
      consume(event);
      if (!controlTarget(event, p)) startPicker(event, p);
    return;
  }
    if (ui.feedbackOpen) {
      if (controlTarget(event, p)) { consume(event); return; }
      if (reviewActive()) { consume(event); startSelection(event, p); }
      else consume(event);
      return;
    }
    const r = bounds();
    if (p[0] < r.x || p[0] > r.x + r.width || p[1] < r.y || p[1] > r.y + r.height
      || controlTarget(event, p)) consume(event);
    else ownedPointer = event.pointerId;
  }
  function onPointerMove(event) {
    if (destroyed) return;
    const p = coords(event);
    if (!pickerDrag && picker()?.picking) { if (!semanticTarget(event.target)) { consume(event); setPickerPoint(p); } return; }
    if (pickerDrag) {
    if (same(event, pickerDrag.pointerId)) { consume(event); setPickerPoint(p); }
      return;
    }
    if (drag && same(event, drag.pointerId)) { consume(event); if (reviewActive()) updateSelection(p); }
  }
  function onPointerUp(event) {
    if (destroyed) return;
    const p = coords(event);
    if (pickerDrag) { finishPicker(event, p); return; }
    if (drag) { if (same(event, drag.pointerId)) { updateSelection(p); finishSelection(event); } return; }
    if (same(event, ownedPointer)) ownedPointer = null;
  }
  function cancelPointer(event) {
    const matches = (id) => event?.pointerId == null || same(event, id);
    if (drag && matches(drag.pointerId)) { consume(event); stopDrag(); }
    else if (pickerDrag && matches(pickerDrag.pointerId)) { consume(event); stopPickerDrag(); }
    else if (event?.pointerId === ownedPointer) ownedPointer = null;
  }
  function boundaryMove(event) {
    if (drag || pickerDrag) return;
    const p = coords(event);
    if (p[0] < 0 || p[0] > bounds().width || p[1] < 0 || p[1] > bounds().height) {
      event.stopImmediatePropagation?.();
      event.preventDefault?.();
    }
  }
  function threadViewport() {
    const result = getThreadViewport();
    return result && typeof result.id === "string" && result.id
      && Number.isFinite(result.maxScroll) && result.maxScroll >= 0
      && Number.isFinite(result.x) && Number.isFinite(result.y)
      && Number.isFinite(result.width) && Number.isFinite(result.height) ? result : null;
  }
  function wheelDelta(event, thread) {
    const delta = Number(event.deltaY);
    if (!Number.isFinite(delta)) return 0;
    if (event.deltaMode === 1) return delta * 16;
    if (event.deltaMode === 2) return delta * (thread?.height || 700);
    return delta;
  }
  function threadDelta(event, thread) {
    const delta = wheelDelta(event, thread);
    return Math.min(thread.maxScroll, Math.max(-thread.maxScroll, delta));
  }
  function threadValue(event, thread) {
    const current = Number(ui.threadScroll?.[thread.id] ?? 0);
    return Math.min(thread.maxScroll, Math.max(0, current + threadDelta(event, thread)));
  }
  function inRect(p, rect) {
    return p[0] >= rect.x && p[0] <= rect.x + rect.width
      && p[1] >= rect.y && p[1] <= rect.y + rect.height;
  }
  function onWheel(event) {
    if (textareaTarget(event.target)) return; const p = coords(event);
    const thread = threadViewport();
    if (thread && inRect(p, thread)) {
      consume(event);
      send("comments.thread.scroll", { id: thread.id, value: threadValue(event, thread) });
      return;
    }
    if (ui.collapsed) return;
    const action = inRect(p, LAYERS) ? "layers.scroll" : inRect(p, COMMENTS) ? "comments.scroll" : null;
    if (!action) return;
    consume(event);
    send(action, { deltaY: wheelDelta(event, thread) });
  }
  function onKeyDown(event) {
    if (event.key !== "Escape" || event.isComposing) return;
    let handled = false;
    const currentPicker = picker();
    if (currentPicker?.picking || currentPicker?.open) {
      Object.assign(currentPicker, { picking: false, open: false, point: null });
      handled = true;
    }
    if (ui.feedbackOpen || CANCELLABLE_PHASES.has(phase())) {
      ui.feedbackOpen = false;
      stopDrag();
      if (CANCELLABLE_PHASES.has(phase())) send("review.cancel", {});
      handled = true;
    }
    if (handled) { try { changed?.(); } catch {} consume(event); }
  }
  listen(root, "pointerdown", onPointerDown);
  listen(root, "pointermove", onPointerMove);
  listen(root, "pointerup", onPointerUp);
  listen(root, "pointercancel", cancelPointer);
  listen(root, "lostpointercapture", cancelPointer);
  listen(root, "wheel", onWheel);
  listen(canvas, "pointermove", boundaryMove);
  listen(view, "pointerdown", onPointerDown);
  listen(view, "blur", () => cancelPointer({}));
  listen(root, "keydown", onKeyDown); listen(view, "keydown", onKeyDown);
  return { destroy() {
    if (destroyed) return;
    destroyed = true;
    stopDrag();
    stopPickerDrag();
    for (const remove of listeners.splice(0)) remove();
  } };
}
