import test from "node:test";
import assert from "node:assert/strict";
import { createLayerActions } from "../src/studio/workspace/actions/layers.mjs";

function harness() {
  let value = { snapshot: snapshot("a", "g1", [
    { id: "paint", name: "Paint", visible: true, opacity: 1 },
    { id: "wash", name: "Wash", visible: true, opacity: 1 },
  ]) };
  const listeners = new Set();
  const calls = [];
  const pending = [];
  const application = {
    model: { get: () => value, subscribe: (listener) => (listeners.add(listener), () => listeners.delete(listener)) },
    dispatch(intent) {
      calls.push(intent);
      if (intent.type === "layer.inspect") return Promise.resolve(intent);
      return new Promise((resolve, reject) => pending.push({ intent, resolve, reject }));
    },
  };
  return {
    application, calls, pending, rotate(instanceId, generation, layers = value.snapshot.document.layers) {
      value = { snapshot: snapshot(instanceId, generation, layers) };
      for (const listener of listeners) listener(value);
    },
    accept(result = value.snapshot) { pending.shift().resolve(result); },
  };
}

function snapshot(instanceId, docGeneration, layers) {
  return { instanceId, docGeneration, revision: 1, document: { layers } };
}

test("coalesces waiting opacity values and preserves mutation order by layer", async () => {
  const h = harness();
  const actions = createLayerActions({ application: h.application });
  const first = actions.handle("layer.opacity", { id: "paint", value: 90 });
  const second = actions.handle("layer.opacity", { id: "paint", value: 80 });
  const third = actions.handle("layer.opacity", { id: "paint", value: 50 });
  const other = actions.handle("layer.visibility", { id: "wash", visible: false });
  assert.deepEqual(h.calls.map((call) => call.opacity ?? call.visible), [0.9]);
  h.accept();
  await first;
  await Promise.resolve();
  assert.deepEqual(h.calls.map((call) => call.opacity ?? call.visible), [0.9, 0.5]);
  h.accept();
  await Promise.all([second, third]);
  await Promise.resolve();
  assert.deepEqual(h.calls.map((call) => call.opacity ?? call.visible), [0.9, 0.5, false]);
  h.accept();
  await other;
});

test("drops waiting work on rotation and surfaces failed writes", async () => {
  const h = harness();
  const actions = createLayerActions({ application: h.application });
  const first = actions.handle("layer.visibility", { id: "paint", visible: false });
  const waiting = actions.handle("layer.opacity", { id: "paint", value: 20 });
  h.rotate("b", "g2");
  await assert.rejects(waiting, { outcome: "stale" });
  h.pending[0].reject(new Error("write failed"));
  await assert.rejects(first, /write failed/);
});

test("adds a sequentially named layer, resets scroll, and selects its actual id", async () => {
  const h = harness();
  const ui = { layerScroll: 42 };
  const actions = createLayerActions({ application: h.application, ui });
  const layers = [...h.application.model.get().snapshot.document.layers, { id: "server-id", name: "Layer 2" }];
  const added = actions.handle("layer.add");
  assert.equal(h.calls[0].name, "Layer 3");
  h.rotate("a", "g1", layers);
  h.accept(snapshot("a", "g1", layers));
  await added;
  assert.equal(ui.layerScroll, 0);
  assert.deepEqual(h.calls.at(-1), { type: "layer.inspect", id: "server-id" });
  assert.equal(actions.handle("other.action"), false);
});

test("rejects an unchanged add acknowledgement and continues the mutation queue", async () => {
  const h = harness();
  const actions = createLayerActions({ application: h.application });
  const added = actions.handle("layer.add");
  h.accept();
  await assert.rejects(added, { outcome: "uncertain" });
  const opacity = actions.handle("layer.opacity", { id: "paint", value: 40 });
  assert.equal(h.calls.at(-1).type, "layer.update");
  h.accept();
  await opacity;
});

