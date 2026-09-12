import test from "node:test";
import assert from "node:assert/strict";

import { createWorkspaceInput } from "../src/studio/workspace/input/index.mjs";

class Target {
  constructor(withWindow = true) { this.listeners = new Map(); this.ownerDocument = withWindow ? { defaultView: new TargetWindow() } : null; }
  addEventListener(type, listener) { const list = this.listeners.get(type) ?? []; list.push(listener); this.listeners.set(type, list); }
  removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== listener)); }
  emit(type, init = {}) {
    const event = {
      target: this, preventDefault() { this.defaultPrevented = true; },
      stopImmediatePropagation() { this.immediateStopped = true; },
      stopPropagation() { this.propagationStopped = true; }, ...init,
    };
    for (const listener of [...(this.listeners.get(type) ?? [])]) { listener(event); if (event.immediateStopped) break; }
    return event;
  }
  setPointerCapture(id) { this.captured = id; }
  releasePointerCapture(id) { if (this.captured === id) this.captured = null; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 700 }; }
}

class TargetWindow extends Target {
  constructor() { super(false); }
}

function event(x, y, pointerId = 1, extra = {}) {
  return { button: 0, pointerId, x, y, ...extra };
}

function harness({ rect = null, collapsed = false, picker = null, controls = [], thread = null, threadScroll = {}, phase = "selecting", feedbackOpen = true } = {}) {
  const root = new Target();
  const canvas = new Target();
  const value = { review: { phase, rect } };
  const model = { get: () => value };
  const ui = { feedbackOpen, collapsed, picker, threadScroll };
  const calls = [];
  const input = createWorkspaceInput({
    root, canvas, model, ui, artwork: null,
    point: (value) => [value.x, value.y],
    getControls: () => controls,
    getBlockedRects: () => [],
    getThreadViewport: () => thread,
    dispatch: (action, payload) => { calls.push({ action, payload }); return Promise.resolve(); },
  });
  return { root, canvas, model, ui, calls, input };
}

function drag(h, start, end, pointerId = 1) {
  h.root.emit("pointerdown", event(...start, pointerId));
  h.root.emit("pointermove", event(...end, pointerId));
  h.root.emit("pointerup", event(...end, pointerId));
}

test("input requires the application model getter and root point mapper", () => {
  const root = new Target();
  const canvas = new Target();
  assert.throws(() => createWorkspaceInput({ root, canvas, model: {}, point: () => [0, 0] }), /model\.get/);
  assert.throws(() => createWorkspaceInput({ root, canvas, model: { get: () => ({}) } }), /model\.get.*point/);
});

test("new selection clamps a start in the expanded sidebar margin and keeps integer bounds", () => {
  const h = harness();
  drag(h, [800, 100], [700, 200]);
  assert.deepEqual(h.calls[0], { action: "review.rect", payload: { rect: { x: 700, y: 100, width: 40, height: 100 } } });
  h.input.destroy();
});

test("selection can leave and re-enter the visible art without losing the drag", () => {
  const h = harness();
  h.root.emit("pointerdown", event(700, 100));
  h.root.emit("pointermove", event(800, 200));
  h.root.emit("pointermove", event(720, 180));
  h.root.emit("pointerup", event(720, 180));
  assert.deepEqual(h.calls[0].payload.rect, { x: 700, y: 100, width: 20, height: 80 });
  h.input.destroy();
});

test("existing draft moves with its dimensions and corner handles resize across the opposite corner", () => {
  const moved = harness({ rect: { x: 100, y: 100, width: 200, height: 100 } });
  drag(moved, [150, 150], [300, 300]);
  assert.deepEqual(moved.calls[0].payload.rect, { x: 250, y: 250, width: 200, height: 100 });
  moved.input.destroy();

  const resized = harness({ rect: { x: 100, y: 100, width: 200, height: 100 } });
  drag(resized, [300, 200], [400, 300]);
  assert.deepEqual(resized.calls[0].payload.rect, { x: 100, y: 100, width: 300, height: 200 });
  resized.input.destroy();
});

test("resizing repeatedly uses the original opposite corner after crossing and returning", () => {
  const h = harness({ rect: { x: 100, y: 100, width: 200, height: 100 } });
  h.root.emit("pointerdown", event(300, 200));
  h.root.emit("pointermove", event(400, 300));
  h.root.emit("pointermove", event(50, 50));
  h.root.emit("pointermove", event(250, 150));
  h.root.emit("pointerup", event(250, 150));
  assert.deepEqual(h.calls[0].payload.rect, { x: 100, y: 100, width: 150, height: 50 });
  h.input.destroy();
});

