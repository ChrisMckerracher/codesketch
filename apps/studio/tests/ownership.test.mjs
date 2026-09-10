import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishOwnership, readOwnership, removeOwnership, validateRecord } from '../src/transport/ownership.mjs';

const record = { instanceId: 'instance-1', pid: 4242, url: 'http://127.0.0.1:49152',
  digest: 'b'.repeat(64), capability: 'a'.repeat(64) };

async function dataDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'codesketch-ownership-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

describe('ownership records', () => {
  test('validateRecord accepts the exact schema and rejects everything else', () => {
    assert.deepEqual(validateRecord(record), record);
    const bad = [
      null, {}, { ...record, state: 'running' }, { ...record, extra: 1 },
      { ...record, instanceId: '' }, { ...record, pid: 0 }, { ...record, pid: -1 }, { ...record, pid: 1.5 },
      { ...record, url: 'http://localhost:49152' }, { ...record, url: 'http://127.0.0.1:0' },
      { ...record, url: 'http://127.0.0.1:65536' }, { ...record, url: 'http://127.0.0.1:8080/' },
      { ...record, url: 'http://127.0.0.1:8080/x' }, { ...record, url: 'http://127.0.0.1:049152' },
      { ...record, digest: 'B'.repeat(64) },
      { ...record, capability: 'a'.repeat(63) },
    ];
    for (const value of bad) {
      assert.throws(() => validateRecord(value), error => error.statusCode === undefined,
        `expected rejection for ${JSON.stringify(value)}`);
    }
  });

  test('publishes durably, refuses any preexisting record and reads back exactly', async t => {
    const dir = await dataDir(t);
    const published = await publishOwnership(dir, record);
    assert.deepEqual(published, record);
    const stats = await stat(join(dir, 'lifecycle.json'));
    assert.equal(stats.mode & 0o077, 0, 'the published record is private');
    assert.match(await readFile(join(dir, 'lifecycle.json'), 'utf8'), /"instanceId":"instance-1"/);
    await assert.rejects(publishOwnership(dir, { ...record, instanceId: 'other' }), /never replaces/);
    assert.deepEqual(await readOwnership(dir), record, 'the first record stands');
    assert.deepEqual((await readdir(dir)).filter(name => name.includes('.tmp')), [], 'no temp files remain');
  });

  test('reading rejects private, symlinked, malformed, unknown and oversized records', async t => {
    const permissive = await dataDir(t);
    await writeFile(join(permissive, 'lifecycle.json'), JSON.stringify(record), { mode: 0o644 });
    await assert.rejects(readOwnership(permissive), /private/);

    const linked = await dataDir(t);
    await symlink(join(linked, 'elsewhere'), join(linked, 'lifecycle.json'));
    await assert.rejects(readOwnership(linked), /symlink/);

    const malformed = await dataDir(t);
    await writeFile(join(malformed, 'lifecycle.json'), '{"instanceId":', { mode: 0o600 });
    await assert.rejects(readOwnership(malformed), /valid JSON/);

    const unknown = await dataDir(t);
    await writeFile(join(unknown, 'lifecycle.json'),
      `${JSON.stringify({ ...record, state: 'running' })}\n`, { mode: 0o600 });
    await assert.rejects(readOwnership(unknown), /exactly instanceId, pid, url, digest and capability/);

    const oversized = await dataDir(t);
    await writeFile(join(oversized, 'lifecycle.json'), Buffer.alloc(16 * 1024 + 1, 0x20), { mode: 0o600 });
    await assert.rejects(readOwnership(oversized), /16 KiB limit/);

    const fifo = await dataDir(t);
    spawnSync('mkfifo', ['-m', '600', join(fifo, 'lifecycle.json')]);
    await assert.rejects(readOwnership(fifo), /regular file/, 'a replaced FIFO cannot block the reader');

    assert.equal(await readOwnership(await dataDir(t)), null, 'a missing record reads as null');
  });

  test('removal matches the full identity and preserves different records', async t => {
    const dir = await dataDir(t);
    assert.equal(await removeOwnership(dir, record), false, 'a missing record is harmless');
    await publishOwnership(dir, record);
    await assert.rejects(removeOwnership(dir, { ...record, instanceId: 'other' }), /preserved/);
    await assert.rejects(removeOwnership(dir, { ...record, capability: 'c'.repeat(64) }), /preserved/,
      'the capability is part of the identity match');
    await assert.rejects(removeOwnership(dir, { ...record, pid: 5 }), /preserved/);
    assert.deepEqual(await readOwnership(dir), record, 'different records are preserved untouched');
    assert.equal(await removeOwnership(dir, record), true, 'the exact record is removed');
    assert.equal(await readOwnership(dir), null);
    assert.equal(await removeOwnership(dir, record), false, 'removal stays idempotent');
  });

  test('publish cleans up its unpublished temp and refuses symlinked record paths', async t => {
    const linked = await dataDir(t);
    await symlink(join(linked, 'elsewhere'), join(linked, 'lifecycle.json'));
    await assert.rejects(publishOwnership(linked, record), /never replaces/);

    const locked = await dataDir(t);
    await chmod(locked, 0o500);
    await assert.rejects(publishOwnership(locked, record));
    await chmod(locked, 0o700);
    assert.deepEqual(await readdir(locked), [], 'a failed publication leaves no unpublished temp');

    const growth = await dataDir(t);
    await writeFile(join(growth, 'lifecycle.json'), `${JSON.stringify(record)}\n${'x'.repeat(64)}`, { mode: 0o600 });
    await assert.rejects(readOwnership(growth), error => /must be valid JSON|16 KiB/.test(error.message),
      'growth or trailing bytes never yield a record');
  });
});