test("renames a layer through one fenced layer.update and preserves the submitted name", async () => {
  const h = harness();
  const actions = createLayerActions({ application: h.application });
  const renamed = actions.handle("layer.rename", { id: "paint", value: "  Numbered Layer 2  " });
  assert.deepEqual(h.calls[0], {
    type: "layer.update", id: "paint", name: "Numbered Layer 2", generation: "g1",
  });
  h.accept();
  await renamed;
});

test("rejects invalid names and does not dispatch or add history", async () => {
  const h = harness();
  const actions = createLayerActions({ application: h.application });
  for (const value of ["", "   ", "x".repeat(81), 42]) {
    await assert.rejects(actions.handle("layer.rename", { id: "paint", value }), /Layer name/);
  }
  await actions.handle("layer.rename", { id: "paint", value: "Paint" });
  assert.deepEqual(h.calls, []);
});

test("drops queued renames when the document generation rotates", async () => {
  const h = harness();
  const actions = createLayerActions({ application: h.application });
  const first = actions.handle("layer.rename", { id: "paint", value: "First" });
  const waiting = actions.handle("layer.rename", { id: "wash", value: "Second" });
  h.rotate("b", "g2");
  await assert.rejects(waiting, { outcome: "stale" });
  h.pending[0].resolve();
  await assert.rejects(first, { outcome: "stale" });
  assert.equal(h.calls.length, 1);
});

test("starts and cancels an inline edit without submitting a rename", async () => {
  const h = harness();
  const ui = {};
  const actions = createLayerActions({ application: h.application, ui });
  await actions.handle("layer.rename.begin", { id: "paint" });
  assert.equal(ui.layerEdit.id, "paint");
  assert.equal(ui.layerEdit.value, "Paint");
  assert.equal(ui.layerEdit.text, "Paint");
  await actions.handle("layer.rename.cancel", { id: "paint" });
  assert.equal(ui.layerEdit, null);
  assert.deepEqual(h.calls, [{ type: "layer.inspect", id: "paint" }]);
});

test("keeps local rename drafts separate from canonical values", async () => {
  const h = harness();
  const ui = {};
  const actions = createLayerActions({ application: h.application, ui });
  await actions.handle("layer.rename.begin", { id: "paint" });
  await actions.handle("layer.rename.text", { id: "paint", token: ui.layerEdit.token, revision: 1, value: "Draft" });
  assert.deepEqual(ui.layerEdit, { id: "paint", value: "Paint", text: "Draft", token: 1, revision: 1 });
  assert.deepEqual(h.calls, [{ type: "layer.inspect", id: "paint" }]);
});

test("defers switching editors until a blur save succeeds and preserves A on failure", async () => {
  const h = harness();
  const ui = {};
  const actions = createLayerActions({ application: h.application, ui });
  await actions.handle("layer.rename.begin", { id: "paint" });
  const token = ui.layerEdit.token;
  await actions.handle("layer.rename.text", { id: "paint", token, value: "Draft A" });
  const save = actions.handle("layer.rename", {
    id: "paint", token, revision: ui.layerEdit.revision, value: "Draft A",
  });
  const switchEditor = actions.handle("layer.rename.begin", { id: "wash" });
  assert.equal(h.calls.length, 2, "switch does not inspect B while A is pending");
  h.pending[0].reject(new Error("save failed"));
  await assert.rejects(save, /save failed/);
  await assert.rejects(switchEditor, /save failed/);
  assert.equal(ui.layerEdit.id, "paint");
  assert.equal(ui.layerEdit.text, "Draft A");
});

test("does not let an old ACK close a newer draft after text moves away and back", async () => {
  const h = harness();
  const ui = {};
  const actions = createLayerActions({ application: h.application, ui });
  await actions.handle("layer.rename.begin", { id: "paint" });
  const token = ui.layerEdit.token;
  await actions.handle("layer.rename.text", { id: "paint", token, value: "Draft" });
  const revision = ui.layerEdit.revision;
  const save = actions.handle("layer.rename", { id: "paint", token, revision, value: "Draft" });
  await actions.handle("layer.rename.text", { id: "paint", token, value: "Other" });
  await actions.handle("layer.rename.text", { id: "paint", token, value: "Draft" });
  h.pending[0].resolve();
  await save;
  assert.equal(ui.layerEdit.text, "Draft");
  assert.equal(ui.layerEdit.revision, revision + 2);
});

