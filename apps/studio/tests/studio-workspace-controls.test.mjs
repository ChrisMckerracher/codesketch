import test from "node:test";
import assert from "node:assert/strict";

import { createControls } from "../src/studio/workspace/controls/index.mjs";
import { caretPosition, layoutText, offsetAtPoint } from "../src/studio/workspace/controls/layout.mjs";
import { createVector } from "../src/studio/workspace/vector/index.mjs";

function descriptor(kind, extra = {}) {
  return {
    id: kind,
    kind,
    x: 10,
    y: 20,
    width: 160,
    height: 32,
    label: kind,
    action: `test.${kind}`,
    payload: null,
    value: kind === "textarea" ? "" : 0,
    ...extra,
  };
}

function vector() {
  const base = createVector(null);
  return {
    texts: [],
    rects: [],
    strokes: [],
    layout: base.layout,
    measure: base.measure,
    text(...args) { this.texts.push(args); },
    rect(...args) { this.rects.push(args); },
    stroke(...args) { this.strokes.push(args); },
  };
}

function context() {
  return { save() {}, restore() {}, beginPath() {}, rect() {}, clip() {} };
}

function mount(descriptors, point = (event) => event.raw) {
  const document = new FakeDocument();
  const root = document.createElement("div");
  const calls = [];
  const v = vector();
  const controls = createControls({
    root,
    vector: v,
    point,
    dispatch: (action, value) => calls.push([action, value]),
    changed() {},
  });
  controls.update(descriptors);
  return { document, root, calls, controls, v };
}

test("controls require the current vector layout contract without an older fallback", () => {
  const document = new FakeDocument();
  const root = document.createElement("div");
  assert.throws(() => createControls({ root }), /current vector/);
  assert.throws(() => layoutText({ measure() { return 8; } }, "A", 20), /vector\.layout/);
  assert.throws(() => layoutText({ layout() { return { cells: [], lines: [], width: 0, height: 0, lineHeight: 0 }; } }, "A", 20), /invalid layout/);
});

test("DOM events consume rejected async dispatches after routing reports them", () => {
  const document = new FakeDocument();
  const root = document.createElement("div");
  let caught = false;
  const rejection = { catch(handler) { caught = true; handler(); return this; } };
  const controls = createControls({
    root,
    vector: vector(),
    dispatch: () => rejection,
    changed() {},
  });
  controls.update([descriptor("button")]);
  root.children[0].emit("click");
  assert.equal(caught, true);
});

test("edit textareas select all, commit once on Enter or blur, and cancel on Escape", async () => {
  const calls = [];
  const document = new FakeDocument();
  const root = document.createElement("div");
  const controls = createControls({ root, vector: vector(), dispatch: (action, payload) => {
    calls.push([action, payload]);
    return Promise.resolve();
  }, changed() {} });
  const edit = descriptor("textarea", {
    id: "layer-name", value: "Paint", edit: true, commitAction: "layer.rename", cancelAction: "layer.rename.cancel",
    payload: { id: "paint" },
  });
  controls.update([edit]);
  const area = root.children[0];
  assert.equal(area["data-cancel-action"], "layer.rename.cancel");
  assert.deepEqual([area.selectionStart, area.selectionEnd], [0, 5]);
  area.value = "Renamed";
  area.emit("input");
  area.emit("keydown", { key: "Enter", isComposing: true });
  assert.equal(calls.length, 0);
  area.emit("compositionend");
  area.emit("keydown", { key: "Enter" });
  area.emit("blur");
  await Promise.resolve();
  assert.deepEqual(calls, [["layer.rename", { id: "paint", value: "Renamed" }]]);

  controls.update([edit]);
  const second = root.children[0];
  second.emit("keydown", { key: "Escape" });
  await Promise.resolve();
  assert.deepEqual(calls.at(-1), ["layer.rename.cancel", { id: "paint" }]);
  controls.destroy();
});

