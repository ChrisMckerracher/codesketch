// Persistent invisible semantic elements for workspace controls. The canvas
// owns visible chrome; these nodes provide native focus, keyboard, IME, paste,
// selection, and pointer-capture behavior.

import {
  clamp,
  elementTag,
  number,
  planeValue,
  positive,
  rawPoint,
  setPlaneAria,
  trackLimits,
} from "./support.mjs";
import { focus, owns, primary, selectionAnchor, setSelection, textOffset } from "./pointer.mjs";
const INVISIBLE =
  "position:absolute;margin:0;padding:0;border:0;opacity:0;" +
  "background:none;color:transparent;caret-color:transparent;" +
  "font:0/0 sans-serif;outline:none;resize:none;overflow:hidden;" +
  "pointer-events:auto;";
export function createFields({ root, dispatch, changed, point, vector, scrolls }) {
  const doc = root?.ownerDocument ?? globalThis.document;
  if (!doc?.createElement) throw new TypeError("controls require a document");
  const fire = typeof dispatch === "function" ? dispatch : () => {};
  const notify = typeof changed === "function" ? changed : () => {};
  const locate = typeof point === "function" ? point : (event) => [event.clientX, event.clientY];
  const controls = new Map();
  const elements = new Set();
  let currentVector = vector;
  let activeDrag = null;
  const selectionChanged = () => {
    const el = doc.activeElement;
    if (el && elements.has(el) && el.tagName === "TEXTAREA") notify();
  };
  doc.addEventListener?.("selectionchange", selectionChanged);
  function mount(descriptor) {
    const el = doc.createElement(elementTag(descriptor.kind));
    if (descriptor.kind === "button" || descriptor.kind === "plane") el.type = "button";
    if (descriptor.kind === "range") el.type = "range";
    el.style.cssText = INVISIBLE;
    const record = {
      descriptor,
      el,
      value: planeValue(descriptor.value),
      composing: false,
      dragging: false,
    dispatch: fire,
    document: doc,
    skipClick: false,
    focusListener: null,
    blurListener: null,
    };
    bind(record);
    root.appendChild(el);
    controls.set(descriptor.id, record);
    elements.add(el);
    apply(record);
    return record;
  }
  function bind(record) {
    const { el } = record;
    record.focusListener = () => notify(); record.blurListener = () => notify();
    el.addEventListener("focus", record.focusListener);
    el.addEventListener("blur", record.blurListener);
    if (record.descriptor.kind === "range") bindRange(record);
    else if (record.descriptor.kind === "textarea") bindArea(record);
    else if (record.descriptor.kind === "plane") bindPlane(record);
    else {
      el.addEventListener("click", () => {
        if (!el.disabled) dispatchValue(record, record.descriptor.value);
      });
    }
  }
  function bindRange(record) {
    const { el } = record;
    el.addEventListener("input", () => {
      if (activeDrag?.record === record) return;
      dispatchValue(record, Number(el.value));
      notify();
    });
    bindDrag(record, (event) => trackRange(record, event));
  }
  function bindPlane(record) {
    const { el } = record;
    el.addEventListener("click", (event) => {
      if (!primary(event)) return;
      if (record.skipClick && event.detail !== 0) {
        record.skipClick = false;
        return;
      }
      record.skipClick = false;
      if (!el.disabled) dispatchValue(record, { ...record.value });
    });
    el.addEventListener("keydown", (event) => {
      if (el.disabled) return;
      const deltas = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const delta = deltas[event.key];
      if (!delta) return;
      event.preventDefault?.();
      const step = positive(record.descriptor.step, 0.01);
      record.value = {
        x: clamp(record.value.x + delta[0] * step, 0, 1),
        y: clamp(record.value.y + delta[1] * step, 0, 1),
      };
      setPlaneAria(record);
      dispatchValue(record, { ...record.value });
      notify();
    });
    bindDrag(record, (event) => trackPlane(record, event));
  }
  function bindDrag(record, move, begin = move) {
    const { el } = record;
    el.addEventListener("pointerdown", (event) => {
      if (el.disabled || !primary(event) || activeDrag) return;
      event.preventDefault?.();
      focus(el);
      record.skipClick = record.descriptor.kind === "plane" || record.descriptor.kind === "textarea";
      activeDrag = { record, pointerId: event.pointerId, move, anchor: null };
      record.dragging = true;
      try {
        el.setPointerCapture(event.pointerId);
      } catch {
        // Some test and embedded DOMs do not implement pointer capture.
      }
      begin(event);
      notify();
    });
    el.addEventListener("pointermove", (event) => {
      if (owns(record, event, activeDrag)) {
        activeDrag.move(event);
        notify();
      }
    });
    const release = (event) => {
      if (!owns(record, event, activeDrag)) return;
      activeDrag = null;
      record.dragging = false;
      try {
        el.releasePointerCapture(event.pointerId);
      } catch {
        // Capture may already be gone after cancellation.
      }
      notify();
    };
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("lostpointercapture", release);
  }

  function bindTextPointer(record) {
    record.el.addEventListener("click", (event) => {
      if (record.skipClick && event.detail !== 0) {
        record.skipClick = false;
        event.preventDefault?.();
      }
    });
    bindDrag(record, (event) => {
      const offset = textOffset(record, event, currentVector, scrolls, locate);
      setSelection(record.el, activeDrag.anchor, offset);
    }, (event) => {
      const offset = textOffset(record, event, currentVector, scrolls, locate);
      activeDrag.anchor = event.shiftKey ? selectionAnchor(record.el) : offset;
      setSelection(record.el, activeDrag.anchor, offset);
    });
  }
  function trackRange(record, event) {
    const d = record.descriptor;
    const [px, py] = rawPoint(locate, event);
    const axis = d.axis === "y" ? "y" : "x";
    const [start, end] = trackLimits(d, axis);
    const ratio = clamp(((axis === "y" ? py : px) - start) / (end - start || 1), 0, 1);
    const min = number(d.min, 0);
    const max = Math.max(number(d.max, 100), min);
    const step = positive(d.step, 1);
    const raw = min + ratio * (max - min);
    const value = clamp(min + Math.round((raw - min) / step) * step, min, max);
    record.el.value = String(value);
    dispatchValue(record, value);
  }

  function trackPlane(record, event) {
    const d = record.descriptor;
    const [px, py] = rawPoint(locate, event);
    record.value = {
      x: clamp((px - d.x) / d.width, 0, 1),
      y: clamp((py - d.y) / d.height, 0, 1),
    };
    setPlaneAria(record);
    dispatchValue(record, { ...record.value });
  }
  function bindArea(record) {
    bindTextPointer(record);
    record.el.addEventListener("compositionstart", () => { record.composing = true; });
    record.el.addEventListener("compositionend", () => {
      record.composing = false;
      notify();
    });
    record.el.addEventListener("input", () => {
      dispatchValue(record, record.el.value);
      notify();
    });
  } function apply(record) {
    const d = record.descriptor;
    const el = record.el;
    el.style.left = `${d.x}px`;
    el.style.top = `${d.y}px`;
    el.style.width = `${d.width}px`;
    el.style.height = `${d.height}px`;
    el.setAttribute?.("aria-label", d.label || d.id);
    el.disabled = Boolean(d.disabled);

    if (d.kind === "plane") {
      if (!busy(record)) record.value = planeValue(d.value);
      setPlaneAria(record);
      return;
    }
    if (busy(record)) return;
    if (d.kind === "range") {
      const min = number(d.min, 0);
      const max = Math.max(number(d.max, 100), min);
      el.min = String(min);
      el.max = String(max);
      el.step = String(positive(d.step, 1));
      const value = clamp(number(d.value, min), min, max);
      if (Number(el.value) !== value) el.value = String(value);
    } else if (d.kind === "textarea") {
      el.placeholder = d.placeholder == null ? "" : String(d.placeholder);
      const value = d.value == null ? "" : String(d.value);
      if (el.value !== value) el.value = value;
    }
  }

  function sync(descriptors) {
    const seen = new Set();
    for (const descriptor of descriptors) {
      seen.add(descriptor.id);
      const existing = controls.get(descriptor.id);
      if (existing && existing.descriptor.kind === descriptor.kind) {
        existing.descriptor = descriptor;
        apply(existing);
      } else {
        if (existing) remove(existing);
        mount(descriptor);
      }
    }
    for (const record of [...controls.values()]) {
      if (!seen.has(record.descriptor.id)) remove(record);
    }
  }

  function remove(record) {
    if (activeDrag?.record === record) activeDrag = null;
    record.dragging = false;
    controls.delete(record.descriptor.id);
    elements.delete(record.el);
    record.el.removeEventListener?.("focus", record.focusListener);
    record.el.removeEventListener?.("blur", record.blurListener);
    record.removed = true;
    record.el.remove();
  }

  function destroy() {
    doc.removeEventListener?.("selectionchange", selectionChanged);
    for (const record of [...controls.values()]) remove(record);
  }

  function state() {
    return [...controls.values()].map(collect);
  }

  function inputState(id) {
    const record = controls.get(id);
    return record ? collect(record) : null;
  }

  function collect(record) {
    const { descriptor: d, el } = record;
    const value = d.kind === "plane" ? { ...record.value } : d.kind === "button" ? d.value : el.value;
    return {
      descriptor: d,
      focused: doc.activeElement === el,
      value,
      selectionStart: el.selectionStart ?? null,
      selectionEnd: el.selectionEnd ?? null,
      selectionDirection: d.kind === "textarea" ? el.selectionDirection ?? "none" : null,
    };
  }

  return { sync, destroy, state, inputState, setVector(nextVector) { currentVector = nextVector; } };
}

function dispatchValue(record, value) { const d = record.descriptor; const payload = d.payload && typeof d.payload === "object" ? d.payload : {}; const result = record.dispatch?.(d.action, { ...payload, value }); result?.catch?.(() => {}); }

function busy(record) { return record.composing || record.document.activeElement === record.el || record.dragging; }
