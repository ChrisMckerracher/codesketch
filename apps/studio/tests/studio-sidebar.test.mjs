import test from "node:test";
import assert from "node:assert/strict";

import { renderSidebar } from "../src/studio/workspace/sidebar/index.mjs";
import { createControls } from "../src/studio/workspace/controls/index.mjs";

function render(layers, options = {}) {
  const vector = spyVector();
  const controls = renderSidebar({
    ctx: context(),
    v: vector,
    model: {
      snapshot: Object.hasOwn(options, "snapshot") ? options.snapshot : { document: { layers } },
      targetLayer: options.targetLayer ?? null,
      draft: options.draft ?? null,
      pending: options.pending ?? [],
      connection: options.connection ?? "online",
    },
    ui: {
      collapsed: false,
      layerScroll: options.layerScroll ?? 0,
      layerEdit: options.layerEdit ?? null,
      saved: options.saved ?? false,
    },
  });
  return { controls, vector };
}

function layer(id, name = id, opacity = 1) {
  return { id, name, opacity, visible: true };
}

test("layers use canonical numbers, stable IDs, and real layer payloads", () => {
  const layers = [layer("base-id", "Base"), layer("middle-id", "Middle"), layer("top-id", "Top", 0.5)];
  const { controls, vector } = render(layers, { targetLayer: "top-id" });
  const selects = controls.filter((item) => item.action === "layer.select");
  const opacity = controls.find((item) => item.action === "layer.opacity");
  const numbers = vector.texts.filter(([text, x]) => x === 756 && /^\d{2}$/.test(text)).map(([text]) => text);

  assert.deepEqual(selects.map((item) => [item.id, item.payload.id]), [
    ["layer.top-id.select", "top-id"],
    ["layer.middle-id.select", "middle-id"],
    ["layer.base-id.select", "base-id"],
  ]);
  assert.deepEqual(numbers, ["02", "01", "00"]);
  assert.deepEqual(
    { id: opacity.id, payload: opacity.payload, value: opacity.value },
    { id: "layer.top-id.opacity", payload: { id: "top-id" }, value: 50 },
  );
  assert.ok(controls.some((item) => item.action === "tool.select"));
  assert.ok(controls.some((item) => item.action === "tool.properties"));
  assert.ok(controls.some((item) => item.action === "pigment.select"));
  assert.ok(controls.some((item) => item.action === "layer.add"));
});

test("numeric tokens suppress only the separate ordinal while names stay canonical", () => {
  const layers = [layer("line", "03 LINEART"), layer("plain", "Layer 4"), layer("word", "VersionX")];
  const { controls, vector } = render(layers, { targetLayer: "word" });
  const gutters = vector.texts.filter(([text, x]) => x === 756 && /^\d{2}$/.test(text)).map(([text]) => text);
  assert.deepEqual(gutters, ["02"]);
  assert.deepEqual(controls.filter((item) => item.action === "layer.rename.begin").map((item) => item.payload), [
    { id: "word", value: "VersionX" },
    { id: "plain", value: "Layer 4" },
    { id: "line", value: "03 LINEART" },
  ]);
});

test("layer name controls are separate from row selection and independent eye controls", () => {
  const { controls } = render([layer("paint", "Paint")]);
  const row = controls.find((item) => item.action === "layer.select");
  const name = controls.find((item) => item.action === "layer.rename.begin");
  const eye = controls.find((item) => item.action === "layer.visibility");
  assert.equal(row.id, "layer.paint.select");
  assert.equal(name.id, "layer.paint.name");
  assert.equal(eye.id, "layer.paint.visibility");
  assert.equal(row.label, "Select Paint");
  assert.equal(name.label, "Paint");
  assert.ok(name.x > row.x && name.x + name.width < eye.x);
});

test("inline textbox carries the complete local draft while retaining canonical identity", () => {
  const { controls } = render([layer("paint", "Canonical name")], {
    targetLayer: "paint",
    layerEdit: { id: "paint", token: 4, revision: 2, text: "  local draft  " },
  });
  const editor = controls.find((item) => item.action === "layer.rename");
  assert.equal(editor.payload.id, "paint");
  assert.equal(editor.value, "  local draft  ");
  assert.equal(editor.width, 144);
});

test("layer row, eye, and range hitboxes stay inside the viewport", () => {
  const layers = Array.from({ length: 12 }, (_, index) => layer(`layer-${index}`));
  const { controls, vector } = render(layers, { targetLayer: "layer-11", layerScroll: 25 });
  const layerControls = controls.filter((item) => ["layer.select", "layer.visibility", "layer.opacity"].includes(item.action));

  assert.equal(controls.find((item) => item.action === "layer.select").y, 272);
  for (const item of layerControls) {
    assert.ok(item.y >= 272, `${item.id} starts above the layer viewport`);
    assert.ok(item.y + item.height <= 472, `${item.id} extends below the layer viewport`);
  }

  const scrollbar = controls.find((item) => item.action === "layers.scroll");
  assert.deepEqual(
    { x: scrollbar.x, y: scrollbar.y, width: scrollbar.width, height: scrollbar.height },
    { x: 980, y: 276, width: 20, height: 192 },
  );
  assert.ok(vector.strokes.some(([points]) => points[0][0] === 994));
});

