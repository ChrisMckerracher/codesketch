import test from "node:test";
import assert from "node:assert/strict";

import { createControls } from "../src/studio/workspace/controls/index.mjs";
import { layoutText } from "../src/studio/workspace/controls/layout.mjs";
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
function mount(descriptors) {
  const document = new FakeDocument(); const root = document.createElement("div");
  const controls = createControls({ root, vector: vector(), dispatch() {}, changed() {} });
  controls.update(descriptors); return { root, controls };
}

test("controls require the current vector layout contract without an older fallback", () => {
  const document = new FakeDocument(); const root = document.createElement("div");
  assert.throws(() => createControls({ root }), /current vector/);
  assert.throws(() => layoutText({ measure() { return 8; } }, "A", 20), /vector\.layout/);
  assert.throws(() => layoutText({ layout() { return { cells: [], lines: [], width: 0, height: 0, lineHeight: 0 }; } }, "A", 20), /invalid layout/);
});

test("DOM events consume rejected async dispatches after routing reports them", () => {
  const document = new FakeDocument(); const root = document.createElement("div"); let caught = false;
  const rejection = { catch(handler) { caught = true; handler(); return this; } };
  const controls = createControls({ root, vector: vector(), dispatch: () => rejection, changed() {} });
  controls.update([descriptor("button")]); root.children[0].emit("click"); assert.equal(caught, true);
});

test("edit textareas select all, commit once on Enter or blur, and cancel on Escape", async () => {
  const calls = []; const document = new FakeDocument(); const root = document.createElement("div");
  const controls = createControls({ root, vector: vector(), dispatch: (action, payload) => {
    calls.push([action, payload]); return Promise.resolve();
  }, changed() {} });
  const edit = descriptor("textarea", { id: "layer-name", value: "Paint", edit: true,
    commitAction: "layer.rename", cancelAction: "layer.rename.cancel", payload: { id: "paint" } });
  controls.update([edit]); const area = root.children[0];
  assert.equal(area["data-cancel-action"], "layer.rename.cancel");
  assert.deepEqual([area.selectionStart, area.selectionEnd], [0, 5]);
  area.value = "Renamed"; area.emit("input"); area.emit("keydown", { key: "Enter", isComposing: true });
  assert.equal(calls.length, 0); area.emit("compositionend"); area.emit("keydown", { key: "Enter" }); area.emit("blur");
  await Promise.resolve(); assert.deepEqual(calls, [["layer.rename", { id: "paint", value: "Renamed" }]]);
  controls.update([edit]); root.children[0].emit("keydown", { key: "Escape" }); await Promise.resolve();
  assert.deepEqual(calls.at(-1), ["layer.rename.cancel", { id: "paint" }]); controls.destroy();
});

test("editing text survives descriptor polling until it is unmounted", () => {
  const { root, controls } = mount([descriptor("textarea", { id: "layer-name", value: "Paint", edit: true,
    commitAction: "layer.rename", cancelAction: "layer.rename.cancel" })]);
  const area = root.children[0]; area.value = "Draft"; area.emit("input");
  controls.update([descriptor("textarea", { id: "layer-name", value: "Paint", edit: true,
    commitAction: "layer.rename", cancelAction: "layer.rename.cancel" })]);
  assert.equal(root.children[0].value, "Draft"); controls.destroy();
});

test("composition end flushes final text before one pending blur commit at the current revision", async () => {
  const calls = []; const document = new FakeDocument(); const root = document.createElement("div");
  const controls = createControls({ root, vector: vector(), dispatch: (action, payload) => {
    calls.push([action, payload]); return Promise.resolve();
  }, changed() {} });
  const descriptorFor = (token, revision) => descriptor("textarea", { id: "layer-name", value: "Paint", edit: true,
    textAction: "layer.rename.text", commitAction: "layer.rename", cancelAction: "layer.rename.cancel",
    payload: { id: "paint", token, revision } });
  controls.update([descriptorFor("new", 2)]); const area = root.children[0];
  area.emit("compositionstart"); area.value = "Final"; area.emit("blur"); controls.update([descriptorFor("fresh", 3)]);
  area.emit("compositionend"); await Promise.resolve();
  assert.deepEqual(calls, [
    ["layer.rename.text", { id: "paint", token: "fresh", revision: 3, value: "Final" }],
    ["layer.rename", { id: "paint", token: "fresh", revision: 3, value: "Final" }],
  ]); controls.destroy();
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
  remove() { if (this.ownerDocument.activeElement === this) { this.blurEvents += 1; this.ownerDocument.activeElement = null; this.emit("blur"); }
    const index = this.parentNode?.children.indexOf(this); if (index >= 0) this.parentNode.children.splice(index, 1); }
  focus() { this.ownerDocument.activeElement = this; this.emit("focus"); }
  setSelectionRange(start, end, direction = "none") { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction; }
  setPointerCapture(pointerId) { this.captures.push(pointerId); }
  releasePointerCapture(pointerId) { this.releases.push(pointerId); }
  setAttribute(name, value) { this[name] = String(value); }
}
