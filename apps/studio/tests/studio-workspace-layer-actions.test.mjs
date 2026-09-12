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
