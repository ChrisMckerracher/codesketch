import test from "node:test";
import assert from "node:assert/strict";

import { createControls } from "../src/studio/workspace/controls/index.mjs";
import { createVector } from "../src/studio/workspace/vector/index.mjs";

function descriptor(kind, extra = {}) {
  return { id: kind, kind, x: 10, y: 20, width: 160, height: 32, label: kind,
    action: `test.${kind}`, payload: null, value: kind === "textarea" ? "" : 0, ...extra };
}
function vector() {
  const base = createVector(null);
  return { layout: base.layout, measure: base.measure, texts: [], rects: [], strokes: [],
    text(...args) { this.texts.push(args); }, rect(...args) { this.rects.push(args); }, stroke(...args) { this.strokes.push(args); } };
}
function context() { return { save() {}, restore() {}, beginPath() {}, rect() {}, clip() {} }; }
function mount(descriptors) {
  const document = new FakeDocument(); const root = document.createElement("div"); const calls = [];
  const v = vector();
  const controls = createControls({ root, vector: v, point: (event) => event.raw,
    dispatch: (action, value) => calls.push([action, value]), changed() {} });
  controls.update(descriptors); return { document, root, calls, controls, v };
}

test("textarea pointer clicks and drags resolve original UTF-16 offsets from vector cells", () => {
  const value = "Aß😀BC"; const { root, controls, v } = mount([descriptor("textarea", { value, width: 60, height: 32 })]);
  const area = root.children[0]; controls.draw(context(), v);
  const pointer = (type, pointerId, raw, extra = {}) => area.emit(type, { button: 0, pointerId, raw, ...extra });
  pointer("pointerdown", 1, [15, 27]); pointer("pointerup", 1, [15, 27]); assert.deepEqual([area.selectionStart, area.selectionEnd], [0, 0]);
  pointer("pointerdown", 2, [10 + 4 + 8 + 1, 27]); pointer("pointerup", 2, [10 + 4 + 8 + 1, 27]); assert.deepEqual([area.selectionStart, area.selectionEnd], [1, 1]);
  pointer("pointerdown", 3, [10 + 4 + 40 + 7, 27]); pointer("pointerup", 3, [10 + 4 + 40 + 7, 27]); assert.deepEqual([area.selectionStart, area.selectionEnd], [6, 6]);
  pointer("pointerdown", 4, [15, 27]); pointer("pointermove", 4, [10 + 4 + 40 + 7, 27]); pointer("pointerup", 4, [10 + 4 + 40 + 7, 27]);
  assert.deepEqual([area.selectionStart, area.selectionEnd, area.selectionDirection], [0, 6, "forward"]);
  assert.deepEqual(area.captures, [1, 2, 3, 4]); assert.deepEqual(area.releases, [1, 2, 3, 4]);
});

test("textarea hit testing uses the visible glyph band instead of row rounding", () => {
  const { root, controls } = mount([descriptor("textarea", { value: "A\nB", x: 20, y: 20, height: 32 })]); const area = root.children[0];
  area.emit("pointerdown", { button: 0, pointerId: 1, raw: [24, 26] }); area.emit("pointerup", { button: 0, pointerId: 1, raw: [24, 26] });
  area.emit("pointerdown", { button: 0, pointerId: 2, raw: [24, 30] }); area.emit("pointerup", { button: 0, pointerId: 2, raw: [24, 30] });
  assert.equal(area.selectionStart, 0); assert.equal(area.selectionEnd, 0); controls.destroy();
});

test("backward selections paint the active start caret and preserve direction", () => {
  const value = "ABCDEFGHIJ"; const { root, controls, v } = mount([descriptor("textarea", { value, width: 68, height: 20 })]); const area = root.children[0];
  const pointer = (type, pointerId, raw) => area.emit(type, { button: 0, pointerId, raw });
  pointer("pointerdown", 1, [10 + 4 + 8 * 3 + 7, 20 + 4 + 11 + 3]); pointer("pointermove", 1, [15, 24]); pointer("pointerup", 1, [15, 24]);
  assert.deepEqual([area.selectionStart, area.selectionEnd, area.selectionDirection], [0, 10, "backward"]); controls.draw(context(), v);
  const caret = v.strokes.filter(([, color]) => color === "#2563EB").at(-1); assert.deepEqual(caret[0][0], [14, 24]);
  area.setSelectionRange(0, value.length, "forward"); controls.draw(context(), v);
  const endCaret = v.strokes.filter(([, color]) => color === "#2563EB").at(-1);
  assert.deepEqual(endCaret[0], [[38, 25], [38, 32]], "end caret uses the wrapped active offset and scroll"); assert.equal(area.selectionDirection, "forward");
});