test("editing text survives descriptor polling until it is unmounted", () => {
  const { root, controls } = mount([descriptor("textarea", {
    id: "layer-name", value: "Paint", edit: true, commitAction: "layer.rename", cancelAction: "layer.rename.cancel",
  })]);
  const area = root.children[0];
  area.value = "Draft";
  area.emit("input");
  controls.update([descriptor("textarea", {
    id: "layer-name", value: "Paint", edit: true, commitAction: "layer.rename", cancelAction: "layer.rename.cancel",
  })]);
  assert.equal(root.children[0].value, "Draft");
  controls.destroy();
});

test("single-line horizontal scroll keeps glyphs, selection, caret, and pointer hit testing aligned", () => {
  const value = "A very long inline layer name";
  const { root, controls, v } = mount([descriptor("textarea", {
    value, singleLine: true, width: 48, height: 20,
  })]);
  const area = root.children[0];
  area.focus();
  area.setSelectionRange(value.length, value.length);
  controls.draw(context(), v);
  const glyph = v.texts.find(([text]) => text === "N");
  const caret = v.strokes.find(([, color]) => color === "#2563EB");
  assert.ok(glyph && glyph[1] < 14, "scrolled glyphs use the horizontal offset");
  assert.ok(caret && caret[0][0][0] <= 54, "the caret uses the same horizontal offset");

  area.setSelectionRange(0, value.length, "forward");
  controls.draw(context(), v);
  assert.ok(v.rects.some(([x]) => x < 14), "selection uses the horizontal offset");
  area.emit("pointerdown", { button: 0, pointerId: 1, raw: [50, 27] });
  area.emit("pointerup", { button: 0, pointerId: 1, raw: [50, 27] });
  assert.ok(area.selectionStart > 0, "pointer hit testing includes the horizontal offset");
  controls.destroy();
});

test("an emptied single-line field still paints its caret before typing again", () => {
  const { root, controls, v } = mount([descriptor("textarea", {
    value: "Name", singleLine: true, width: 48, height: 20, edit: true,
  })]);
  const area = root.children[0];
  area.setSelectionRange(0, 4);
  area.value = "";
  area.emit("input");
  assert.doesNotThrow(() => controls.draw(context(), v));
  assert.ok(v.strokes.some(([, color]) => color === "#2563EB"), "empty field paints a visible caret");
  area.value = "N";
  area.emit("input");
  assert.doesNotThrow(() => controls.draw(context(), v));
  assert.ok(v.texts.some(([text]) => text === "N"), "typing after clearing remains renderable");
  controls.destroy();
});

test("composition end flushes final text before one pending blur commit at the current revision", async () => {
  const calls = [];
  const document = new FakeDocument();
  const root = document.createElement("div");
  const controls = createControls({ root, vector: vector(), dispatch: (action, payload) => {
    calls.push([action, payload]);
    return Promise.resolve();
  }, changed() {} });
  controls.update([descriptor("textarea", {
    id: "layer-name", value: "Paint", edit: true, textAction: "layer.rename.text",
    commitAction: "layer.rename", cancelAction: "layer.rename.cancel", payload: { id: "paint", token: "new", revision: 2 },
  })]);
  const area = root.children[0];
  area.emit("compositionstart");
  area.value = "Final";
  area.emit("blur");
  controls.update([descriptor("textarea", {
    id: "layer-name", value: "Paint", edit: true, textAction: "layer.rename.text",
    commitAction: "layer.rename", cancelAction: "layer.rename.cancel", payload: { id: "paint", token: "fresh", revision: 3 },
  })]);
  area.emit("compositionend");
  await Promise.resolve();
  assert.deepEqual(calls, [
    ["layer.rename.text", { id: "paint", token: "fresh", revision: 3, value: "Final" }],
    ["layer.rename", { id: "paint", token: "fresh", revision: 3, value: "Final" }],
  ]);
  controls.destroy();
});

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