test("commit captures the current revision after a composition flush", async () => {
  const h = harness();
  const ui = {};
  const actions = createLayerActions({ application: h.application, ui });
  await actions.handle("layer.rename.begin", { id: "paint" });
  const token = ui.layerEdit.token;
  await actions.handle("layer.rename.text", { id: "paint", token, value: "Draft" });
  const currentRevision = ui.layerEdit.revision;
  const rename = actions.handle("layer.rename", {
    id: "paint", token, revision: currentRevision - 1, value: "Draft",
  });
  h.accept();
  await rename;
  assert.equal(ui.layerEdit, null);
});

test("raw-space rename closes the matching editor after canonical trim", async () => {
  const h = harness();
  const ui = {};
  const actions = createLayerActions({ application: h.application, ui });
  await actions.handle("layer.rename.begin", { id: "paint" });
  const raw = "  Fresh name  ";
  await actions.handle("layer.rename.text", { id: "paint", token: ui.layerEdit.token, value: raw });
  const rename = actions.handle("layer.rename", {
    id: "paint", token: ui.layerEdit.token, revision: ui.layerEdit.revision, value: raw,
  });
  h.accept();
  await rename;
  assert.equal(ui.layerEdit, null);
});

test("a no-op inline rename closes without dispatching history", async () => {
  const h = harness();
  const ui = {};
  const actions = createLayerActions({ application: h.application, ui });
  await actions.handle("layer.rename.begin", { id: "paint" });
  const result = await actions.handle("layer.rename", {
    id: "paint", token: ui.layerEdit.token, revision: ui.layerEdit.revision, value: "Paint",
  });
  assert.deepEqual(result, { unchanged: true });
  assert.equal(ui.layerEdit, null);
  assert.deepEqual(h.calls, [{ type: "layer.inspect", id: "paint" }]);
});

test("a flushed no-op rename closes when its submitted revision is older", async () => {
  const h = harness();
  const ui = {};
  const actions = createLayerActions({ application: h.application, ui });
  await actions.handle("layer.rename.begin", { id: "paint" });
  const token = ui.layerEdit.token;
  await actions.handle("layer.rename.text", { id: "paint", token, value: " Paint " });
  await actions.handle("layer.rename", { id: "paint", token, revision: 0, value: " Paint " });
  assert.equal(ui.layerEdit, null);
  assert.deepEqual(h.calls, [{ type: "layer.inspect", id: "paint" }]);
});

test("rotation cancels an inline edit and rejects its queued rename", async () => {
  const h = harness();
  const ui = {};
  const actions = createLayerActions({ application: h.application, ui });
  await actions.handle("layer.rename.begin", { id: "paint" });
  const rename = actions.handle("layer.rename", { id: "paint", value: "Draft" });
  h.rotate("b", "g2");
  assert.equal(ui.layerEdit, null);
  h.pending[0].resolve();
  await assert.rejects(rename, { outcome: "stale" });
});

test("generation rotation clears drafts even after the editor has closed", async () => {
  const h = harness();
  const ui = {};
  const actions = createLayerActions({ application: h.application, ui });
  await actions.handle("layer.rename.begin", { id: "paint" });
  await actions.handle("layer.rename.text", { id: "paint", token: ui.layerEdit.token, value: "Retained" });
  const save = actions.handle("layer.rename", {
    id: "paint", token: ui.layerEdit.token, revision: ui.layerEdit.revision, value: "Retained",
  });
  await actions.handle("layer.rename.text", { id: "paint", token: ui.layerEdit.token, value: "Newer" });
  h.accept();
  await save;
  await actions.handle("layer.rename.begin", { id: "wash" });
  await actions.handle("layer.rename.cancel", { id: "wash" });
  h.rotate("b", "g2");
  await actions.handle("layer.rename.begin", { id: "paint" });
  assert.equal(ui.layerEdit.text, "Paint");
});