test("resizing at the exact opposite corner keeps a one-unit preview before crossing", () => {
  const h = harness({ rect: { x: 100, y: 100, width: 200, height: 100 } });
  h.root.emit("pointerdown", event(300, 200));
  h.root.emit("pointermove", event(100, 100));
  assert.deepEqual(h.ui.selection, { x: 100, y: 100, width: 1, height: 1 });
  h.root.emit("pointermove", event(90, 90));
  assert.deepEqual(h.ui.selection, { x: 90, y: 90, width: 10, height: 10 });
  h.root.emit("pointermove", event(250, 150));
  assert.deepEqual(h.ui.selection, { x: 100, y: 100, width: 150, height: 50 });
  h.root.emit("pointerup", event(250, 150));
  assert.deepEqual(h.calls[0].payload.rect, { x: 100, y: 100, width: 150, height: 50 });
  h.input.destroy();
});

test("a second pointer is rejected while the first review pointer owns capture", () => {
  const h = harness();
  h.root.emit("pointerdown", event(10, 10, 1));
  h.root.emit("pointerdown", event(20, 20, 2));
  h.root.emit("pointermove", event(40, 40, 2));
  h.root.emit("pointerup", event(30, 30, 1));
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0].payload.rect, { x: 10, y: 10, width: 20, height: 20 });
  h.input.destroy();
});

test("descriptor hit areas exclude controls from review selection", () => {
  const h = harness({ controls: [{ x: 100, y: 100, width: 80, height: 30 }] });
  drag(h, [120, 110], [200, 200]);
  assert.equal(h.calls.length, 0);
  h.input.destroy();
});

test("window capture starts an outside-art drag but leaves semantic controls untouched", () => {
  const h = harness();
  const outside = h.root.ownerDocument.defaultView.emit("pointerdown", event(1200, -50));
  h.root.emit("pointermove", event(-50, 800));
  h.root.emit("pointerup", event(-50, 800));
  assert.equal(outside.defaultPrevented, true);
  assert.deepEqual(h.calls[0].payload.rect, { x: 0, y: 0, width: 740, height: 700 });
  h.input.destroy();

  const control = harness({ controls: [{ x: 100, y: 100, width: 80, height: 30 }] });
  const button = control.root.ownerDocument.defaultView.emit(
    "pointerdown", event(120, 110, 1, { target: { tagName: "BUTTON" } }),
  );
  assert.equal(button.defaultPrevented, undefined);
  assert.equal(control.root.captured, undefined);
  assert.equal(control.calls.length, 0);
  control.input.destroy();
});

test("picker samples artwork and consumes the click before painting", () => {
  const h = harness({ picker: { picking: true, open: true } });
  let painted = 0;
  h.canvas.addEventListener("pointerdown", () => { painted += 1; });
  const artwork = { width: 1000, height: 700, getContext: () => ({ getImageData: () => ({ data: [255, 0, 128, 255] }) }) };
  h.input.destroy();
  const input = createWorkspaceInput({ root: h.root, canvas: h.canvas, model: h.model, ui: h.ui, artwork,
    point: (value) => [value.x, value.y], getControls: () => [], getBlockedRects: () => [],
    getThreadViewport: () => null, dispatch: () => Promise.resolve() });
  h.root.emit("pointermove", event(800, 40));
  assert.deepEqual(h.ui.picker.point, [740, 40]);
  h.root.emit("pointerdown", event(30, 40));
  h.root.emit("pointerup", event(30, 40));
  assert.equal(painted, 0);
  assert.equal(h.ui.picker.picking, false);
  assert.equal(h.ui.picker.color, "#ff0080");
  input.destroy();
});

test("wheel routes panel scrolling with normalized deltas and prevents page scrolling", () => {
  const h = harness();
  const layerEvent = h.root.emit("wheel", { x: 800, y: 300, deltaY: 2, deltaMode: 1 });
  const commentEvent = h.root.emit("wheel", { x: 800, y: 550, deltaY: -4, deltaMode: 0 });
  assert.equal(layerEvent.defaultPrevented, true);
  assert.equal(commentEvent.defaultPrevented, true);
  assert.deepEqual(h.calls.map(({ action, payload }) => [action, payload]), [
    ["layers.scroll", { deltaY: 32 }],
    ["comments.scroll", { deltaY: -4 }],
  ]);
  h.input.destroy();
});