test("textarea pointer clicks and drags resolve original UTF-16 offsets from vector cells", () => {
  const value = "Aß😀BC";
  const { root, controls, v } = mount([descriptor("textarea", { value, width: 60, height: 32 })]);
  const area = root.children[0];
  controls.draw(context(), v);

  const pointer = (type, pointerId, raw, extra = {}) => area.emit(type, { button: 0, pointerId, raw, ...extra });
  pointer("pointerdown", 1, [15, 27]);
  pointer("pointerup", 1, [15, 27]);
  assert.deepEqual([area.selectionStart, area.selectionEnd], [0, 0]);

  pointer("pointerdown", 2, [10 + 4 + 8 + 1, 27]);
  pointer("pointerup", 2, [10 + 4 + 8 + 1, 27]);
  assert.deepEqual([area.selectionStart, area.selectionEnd], [1, 1]);

  pointer("pointerdown", 3, [10 + 4 + 40 + 7, 27]);
  pointer("pointerup", 3, [10 + 4 + 40 + 7, 27]);
  assert.deepEqual([area.selectionStart, area.selectionEnd], [6, 6]);

  pointer("pointerdown", 4, [15, 27]);
  pointer("pointermove", 4, [10 + 4 + 40 + 7, 27]);
  pointer("pointerup", 4, [10 + 4 + 40 + 7, 27]);
  assert.deepEqual([area.selectionStart, area.selectionEnd, area.selectionDirection], [0, 6, "forward"]);
  assert.deepEqual(area.captures, [1, 2, 3, 4]);
  assert.deepEqual(area.releases, [1, 2, 3, 4]);
});

test("textarea hit testing uses the visible glyph band instead of row rounding", () => {
  const { root, controls } = mount([descriptor("textarea", {
    value: "A\nB",
    x: 20,
    y: 20,
    height: 32,
  })]);
  const area = root.children[0];
  area.emit("pointerdown", { button: 0, pointerId: 1, raw: [24, 26] });
  area.emit("pointerup", { button: 0, pointerId: 1, raw: [24, 26] });
  area.emit("pointerdown", { button: 0, pointerId: 2, raw: [24, 30] });
  area.emit("pointerup", { button: 0, pointerId: 2, raw: [24, 30] });

  assert.equal(area.selectionStart, 0);
  assert.equal(area.selectionEnd, 0);
  controls.destroy();
});

test("backward selections paint the active start caret and preserve direction", () => {
  const value = "ABCDEFGHIJ";
  const { root, controls, v } = mount([descriptor("textarea", { value, width: 68, height: 20 })]);
  const area = root.children[0];
  const pointer = (type, pointerId, raw) => area.emit(type, { button: 0, pointerId, raw });
  pointer("pointerdown", 1, [10 + 4 + 8 * 3 + 7, 20 + 4 + 11 + 3]);
  pointer("pointermove", 1, [15, 24]);
  pointer("pointerup", 1, [15, 24]);
  assert.deepEqual([area.selectionStart, area.selectionEnd, area.selectionDirection], [0, 10, "backward"]);

  controls.draw(context(), v);
  const caret = v.strokes.filter(([, color]) => color === "#2563EB").at(-1);
  assert.deepEqual(caret[0][0], [14, 24]);

  area.setSelectionRange(0, value.length, "forward");
  controls.draw(context(), v);
  const endCaret = v.strokes.filter(([, color]) => color === "#2563EB").at(-1);
  assert.deepEqual(endCaret[0], [[38, 25], [38, 32]], "end caret uses the wrapped active offset and scroll");
  assert.equal(area.selectionDirection, "forward");
});

test("Shift-click extends from the active end of a backward selection", () => {
  const value = "ABCDEFGHIJ";
  const { root, controls } = mount([descriptor("textarea", { value, width: 68, height: 20 })]);
  const area = root.children[0];
  area.setSelectionRange(0, 6, "backward");
  const pointer = (type, pointerId, raw, extra = {}) => area.emit(type, {
    button: 0,
    pointerId,
    raw,
    ...extra,
  });

  pointer("pointerdown", 1, [10 + 4 + 8 + 1, 24], { shiftKey: true });
  pointer("pointerup", 1, [10 + 4 + 8 + 1, 24], { shiftKey: true });

  assert.deepEqual(
    [area.selectionStart, area.selectionEnd, area.selectionDirection],
    [1, 6, "backward"],
  );
  controls.destroy();
});

