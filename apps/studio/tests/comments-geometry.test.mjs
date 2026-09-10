import test from 'node:test';
import assert from 'node:assert/strict';

import { canvasPoint, selectionRect } from '../src/studio/comments/index.mjs';

// Plain-object stand-in for a DOMRect in Node tests.
function rect(left, top, width, height) {
  return { left, top, width, height, x: left, y: top };
}

test('canvasPoint converts viewport coordinates at natural size', () => {
  const natural = rect(0, 0, 1000, 700);
  assert.deepEqual(canvasPoint(0, 0, natural), [0, 0]);
  assert.deepEqual(canvasPoint(250, 175, natural), [250, 175]);
  assert.deepEqual(canvasPoint(999, 699, natural), [999, 699]);
});

test('canvasPoint uses the default 1000x700 document', () => {
  assert.deepEqual(canvasPoint(1200, 900, rect(0, 0, 600, 300)), [1000, 700]);
});

test('canvasPoint maps a resized, offset canvas to document coordinates', () => {
  const half = rect(120, 80, 500, 350);
  assert.deepEqual(canvasPoint(120, 80, half), [0, 0]);
  assert.deepEqual(canvasPoint(370, 255, half), [500, 350]);
  assert.deepEqual(canvasPoint(620, 430, half), [1000, 700]);
});

test('canvasPoint rounds fractional conversions to integers', () => {
  const narrow = rect(0, 0, 300, 700);
  assert.deepEqual(canvasPoint(1, 0, narrow), [3, 0]);
  assert.deepEqual(canvasPoint(2, 0, narrow), [7, 0]);
});

test('canvasPoint clamps points outside the canvas bounds', () => {
  const natural = rect(0, 0, 1000, 700);
  assert.deepEqual(canvasPoint(-50, -50, natural), [0, 0]);
  assert.deepEqual(canvasPoint(1500, 900, natural), [1000, 700]);
});

test('canvasPoint is stable across resizes of the same document point', () => {
  const small = canvasPoint(350, 245, rect(100, 70, 500, 350));
  const natural = canvasPoint(500, 350, rect(0, 0, 1000, 700));
  const doubled = canvasPoint(1000, 700, rect(0, 0, 2000, 1400));
  assert.deepEqual(small, [500, 350]);
  assert.deepEqual(natural, [500, 350]);
  assert.deepEqual(doubled, [500, 350]);
});

test('selectionRect normalizes every drag direction', () => {
  const expected = { x: 10, y: 20, width: 100, height: 100 };
  assert.deepEqual(selectionRect([10, 20], [110, 120]), expected);
  assert.deepEqual(selectionRect([110, 120], [10, 20]), expected);
  assert.deepEqual(selectionRect([110, 20], [10, 120]), expected);
  assert.deepEqual(selectionRect([10, 120], [110, 20]), expected);
});

test('selectionRect returns integers for integer points', () => {
  assert.deepEqual(selectionRect([3, 7], [101, 41]), { x: 3, y: 7, width: 98, height: 34 });
});

test('selectionRect rejects zero-area selections', () => {
  assert.equal(selectionRect([5, 5], [5, 5]), null);
  assert.equal(selectionRect([10, 10], [210, 10]), null);
  assert.equal(selectionRect([10, 10], [10, 210]), null);
});

test('a drag across a resized canvas yields the whole document rect', () => {
  const quarter = rect(50, 25, 250, 175);
  const start = canvasPoint(300, 200, quarter);
  const end = canvasPoint(10, 10, quarter);
  assert.deepEqual(start, [1000, 700]);
  assert.deepEqual(end, [0, 0]);
  assert.deepEqual(selectionRect(start, end), { x: 0, y: 0, width: 1000, height: 700 });
});
