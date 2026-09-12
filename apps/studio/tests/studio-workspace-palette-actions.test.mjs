import test from "node:test";
import assert from "node:assert/strict";
import { hexToHsv, hsvToHex } from "../src/studio/workspace/palette/index.mjs";
import { createPaletteActions } from "../src/studio/workspace/actions/palette.mjs";

function harness(color = "#112233", recent = [], behavior = () => Promise.resolve("ok")) {
  const value = { color };
  const ui = { picker: {
    open: false, hue: 0, saturation: 0, value: 0, color: "#000000",
    recent: [...recent], picking: false, point: null,
  } };
  const calls = [];
  return {
    value, ui, calls,
    application: { model: { get: () => value }, dispatch(intent) { calls.push(intent); return behavior(intent); } },
  };
}

test("returns false only for unrelated actions and rejects recognized actions after destroy", async () => {
  const h = harness();
  const actions = createPaletteActions(h);
  assert.equal(actions.handle("unrelated.action"), false);
  for (const action of ["pigment.open", "pigment.close", "pigment.sv", "pigment.hue", "pigment.pick", "pigment.recent"]) {
    const payload = action === "pigment.sv" ? { value: { x: 0.2, y: 0.3 } }
      : action === "pigment.hue" ? { value: 120 } : action === "pigment.recent" ? { color: "#abcdef" } : {};
    assert.ok(actions.handle(action, payload) instanceof Promise, action);
  }
  actions.destroy();
  await assert.rejects(actions.handle("pigment.apply"), { outcome: "stale" });
  assert.equal(actions.handle("unrelated.action"), false);
});

test("select dispatches immediately and open copies the actual model color into preview", async () => {
  const h = harness("#336699", ["#abcdef"]);
  const actions = createPaletteActions(h);
  await actions.handle("pigment.select", { color: "#ABCDEF" });
  assert.deepEqual(h.calls, [{ type: "tool.properties", color: "#abcdef" }]);
  assert.equal(h.ui.picker.color, "#abcdef");

  h.ui.picker.color = "#000000";
  h.ui.picker.hue = 0;
  await actions.handle("pigment.open");
  assert.equal(h.ui.picker.open, true);
  assert.deepEqual({ hue: h.ui.picker.hue, saturation: h.ui.picker.saturation, value: h.ui.picker.value }, hexToHsv("#336699"));
  assert.equal(h.ui.picker.color, "#336699");
  assert.deepEqual(h.ui.picker.recent, ["#abcdef"]);
});

test("SV, hue, pick, recent, and close update only the canonical preview", async () => {
  const h = harness();
  const actions = createPaletteActions(h);
  await actions.handle("pigment.sv", { value: { x: 0.4, y: 0.25 } });
  await actions.handle("pigment.hue", { value: 180 });
  assert.equal(h.ui.picker.color, hsvToHex(180, 0.4, 0.75));
  await actions.handle("pigment.pick");
  assert.equal(h.ui.picker.picking, true);
  await actions.handle("pigment.recent", { color: "#ABCDEF" });
  assert.equal(h.calls.length, 0);
  assert.equal(h.ui.picker.color, "#abcdef");
  assert.deepEqual({ hue: h.ui.picker.hue, saturation: h.ui.picker.saturation, value: h.ui.picker.value }, hexToHsv("#abcdef"));
  await actions.handle("pigment.close");
  assert.equal(h.ui.picker.open, false);
  assert.equal(h.ui.picker.picking, false);
  assert.equal(h.ui.picker.point, null);
});

test("apply derives color from HSV and commits recents only after success", async () => {
  const recent = ["#abcdef", "#123456", "#654321", "#111111", "#222222", "#333333"];
  const h = harness("#112233", recent);
  Object.assign(h.ui.picker, { open: true, hue: 120, saturation: 1, value: 1, color: "#ffffff", picking: true, point: [3, 4] });
  const actions = createPaletteActions(h);
  await actions.handle("pigment.apply");
  assert.deepEqual(h.calls, [{ type: "tool.properties", color: "#00ff00" }]);
  assert.equal(h.ui.picker.color, "#00ff00");
  assert.deepEqual(h.ui.picker.recent, ["#00ff00", "#abcdef", "#123456", "#654321", "#111111", "#222222"]);
  assert.equal(h.ui.picker.open, false);
  assert.equal(h.ui.picker.picking, false);
  assert.equal(h.ui.picker.point, null);
});

test("failed apply rejects and retains the complete HSV preview", async () => {
  const h = harness("#112233", ["#abcdef"], () => Promise.reject(new Error("write failed")));
  Object.assign(h.ui.picker, { open: true, hue: 240, saturation: 0.5, value: 0.25, color: "#123456", picking: true, point: [8, 9] });
  const before = structuredClone(h.ui.picker);
  const actions = createPaletteActions(h);
  await assert.rejects(actions.handle("pigment.apply"), /write failed/);
  assert.deepEqual(h.ui.picker, before);
});
