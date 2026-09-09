import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, applyCommand, validateBatch, replay, LIMITS } from '../src/painting/index.mjs';

const stroke = (overrides = {}) => ({ type: 'stroke', layer: 'paint', color: '#253d38',
  points: [[10, 10], [40, 40]], size: 8, brush: 'brush', ...overrides });

test('default document exposes version, canvas, background, base layer and empty marks', () => {
  const doc = createDocument();
  assert.deepEqual(doc, { version: 1, width: 1000, height: 700, background: '#f7f3e8',
    layers: [{ id: 'paint', name: 'Painting', visible: true, opacity: 1 }], marks: [] });
});

test('valid stroke normalizes command and never mutates the input document', () => {
  const doc = createDocument();
  const snapshot = structuredClone(doc);
  const { document: next, command } = applyCommand(doc, stroke({ color: '#AABBCC' }));
  assert.deepEqual(doc, snapshot, 'input document must stay untouched');
  assert.equal(next.marks.length, 1);
  assert.deepEqual(command, { type: 'stroke', layer: 'paint', color: '#aabbcc', opacity: 1,
    points: [[10, 10], [40, 40]], size: 8, brush: 'brush' });
  assert.notEqual(next.marks, doc.marks, 'marks array must be replaced, not mutated');
});

test('invalid batch is atomic: it throws and leaves the source document unchanged', () => {
  const doc = createDocument();
  const snapshot = structuredClone(doc);
  assert.throws(() => validateBatch(doc, [stroke(), stroke(), { type: 'stroke', points: [] }]),
    /Stroke needs 1–2000 points/);
  assert.deepEqual(doc, snapshot, 'no partial commit from a failed batch');
});

test('rejects out-of-range coordinates, malformed colors and unknown brushes', () => {
  const doc = createDocument();
  assert.throws(() => applyCommand(doc, stroke({ points: [[-1, 10]] })), /x must be between 0 and 1000/);
  assert.throws(() => applyCommand(doc, stroke({ points: [[1000, 700.5]] })), /y must be between 0 and 700/);
  assert.throws(() => applyCommand(doc, stroke({ color: 'red' })), /Color must be #rrggbb/);
  assert.throws(() => applyCommand(doc, stroke({ brush: 'crayon' })), /Unknown brush/);
});

test('rejects unknown layers for marks and duplicate ids for layer.add', () => {
  const doc = createDocument();
  assert.throws(() => applyCommand(doc, stroke({ layer: 'ghost' })), /Unknown layer ghost/);
  assert.throws(() => applyCommand(doc, { type: 'layer.add', id: 'paint', name: 'Again' }),
    /Layer paint already exists/);
  assert.throws(() => applyCommand(doc, { type: 'layer.update', id: 'ghost', visible: false }),
    /Unknown layer ghost/);
});

test('layer.add, layer.update and mark replay to an equivalent final document', () => {
  const commands = [
    { type: 'layer.add', id: 'sketch', name: ' Sketch ' },
    { type: 'layer.update', id: 'sketch', opacity: 0.5, visible: false },
    stroke({ layer: 'sketch', points: [[0, 0], [1000, 700]] }),
  ];
  const final = replay(commands);
  assert.deepEqual(final.layers.map(layer => [layer.id, layer.opacity, layer.visible]),
    [['paint', 1, true], ['sketch', 0.5, false]], 'layer created and updated');
  assert.equal(final.marks.length, 1);
  assert.equal(final.marks[0].layer, 'sketch');
  const viaBatch = validateBatch(createDocument(), commands).document;
  assert.deepEqual(viaBatch, final, 'batch and replay agree');
});

test('stroke point count is capped at LIMITS.points per stroke', () => {
  const doc = createDocument();
  const points = n => Array.from({ length: n }, (_, i) => [i % 1000, (i * 7) % 700]);
  assert.throws(() => applyCommand(doc, stroke({ points: points(LIMITS.points + 1) })),
    /Stroke needs 1–2000 points/);
  const { document: next } = applyCommand(doc, stroke({ points: points(LIMITS.points) }));
  assert.equal(next.marks[0].points.length, LIMITS.points, 'a stroke at the cap is accepted');
});

test('total point budget across a batch enforces LIMITS.totalPoints', () => {
  const full = Array.from({ length: LIMITS.points }, (_, i) => [i % 1000, (i * 3) % 700]);
  const batch = Array.from({ length: LIMITS.totalPoints / LIMITS.points }, () => stroke({ points: full }));
  assert.equal(batch.length * LIMITS.points, LIMITS.totalPoints, '75×2000 strokes hit the budget exactly');
  assert.doesNotThrow(() => validateBatch(createDocument(), batch),
    'a batch exactly at the budget is accepted');
  assert.throws(() => validateBatch(createDocument(), [...batch, stroke({ points: [[5, 5]] })]),
    /Painting point limit reached/, 'one point past the budget is rejected');
});