test("Shift-click extends from the active end of a backward selection", () => {
  const value = "ABCDEFGHIJ"; const { root, controls } = mount([descriptor("textarea", { value, width: 68, height: 20 })]); const area = root.children[0]; area.setSelectionRange(0, 6, "backward");
  const pointer = (type, pointerId, raw, extra = {}) => area.emit(type, { button: 0, pointerId, raw, ...extra });
  pointer("pointerdown", 1, [10 + 4 + 8 + 1, 24], { shiftKey: true }); pointer("pointerup", 1, [10 + 4 + 8 + 1, 24], { shiftKey: true });
  assert.deepEqual([area.selectionStart, area.selectionEnd, area.selectionDirection], [1, 6, "backward"]); controls.destroy();
});

test("range and plane pointer activation focuses the control and rejects competing or nonprimary pointers", () => {
  const { document, root, controls, calls } = mount([descriptor("textarea", { value: "old" }),
    descriptor("range", { id: "range", x: 20, y: 30, width: 100, height: 20, value: 25, min: 0, max: 100, track: { x: 20, y: 30, width: 100, height: 20 } }),
    descriptor("plane", { id: "plane", x: 20, y: 60, width: 100, height: 50, value: { x: 0.2, y: 0.3 } })]);
  const area = root.children[0]; const range = root.children[1]; const plane = root.children[2]; area.focus();
  range.emit("pointerdown", { button: 2, pointerId: 9, raw: [70, 30] }); assert.equal(document.activeElement, area); assert.deepEqual(range.captures, []);
  const rangeValue = range.value; range.emit("pointerdown", { button: 0, pointerId: 1, raw: [70, 30] }); assert.equal(document.activeElement, range); assert.deepEqual(range.captures, [1]);
  plane.emit("pointerdown", { button: 0, pointerId: 2, raw: [80, 80] }); assert.equal(document.activeElement, range); assert.deepEqual(plane.captures, []);
  assert.equal(controls.inputState("plane").value.x, 0.2); assert.notEqual(range.value, rangeValue); range.emit("pointermove", { pointerId: 1, raw: [120, 30] }); range.emit("pointerup", { pointerId: 1, raw: [120, 30] }); assert.deepEqual(range.releases, [1]);
  plane.emit("pointerdown", { button: 0, pointerId: 3, raw: [70, 85] }); assert.equal(document.activeElement, plane); assert.deepEqual(plane.captures, [3]); plane.emit("pointerup", { pointerId: 3, raw: [70, 85] }); plane.emit("keydown", { key: "ArrowRight" });
  assert.ok(calls.some(([action, payload]) => action === "test.plane" && payload.value.x > 0.5)); const before = controls.inputState("plane").value.x;
  plane.emit("pointerdown", { button: 2, pointerId: 4, raw: [120, 110] }); assert.equal(controls.inputState("plane").value.x, before); assert.deepEqual(plane.captures, [3]);
});

test("removing a focused control is safe when DOM blur synchronously re-syncs", () => {
  const document = new FakeDocument(); const root = document.createElement("div"); let controls; let changes = 0;
  controls = createControls({ root, vector: vector(), changed() { changes += 1; controls.update([]); } }); controls.update([descriptor("button")]);
  const button = root.children[0]; document.activeElement = button; controls.update([]);
  assert.equal(button.blurEvents, 1); assert.equal(changes, 0, "removed focus listener does not re-enter sync"); assert.equal(root.children.length, 0); assert.equal(controls.inputState("button"), null);
});

class FakeDocument {
  constructor() { this.activeElement = null; this.listeners = new Map(); }
  createElement(tag) { return new FakeElement(this, tag); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) { if (this.listeners.get(type) === listener) this.listeners.delete(type); }
}
class FakeElement {
  constructor(ownerDocument, tag) { this.ownerDocument = ownerDocument; this.tagName = tag.toUpperCase(); this.style = {}; this.listeners = new Map(); this.children = [];
    this.value = ""; this.selectionStart = 0; this.selectionEnd = 0; this.selectionDirection = "none"; this.disabled = false; this.captures = []; this.releases = []; this.blurEvents = 0; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) { if (this.listeners.get(type) === listener) this.listeners.delete(type); }
  emit(type, init = {}) { const event = { target: this, preventDefault() {}, ...init }; this.listeners.get(type)?.(event); return event; }
  appendChild(child) { this.children.push(child); child.parentNode = this; }
  remove() { if (this.ownerDocument.activeElement === this) { this.blurEvents += 1; this.ownerDocument.activeElement = null; this.emit("blur"); } const index = this.parentNode?.children.indexOf(this); if (index >= 0) this.parentNode.children.splice(index, 1); }
  focus() { this.ownerDocument.activeElement = this; this.emit("focus"); }
  setSelectionRange(start, end, direction = "none") { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction; }
  setPointerCapture(pointerId) { this.captures.push(pointerId); }
  releasePointerCapture(pointerId) { this.releases.push(pointerId); }
  setAttribute(name, value) { this[name] = String(value); }
}