test("range and plane pointer activation focuses the control and rejects competing or nonprimary pointers", () => {
  const { document, root, controls, calls } = mount([
    descriptor("textarea", { value: "old" }),
    descriptor("range", { id: "range", x: 20, y: 30, width: 100, height: 20, value: 25, min: 0, max: 100, track: { x: 20, y: 30, width: 100, height: 20 } }),
    descriptor("plane", { id: "plane", x: 20, y: 60, width: 100, height: 50, value: { x: 0.2, y: 0.3 } }),
  ]);
  const area = root.children[0];
  const range = root.children[1];
  const plane = root.children[2];
  area.focus();

  range.emit("pointerdown", { button: 2, pointerId: 9, raw: [70, 30] });
  assert.equal(document.activeElement, area);
  assert.deepEqual(range.captures, []);
  const rangeValue = range.value;
  range.emit("pointerdown", { button: 0, pointerId: 1, raw: [70, 30] });
  assert.equal(document.activeElement, range);
  assert.deepEqual(range.captures, [1]);
  plane.emit("pointerdown", { button: 0, pointerId: 2, raw: [80, 80] });
  assert.equal(document.activeElement, range);
  assert.deepEqual(plane.captures, []);
  assert.equal(controls.inputState("plane").value.x, 0.2);
  assert.notEqual(range.value, rangeValue);
  range.emit("pointermove", { pointerId: 1, raw: [120, 30] });
  range.emit("pointerup", { pointerId: 1, raw: [120, 30] });
  assert.deepEqual(range.releases, [1]);

  plane.emit("pointerdown", { button: 0, pointerId: 3, raw: [70, 85] });
  assert.equal(document.activeElement, plane);
  assert.deepEqual(plane.captures, [3]);
  plane.emit("pointerup", { pointerId: 3, raw: [70, 85] });
  plane.emit("keydown", { key: "ArrowRight" });
  assert.ok(calls.some(([action, payload]) => action === "test.plane" && payload.value.x > 0.5));

  const before = controls.inputState("plane").value.x;
  plane.emit("pointerdown", { button: 2, pointerId: 4, raw: [120, 110] });
  assert.equal(controls.inputState("plane").value.x, before);
  assert.deepEqual(plane.captures, [3]);
});

test("removing a focused control is safe when DOM blur synchronously re-syncs", () => {
  const document = new FakeDocument();
  const root = document.createElement("div");
  let controls;
  let changes = 0;
  controls = createControls({
    root,
    vector: vector(),
    changed() {
      changes += 1;
      controls.update([]);
    },
  });
  controls.update([descriptor("button")]);
  const button = root.children[0];
  document.activeElement = button;
  controls.update([]);

  assert.equal(button.blurEvents, 1);
  assert.equal(changes, 0, "removed focus listener does not re-enter sync");
  assert.equal(root.children.length, 0);
  assert.equal(controls.inputState("button"), null);
});

class FakeDocument {
  constructor() { this.activeElement = null; this.listeners = new Map(); }
  createElement(tag) { return new FakeElement(this, tag); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) { if (this.listeners.get(type) === listener) this.listeners.delete(type); }
}

class FakeElement {
  constructor(ownerDocument, tag) {
    this.ownerDocument = ownerDocument;
    this.tagName = tag.toUpperCase();
    this.style = {};
    this.listeners = new Map();
    this.children = [];
    this.value = "";
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.selectionDirection = "none";
    this.disabled = false;
    this.captures = [];
    this.releases = [];
    this.blurEvents = 0;
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type, listener) { if (this.listeners.get(type) === listener) this.listeners.delete(type); }
  emit(type, init = {}) {
    const event = { target: this, preventDefault() { this.defaultPrevented = true; }, ...init };
    this.listeners.get(type)?.(event);
    return event;
  }
  appendChild(child) { this.children.push(child); child.parentNode = this; }
  remove() {
    if (this.ownerDocument.activeElement === this) {
      this.blurEvents += 1;
      this.ownerDocument.activeElement = null;
      this.emit("blur");
    }
    const index = this.parentNode?.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
  }
  focus(options) { this.focusOptions = options; this.ownerDocument.activeElement = this; this.emit("focus"); }
  setSelectionRange(start, end, direction = "none") { this.selectionStart = start; this.selectionEnd = end; this.selectionDirection = direction; }
  setPointerCapture(pointerId) { this.captures.push(pointerId); }
  releasePointerCapture(pointerId) { this.releases.push(pointerId); }
  setAttribute(name, value) { this[name] = String(value); }
}
