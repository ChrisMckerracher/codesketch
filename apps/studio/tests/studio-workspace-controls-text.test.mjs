import test from "node:test";
import assert from "node:assert/strict";

import { createControls } from "../src/studio/workspace/controls/index.mjs";
import { caretPosition, layoutText, offsetAtPoint } from "../src/studio/workspace/controls/layout.mjs";
import { createVector } from "../src/studio/workspace/vector/index.mjs";

function descriptor(kind, extra = {}) {
  return { id: kind, kind, x: 10, y: 20, width: 160, height: 32, label: kind,
    action: `test.${kind}`, payload: null, value: kind === "textarea" ? "" : 0, ...extra };
}

function vector() {
  const base = createVector(null);
  return { texts: [], rects: [], strokes: [], layout: base.layout, measure: base.measure,
    text(...args) { this.texts.push(args); }, rect(...args) { this.rects.push(args); },
    stroke(...args) { this.strokes.push(args); } };
}

function context() { return { save() {}, restore() {}, beginPath() {}, rect() {}, clip() {} }; }

function mount(descriptors, point = (event) => event.raw) {
  const document = new FakeDocument();
  const root = document.createElement("div");
  const v = vector();
  const controls = createControls({ root, vector: v, point, dispatch() {}, changed() {} });
  controls.update(descriptors);
  return { root, controls, v };
}

test("caret boundaries follow vector CRLF, CR, Unicode separators, expansion, and scale", () => {
  const v = createVector(null);
  const breaks = "A\r\n\u2028\u2029B";
  const layout = v.layout(breaks, Infinity, 1);
  assert.deepEqual(caretPosition(v, breaks, layout, 1), { x: 8, y: 0 });
  assert.deepEqual(caretPosition(v, breaks, layout, 2), { x: 0, y: 11 });
  assert.deepEqual(caretPosition(v, breaks, layout, 3), { x: 0, y: 11 });
  assert.deepEqual(caretPosition(v, breaks, layout, 4), { x: 0, y: 22 });
  assert.deepEqual(caretPosition(v, breaks, layout, 5), { x: 0, y: 33 });
  assert.deepEqual(caretPosition(v, breaks, layout, breaks.length), { x: 8, y: 33 });
  const trailing = v.layout("A\u2028", Infinity, 1);
  assert.deepEqual(caretPosition(v, "A\u2028", trailing, 2), { x: 0, y: 11 });
  const expanded = v.layout("ß", Infinity, 2);
  assert.deepEqual(caretPosition(v, "ß", expanded, 1, 2), { x: 32, y: 0 });
  assert.equal(offsetAtPoint(v, "ß", expanded, 25, 3, 2), 1);
});

test("single-line horizontal scroll keeps glyphs, selection, caret, and pointer hit testing aligned", () => {
  const value = "A very long inline layer name";
  const { root, controls, v } = mount([descriptor("textarea", { value, singleLine: true, width: 48, height: 20 })]);
  const area = root.children[0];
  area.focus(); area.setSelectionRange(value.length, value.length); controls.draw(context(), v);
  const glyph = v.texts.find(([text]) => text === "N");
  const caret = v.strokes.find(([, color]) => color === "#2563EB");
  assert.ok(glyph && glyph[1] < 14, "scrolled glyphs use the horizontal offset");
  assert.ok(caret && caret[0][0][0] <= 54, "the caret uses the same horizontal offset");
  area.setSelectionRange(0, value.length, "forward"); controls.draw(context(), v);
  assert.ok(v.rects.some(([x]) => x < 14), "selection uses the horizontal offset");
  area.emit("pointerdown", { button: 0, pointerId: 1, raw: [50, 27] });
  area.emit("pointerup", { button: 0, pointerId: 1, raw: [50, 27] });
  assert.ok(area.selectionStart > 0, "pointer hit testing includes the horizontal offset");
  controls.destroy();
});

test("an emptied single-line field still paints its caret before typing again", () => {
  const { root, controls, v } = mount([descriptor("textarea", { value: "Name", singleLine: true, width: 48, height: 20, edit: true })]);
  const area = root.children[0]; area.setSelectionRange(0, 4); area.value = ""; area.emit("input");
  assert.doesNotThrow(() => controls.draw(context(), v));
  assert.ok(v.strokes.some(([, color]) => color === "#2563EB"), "empty field paints a visible caret");
  area.value = "N"; area.emit("input"); assert.doesNotThrow(() => controls.draw(context(), v));
  assert.ok(v.texts.some(([text]) => text === "N"), "typing after clearing remains renderable"); controls.destroy();
});

class FakeDocument {
  constructor() { this.activeElement = null; this.listeners = new Map(); }
  createElement(tag) { return new FakeElement(this, tag); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) { if (this.listeners.get(type) === listener) this.listeners.delete(type); }
}
class FakeElement {
  constructor(ownerDocument, tag) { this.ownerDocument = ownerDocument; this.tagName = tag.toUpperCase(); this.style = {};
    this.listeners = new Map(); this.children = []; this.value = ""; this.selectionStart = 0; this.selectionEnd = 0;
    this.selectionDirection = "none"; this.disabled = false; this.captures = []; this.releases = []; this.blurEvents = 0; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) { if (this.listeners.get(type) === listener) this.listeners.delete(type); }
  emit(type, init = {}) { const event = { target: this, preventDefault() {}, ...init }; this.listeners.get(type)?.(event); return event; }
  appendChild(child) { this.children.push(child); child.parentNode = this; }
  remove() { const index = this.parentNode?.children.indexOf(this); if (index >= 0) this.parentNode.children.splice(index, 1); }
  focus() { this.ownerDocument.activeElement = this; }
  setSelectionRange(start, end, direction = "none") { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction; }
  setPointerCapture(pointerId) { this.captures.push(pointerId); }
  releasePointerCapture(pointerId) { this.releases.push(pointerId); }
  setAttribute(name, value) { this[name] = String(value); }
}
