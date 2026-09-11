import test from "node:test";
import assert from "node:assert/strict";
import { hexToHsv, hsvToHex, samplePixel, renderPalette } from "../src/studio/workspace/palette/index.mjs";

test("HSV conversion round-trips exact six-digit colors and clamps boundaries", () => {
  for (const color of ["#000000", "#ffffff", "#ff0000", "#38bdf8", "#abcdef"]) {
    assert.equal(hsvToHex(...Object.values(hexToHsv(color))), color);
  }
  assert.equal(hsvToHex(-20, 2, 2), "#ff0000");
  assert.equal(hsvToHex(360, 1, 1), "#ff0000");
  assert.equal(hsvToHex(120, -1, 1), "#ffffff");
  assert.equal(hsvToHex(240, 1, 0), "#000000");
});

test("samplePixel reads only the canonical artwork canvas and clamps coordinates", () => {
  const reads = [];
  const artwork = {
    width: 4,
    height: 3,
    getContext(kind) {
      assert.equal(kind, "2d");
      return { getImageData(x, y, width, height) {
        reads.push([x, y, width, height]);
        return { data: [0x38, 0xbd, 0xf8, 255] };
      } };
    },
  };
  assert.equal(samplePixel(artwork, -2, 8), "#38bdf8");
  assert.deepEqual(reads, [[0, 2, 1, 1]]);
});

test("open picker descriptors use fixed geometry, normalized values, and bounded recents", () => {
  const vector = spyVector();
  const controls = renderPalette({
    ctx: {},
    v: vector,
    model: { color: "#102030" },
    ui: { picker: {
      open: true, hue: 220, saturation: 0.84, value: 0.92,
      recent: ["#ABCDEF", "bad", "#112233", "#334455", "#556677", "#778899", "#AABBCC"],
      picking: false, point: null,
    } },
  });
  const plane = controls.find((descriptor) => descriptor.action === "pigment.sv");
  const hue = controls.find((descriptor) => descriptor.action === "pigment.hue");
  assert.deepEqual({ kind: plane.kind, x: plane.x, y: plane.y, width: plane.width, height: plane.height, value: plane.value },
    { kind: "plane", x: 486, y: 202, width: 228, height: 62, value: { x: 0.84, y: 0.08 } });
  assert.deepEqual({ kind: hue.kind, x: hue.x, y: hue.y, width: hue.width, height: hue.height, min: hue.min, max: hue.max, value: hue.value },
    { kind: "range", x: 486, y: 268, width: 228, height: 12, min: 0, max: 360, value: 220 });
  assert.deepEqual(controls.filter((descriptor) => descriptor.action === "pigment.recent").map((descriptor) => descriptor.payload.color),
    ["#abcdef", "#112233", "#334455", "#556677", "#778899", "#aabbcc"]);
  assert.deepEqual(controls.filter((descriptor) => ["pigment.pick", "pigment.apply", "pigment.close"].includes(descriptor.action))
    .map((descriptor) => descriptor.action), ["pigment.pick", "pigment.apply", "pigment.close"]);
});

test("hue gradient stops use the same HSV mapping as the hue control", () => {
  const ctx = gradientContext();
  renderPalette({
    ctx,
    v: spyVector(),
    model: { color: "#102030" },
    ui: { picker: { open: true, hue: 0, saturation: 1, value: 1, recent: [] } },
  });

  const hue = ctx.gradients.find((gradient) => gradient.args[0] === 486 && gradient.args[1] === 268);
  assert.deepEqual(hue.stops, [0, 60, 120, 180, 240, 300, 360].map((value, index) => [
    index / 6, hsvToHex(value, 1, 1),
  ]));
});

test("loupe samples artwork, draws a vector hex readout, and clips to visible workspace", () => {
  const calls = [];
  const ctx = {
    save() { calls.push("save"); },
    restore() { calls.push("restore"); },
    beginPath() {},
    rect(...args) { calls.push(["rect", ...args]); },
    clip() {},
    arc() {},
    drawImage(...args) { calls.push(["drawImage", ...args]); },
  };
  const artwork = {
    width: 1000,
    height: 700,
    getContext() { return { getImageData() { return { data: [0x38, 0xbd, 0xf8, 255] }; } }; },
  };
  const vector = spyVector();
  renderPalette({ ctx, v: vector, model: { color: "#000000" }, ui: {
    collapsed: false,
    picker: { open: false, hue: 0, saturation: 0, value: 0, recent: [], picking: true, point: [800, 100] },
  }, artwork });
  assert.deepEqual(calls.find((call) => call[0] === "rect"), ["rect", 0, 0, 740, 700]);
  assert.ok(calls.some((call) => call[0] === "drawImage" && call[1] === artwork));
  assert.ok(vector.texts.some((text) => text[0] === "#38BDF8"));
});

test("loupe keeps corner pixels centered and fills outside source regions", () => {
  const points = [[0, 0], [3, 0], [0, 3], [3, 3]];
  const imageCalls = [];
  const fillCalls = [];
  const reads = [];
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
    arc() {},
    fillRect(...args) { fillCalls.push(args); },
    drawImage(...args) { imageCalls.push(args); },
  };
  const artwork = {
    width: 4,
    height: 4,
    getContext() {
      return { getImageData(x, y) {
        reads.push([x, y]);
        return { data: [x === 0 ? 255 : 0, y === 0 ? 255 : 0, 0, 255] };
      } };
    },
  };

  for (const point of points) {
    renderPalette({ ctx, v: spyVector(), model: { color: "#000000" }, artwork,
      ui: { collapsed: true, picker: { picking: true, point } } });
  }

  assert.deepEqual(reads, points);
  assert.equal(fillCalls.length, points.length);
  assert.deepEqual(imageCalls.map((call) => call.slice(1, 9)), [
    [0, 0, 4, 4, -2, -2, 16, 16],
    [0, 0, 4, 4, -11, -2, 16, 16],
    [0, 0, 4, 4, -2, -11, 16, 16],
    [0, 0, 4, 4, -11, -11, 16, 16],
  ]);
  assert.deepEqual(fillCalls, points.map(([x, y]) => [x - 14, y - 14, 28, 28]));
});

function spyVector() {
  return {
    texts: [],
    rect() {},
    roundRect() {},
    ellipse() {},
    stroke() {},
    text(...args) { this.texts.push(args); },
  };
}

function gradientContext() {
  const context = {
    gradients: [],
    createLinearGradient(...args) {
      const gradient = { args, stops: [], addColorStop(position, color) { this.stops.push([position, color]); } };
      this.gradients.push(gradient);
      return gradient;
    },
    fillRect() {},
    save() {},
    restore() {},
  };
  return context;
}