test("layer scrollbar maps a fixed-x vertical drag across its painted track", () => {
  const layers = Array.from({ length: 12 }, (_, index) => layer(`layer-${index}`));
  const scrollbar = render(layers).controls.find((item) => item.action === "layers.scroll");
  assert.equal(scrollbar.axis, "y");
  assert.deepEqual(scrollbar.track, { x: 994, y: 276, width: 0, height: 192 });

  const calls = [];
  const document = new FakeDocument();
  const root = document.createElement("div");
  const fields = createControls({
    root,
    dispatch: (action, value) => calls.push([action, value]),
    point: (event) => event.raw,
    vector: controlVector(),
  });
  fields.update([scrollbar]);
  const input = root.children[0];
  input.emit("pointerdown", { pointerId: 1, raw: [994, 276] });
  input.emit("pointermove", { pointerId: 1, raw: [994, 372] });
  input.emit("pointermove", { pointerId: 1, raw: [994, 468] });
  input.emit("pointerup", { pointerId: 1, raw: [994, 468] });

  assert.deepEqual(calls.map(([, value]) => value.value), [0, 80, 160]);
  fields.destroy();
});

test("brush ranges map visible track endpoints to their bounds", () => {
  const sliders = render([]).controls.filter((item) => item.action === "tool.properties");
  assert.deepEqual(sliders.map((item) => item.track), [
    { x: 756, width: 228 },
    { x: 756, width: 228 },
    { x: 756, width: 228 },
  ]);

  const calls = [];
  const document = new FakeDocument();
  const root = document.createElement("div");
  const fields = createControls({
    root,
    dispatch: (action, value) => calls.push([action, value]),
    point: (event) => event.raw,
    vector: controlVector(),
  });
  fields.update(sliders);
  sliders.forEach((slider, index) => {
    const input = root.children[index];
    const pointerId = index + 1;
    input.emit("pointerdown", { pointerId, raw: [756, slider.y] });
    input.emit("pointermove", { pointerId, raw: [984, slider.y] });
    input.emit("pointerup", { pointerId, raw: [984, slider.y] });
  });

  assert.deepEqual(calls.map(([, value]) => ({ property: value.property, value: value.value })), [
    { property: "size", value: 1 },
    { property: "size", value: 100 },
    { property: "opacity", value: 1 },
    { property: "opacity", value: 100 },
    { property: "smoothing", value: 0 },
    { property: "smoothing", value: 100 },
  ]);
  fields.destroy();
});

test("maximum scroll places the last canonical row at the viewport edge", () => {
  const layers = Array.from({ length: 12 }, (_, index) => layer(`layer-${index}`));
  const maxScroll = layers.length * 30 - 200;
  const { controls } = render(layers, { layerScroll: maxScroll });
  const last = controls.find((item) => item.action === "layer.select" && item.payload.id === "layer-0");

  assert.ok(last);
  assert.equal(last.y + last.height, 472);
});

test("save is disabled for pending, offline, or unsynchronized state", () => {
  const states = [
    { pending: ["stroke.commit"] },
    { connection: "offline" },
    { connection: "connecting" },
    { connection: "uncertain" },
    { snapshot: null },
    { draft: { kind: "stroke" }, pending: [] },
  ];

  for (const state of states) {
    const { controls } = render([], { ...state, saved: true });
    assert.equal(controls.find((item) => item.id === "sidebar.save").disabled, true);
  }
  assert.equal(render([], { saved: true }).controls.find((item) => item.id === "sidebar.save").disabled, false);
});

class FakeDocument {
  constructor() {
    this.activeElement = null;
    this.listeners = new Map();
  }

  createElement(tag) {
    return new FakeElement(this, tag);
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }
}

class FakeElement {
  constructor(ownerDocument, tag) {
    this.ownerDocument = ownerDocument;
    this.tagName = tag.toUpperCase();
    this.style = {};
    this.listeners = new Map();
    this.children = [];
    this.value = "";
    this.disabled = false;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  emit(type, init = {}) {
    const event = { target: this, preventDefault() {}, ...init };
    this.listeners.get(type)?.(event);
    return event;
  }

  appendChild(child) {
    this.children.push(child);
    child.parentNode = this;
  }

  remove() {
    const index = this.parentNode?.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  setAttribute() {}

  setPointerCapture() {}

  releasePointerCapture() {}
}

function controlVector() {
  return {
    layout(text) {
      return { cells: [], lines: [String(text)], width: 0, height: 11, lineHeight: 11 };
    },
    measure(text) {
      return String(text).length * 8;
    },
  };
}

function context() {
  return {
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
  };
}

function spyVector() {
  return {
    texts: [],
    strokes: [],
    rect() {},
    roundRect() {},
    ellipse() {},
    stroke(...args) { this.strokes.push(args); },
    text(...args) { this.texts.push(args); },
    measure(text, scale = 1) { return String(text).length * 8 * scale; },
  };
}
