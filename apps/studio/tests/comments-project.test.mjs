import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProject, PROJECT_BUDGET_BYTES, MAX_IMPORT_BYTES } from '../src/direction/index.mjs';

const stroke = (overrides = {}) => ({ type: 'stroke', layer: 'paint', color: '#253d38', opacity: 1,
  points: [[10, 10], [40, 40]], size: 8, brush: 'brush', ...overrides });

const richComment = (overrides = {}) => ({ id: 'c1', number: 3, seq: 7, text: 'sky needs depth',
  rect: { x: 5, y: 6, width: 7, height: 8 }, status: 'addressed', cursor: 4, artRevision: 2,
  at: '2026-02-02T02:02:02.020Z', acknowledgedAt: '2026-02-02T02:03:02.020Z',
  addressedAt: '2026-02-02T02:04:02.020Z', resolvedAt: null,
  visibleLayers: [{ id: 'paint', opacity: 1 }, { id: 'sketch', opacity: 0.5 }],
  request: { id: 'req-77', fingerprint: '{"text":"sky needs depth"}' }, ...overrides });

const v1 = (overrides = {}) => ({ format: 'codesketch', version: 1, commands: [stroke()], cursor: 1,
  queue: [], comments: [], ...overrides });

const v2 = (overrides = {}) => ({ format: 'codesketch', version: 2, commands: [stroke()], cursor: 1,
  queue: [], comments: [richComment()], ...overrides });

test('v1 projects are rejected, never converted', () => {
  assert.throws(() => validateProject(v1()), /Expected a Codesketch v2 project/);
  assert.throws(() => validateProject(v2({ version: 3 })), /Expected a Codesketch v2 project/);
  assert.throws(() => validateProject(v2({ format: 'other' })), /Expected a Codesketch v2 project/);
});

test('saved v2 fields commands, cursor, queue and comments are required', () => {
  for (const field of ['commands', 'cursor', 'queue', 'comments']) {
    const project = v2();
    delete project[field];
    assert.throws(() => validateProject(project), new RegExp(`missing the ${field} field`));
  }
});

test('legacy nullable comment metadata is rejected', () => {
  assert.throws(() => validateProject(v2({ comments: [richComment({ artRevision: null })] })), /artRevision/);
  assert.throws(() => validateProject(v2({ comments: [richComment({ visibleLayers: null })] })), /visible layers/);
  assert.deepEqual(validateProject(v2({ comments: [] })).comments, []);
  assert.deepEqual(validateProject(v2({ comments: [richComment({ visibleLayers: [] })] })).comments,
    [richComment({ visibleLayers: [] })]);
});

test('v2 save-like roundtrips preserve rich comment detail exactly', () => {
  const result = validateProject(v2());
  assert.deepEqual(result, { format: 'codesketch', version: 2, commands: [stroke()], cursor: 1,
    queue: [], comments: [richComment()] });
  assert.deepEqual(Object.keys(result.comments[0]).sort(), ['acknowledgedAt', 'addressedAt', 'artRevision',
    'at', 'cursor', 'id', 'number', 'rect', 'request', 'resolvedAt', 'seq', 'status', 'text',
    'visibleLayers']);
});

test('visible layer context survives with order, bounds and opacity rules', () => {
  const layers = [{ id: 'sketch', opacity: 0.5 }, { id: 'paint', opacity: 1 }];
  const result = validateProject(v2({ comments: [richComment({ visibleLayers: layers })] }));
  assert.deepEqual(result.comments[0].visibleLayers, layers);
  assert.throws(() => validateProject(v2({ comments: [richComment({ visibleLayers:
    [{ id: 'paint', opacity: 0 }] })] })), /opacity/);
});

test('unknown versions, malformed comments, and duplicates are rejected', () => {
  assert.throws(() => validateProject({ format: 'other', version: 2 }), /Expected a Codesketch v2 project/);
  assert.throws(() => validateProject(v2({ commands: 'nope' })), /Invalid project history/);
  assert.throws(() => validateProject(v2({ cursor: 99 })), /cursor/);
  assert.throws(() => validateProject(v2({ queue: 'nope' })), /Invalid project queue/);
  assert.throws(() => validateProject(v2({ comments: 'nope' })), /comment list/);
  assert.throws(() => validateProject(v2({ comments: [richComment({ status: 'closed' })] })), /status/);
  assert.throws(() => validateProject(v2({ comments: [richComment({ rect:
    { x: -1, y: 0, width: 5, height: 5 } })] })), /rect x/);
  assert.throws(() => validateProject(v2({ comments: [richComment(), richComment({ id: 'c1', number: 2, seq: 8,
    request: null })] })), /Duplicate comment id/);
  assert.throws(() => validateProject(v2({ comments: [richComment(), richComment({ id: 'c2', number: 2, seq: 8,
    request: { id: 'req-77', fingerprint: 'x' } })] })), /Duplicate request id/);
  assert.throws(() => validateProject(v2({ comments: Array.from({ length: 101 }, (_, i) =>
    richComment({ id: `c${i}`, number: i + 1, seq: i + 1, request: null })) })), /At most 100/);
});

test('transient grant and heartbeat fields are ignored, never serialized', () => {
  const result = validateProject({ ...v2(), docGeneration: 'gen-string', heartbeat: 99,
    activeGrant: { grantToken: 'tok', controlEpoch: 3 } });
  assert.deepEqual(Object.keys(result).sort(), ['commands', 'comments', 'cursor', 'format', 'queue', 'version']);
  const result2 = validateProject(v2({ comments: [richComment({ grantToken: 'tok', controlEpoch: 3 })] }));
  assert.deepEqual(result2.comments, [richComment()]);
});

test('raw 8 MiB import limit rejects, junk padding is dropped, budgets stay exported', () => {
  assert.equal(MAX_IMPORT_BYTES, 8 * 1024 * 1024);
  assert.equal(PROJECT_BUDGET_BYTES, 7 * 1024 * 1024);
  assert.throws(() => validateProject({ ...v2(), padding: 'x'.repeat(MAX_IMPORT_BYTES + 1024) }),
    /8 MiB import limit/);
  const base = JSON.stringify(v2());
  const slack = 'x'.repeat(MAX_IMPORT_BYTES - Buffer.byteLength(base) - 1024);
  const roomy = validateProject({ ...v2(), padding: slack });
  assert.equal(roomy.padding, undefined);
  assert.equal(roomy.version, 2);
});