test("panel wheel routes over mounted buttons but preserves native textarea scrolling", () => {
  const h = harness({ controls: [
    { x: 740, y: 272, width: 80, height: 30 },
    { x: 740, y: 514, width: 80, height: 30 },
  ] });
  const button = { tagName: "BUTTON" };
  const layerEvent = h.root.emit("wheel", { x: 800, y: 300, deltaY: 3, deltaMode: 0, target: button });
  const commentEvent = h.root.emit("wheel", { x: 800, y: 550, deltaY: 4, deltaMode: 0, target: button });
  const textareaEvent = h.root.emit("wheel", {
    x: 800, y: 550, deltaY: 9, deltaMode: 0, target: { tagName: "TEXTAREA" },
  });
  assert.equal(layerEvent.defaultPrevented, true);
  assert.equal(commentEvent.defaultPrevented, true);
  assert.equal(textareaEvent.defaultPrevented, undefined);
  assert.deepEqual(h.calls.map(({ action }) => action), ["layers.scroll", "comments.scroll"]);
  h.input.destroy();
});

test("thread wheel routing takes priority, clamps to maxScroll, and respects collapsed sidebars", () => {
  const h = harness({ thread: { id: "selected", x: 750, y: 300, width: 100, height: 50, maxScroll: 24 }, threadScroll: { selected: 10 } });
  const threadEvent = h.root.emit("wheel", { x: 800, y: 320, deltaY: 5, deltaMode: 0 });
  assert.equal(threadEvent.defaultPrevented, true);
  assert.deepEqual(h.calls[0], {
    action: "comments.thread.scroll", payload: { id: "selected", value: 15 },
  });
  h.root.emit("wheel", { x: 800, y: 320, deltaY: -100, deltaMode: 0 });
  assert.deepEqual(h.calls[1].payload, { id: "selected", value: 0 });
  h.input.destroy();

  const collapsed = harness({ collapsed: true });
  const sidebarEvent = collapsed.root.emit("wheel", { x: 800, y: 300, deltaY: 20, deltaMode: 0 });
  assert.equal(sidebarEvent.defaultPrevented, undefined);
  assert.equal(collapsed.calls.length, 0);
  collapsed.input.destroy();
});

test("Escape cancels feedback while a semantic button or textarea is focused", () => {
  const button = harness();
  const buttonEvent = button.root.emit("keydown", { key: "Escape", target: { tagName: "BUTTON" } });
  assert.equal(buttonEvent.defaultPrevented, true);
  assert.equal(button.ui.feedbackOpen, false);
  assert.deepEqual(button.calls[0], { action: "review.cancel", payload: {} });
  button.input.destroy();

  const composing = harness({ picker: { picking: true, open: true } });
  const composingEvent = composing.root.emit("keydown", {
    key: "Escape", isComposing: true, target: { tagName: "TEXTAREA" },
  });
  assert.equal(composingEvent.defaultPrevented, undefined);
  assert.equal(composing.ui.picker.open, true);
  assert.equal(composing.calls.length, 0);
  composing.input.destroy();
});

test("Escape belongs to inline editors marked with the cancel action attribute", () => {
  const h = harness({ picker: { picking: true, open: true } });
  const editor = { tagName: "TEXTAREA", getAttribute: (name) => name === "data-cancel-action" ? "layer.rename.cancel" : null };
  const escape = h.root.emit("keydown", { key: "Escape", target: editor });
  assert.equal(escape.defaultPrevented, undefined);
  assert.equal(h.ui.feedbackOpen, true);
  assert.equal(h.ui.picker.open, true);
  assert.equal(h.calls.length, 0);
  h.input.destroy();
});

test("Escape cancels a pending pause even when feedback is not open", () => {
  const h = harness({ phase: "pausing", feedbackOpen: false });
  const escape = h.root.emit("keydown", { key: "Escape", target: { tagName: "TEXTAREA" } });
  assert.equal(escape.defaultPrevented, true);
  assert.deepEqual(h.calls[0], { action: "review.cancel", payload: {} });
  h.input.destroy();
});
