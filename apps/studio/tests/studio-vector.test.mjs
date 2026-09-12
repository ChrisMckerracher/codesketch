import test from "node:test";
import assert from "node:assert/strict";

import { createVector } from "../src/studio/workspace/vector/index.mjs";

function vector() {
  return createVector(null);
}

test("measure counts uppercase expansions as rendered cells", () => {
  const width = vector().measure("ß", 1);

  assert.equal(typeof width, "number");
  assert.equal(width, 16);
  assert.deepEqual(vector().wrap("ß", 8, 1), ["S", "S"]);
});

test("layout keeps surrogate pairs together and maps UTF-16 endpoints", () => {
  const result = vector().layout("A😀B", Infinity, 1);

  assert.equal(result.width, 24);
  assert.equal(result.height, 11);
  assert.equal(result.lineHeight, 11);
  assert.deepEqual(result.lines, ["A😀B"]);
  assert.deepEqual(result.cells, [
    { char: "A", x: 0, y: 0, start: 0, end: 1 },
    { char: "😀", x: 8, y: 0, start: 1, end: 3 },
    { char: "B", x: 16, y: 0, start: 3, end: 4 },
  ]);
});

test("layout maps every rendered cell from an uppercase expansion", () => {
  assert.deepEqual(vector().layout("ß", Infinity, 1).cells, [
    { char: "S", x: 0, y: 0, start: 0, end: 1 },
    { char: "S", x: 8, y: 0, start: 0, end: 1 },
  ]);
});

test("layout and wrap preserve repeated spaces and newlines", () => {
  const source = "A  B\n\nC";
  const result = vector().layout(source, Infinity, 1);

  assert.deepEqual(result.lines, ["A  B", "", "C"]);
  assert.equal(result.width, 32);
  assert.equal(result.height, 33);
  assert.deepEqual(result.cells.map(({ char, start, end }) => ({ char, start, end })), [
    { char: "A", start: 0, end: 1 },
    { char: " ", start: 1, end: 2 },
    { char: " ", start: 2, end: 3 },
    { char: "B", start: 3, end: 4 },
    { char: "C", start: 6, end: 7 },
  ]);
  assert.deepEqual(vector().wrap(source, 32, 1), ["A  B", "", "C"]);
  assert.deepEqual(vector().wrap("A  B", 24, 1), ["A  ", "B"]);
});

test("text uses a visible replacement for unknown code points", () => {
  const context = {
    strokes: 0,
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() { this.strokes += 1; },
  };

  createVector(context).text("😀", 0, 0);
  assert.equal(context.strokes, 2);
});
