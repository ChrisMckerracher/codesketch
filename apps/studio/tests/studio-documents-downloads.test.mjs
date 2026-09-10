import test from 'node:test';
import assert from 'node:assert/strict';
import { downloadBlob } from '../src/studio/documents/downloads.mjs';

test('downloadBlob cleans up the anchor and object URL even when append or click throws', async () => {
  const revoked = [];
  const removed = [];
  const scope = {
    createElement: () => ({
      click: () => { throw new Error('popup blocked'); },
      remove: () => { removed.push(true); },
    }),
    body: { appendChild: () => { throw new Error('append failed'); } },
  };
  const url = {
    createObjectURL: () => 'blob:owned',
    revokeObjectURL: (objectUrl) => revoked.push(objectUrl),
  };
  await assert.rejects(async () => downloadBlob({ size: 1 }, 'meadow.json', { document: scope, url }),
    /append failed/);
  assert.deepEqual(removed, [true], 'the anchor is removed on failure');
  assert.deepEqual(revoked, ['blob:owned'], 'the object URL is revoked on failure');

  const clickFailure = {
    createElement: () => ({
      click: () => { throw new Error('popup blocked'); },
      remove: () => removed.push(true),
    }),
    body: { appendChild: () => {} },
  };
  await assert.rejects(async () => downloadBlob({ size: 1 }, 'meadow.json', { document: clickFailure, url }),
    /popup blocked/);
  assert.equal(revoked.length, 2, 'cleanup runs for click failures too');
});
