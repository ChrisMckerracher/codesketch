import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, symlink, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { verifyRuntime } from '../src/transport/runtime-manifest.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function manifestBytes(entries) {
  const normalized = {
    files: entries.map(({ path, size, sha256: hash }) => ({ path, size, sha256: hash })),
  };
  return Buffer.from(`${JSON.stringify(normalized)}\n`, 'utf8');
}

async function buildRuntime(t, paths = ['public/index.html', 'src/transport/lifecycle-http.mjs']) {
  const root = await mkdtemp(join(tmpdir(), 'codesketch-runtime-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const entries = [];
  for (const path of paths) {
    const body = Buffer.from(`canonical runtime bytes for ${path}\n`, 'utf8');
    await mkdir(join(root, dirname(path)), { recursive: true, mode: 0o700 });
    await writeFile(join(root, ...path.split('/')), body, { mode: 0o600 });
    entries.push({ path, size: body.length, sha256: sha256(body) });
  }
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const bytes = manifestBytes(entries);
  await writeFile(join(root, 'runtime-manifest.json'), bytes, { mode: 0o600 });
  return { root, entries, bytes, digest: sha256(bytes) };
}

async function withManifest(runtime, bytes) {
  await writeFile(join(runtime.root, 'runtime-manifest.json'), bytes, { mode: 0o600 });
  return sha256(bytes);
}

describe('runtime manifest verification', () => {
  test('verifies a complete canonical runtime and returns the digest', async t => {
    const runtime = await buildRuntime(t);
    assert.equal(await verifyRuntime(runtime.root, runtime.digest), runtime.digest);
  });

  test('verification is independent of the process working directory', async t => {
    const runtime = await buildRuntime(t);
    const previous = process.cwd();
    process.chdir(tmpdir());
    t.after(() => process.chdir(previous));
    assert.equal(await verifyRuntime(runtime.root, runtime.digest), runtime.digest);
  });

  test('rejects malformed expected digests before reading anything', async t => {
    const runtime = await buildRuntime(t);
    for (const digest of ['A'.repeat(64), 'g'.repeat(64), 'a'.repeat(63), 42, null]) {
      await assert.rejects(verifyRuntime(runtime.root, digest), /64 lowercase hex/);
    }
  });

  test('rejects manifest bytes that do not hash to the expected digest', async t => {
    const runtime = await buildRuntime(t);
    const other = await buildRuntime(t, ['public/index.html']);
    await assert.rejects(verifyRuntime(runtime.root, other.digest), /expected runtime digest/);
  });

  test('rejects noncanonical encodings and schema violations', async t => {
    const runtime = await buildRuntime(t, ['a.txt']);
    const entry = runtime.entries[0];
    const one = body => `{"files":[${body}]}\n`;
    const cases = [
      ['entry key order', one(`{"sha256":"${entry.sha256}","size":${entry.size},"path":"a.txt"}`)],
      ['extra spacing', `{"files": [{"path": "a.txt", "size": ${entry.size}, "sha256": "${entry.sha256}"}]}\n`],
      ['missing trailing LF', runtime.bytes.toString('utf8').replace(/\n$/, '')],
      ['unknown top-level key', `{"files":[${runtime.bytes.toString('utf8').slice(9, -2)}],"extra":1}\n`],
      ['unknown entry key', one(`{"path":"a.txt","size":${entry.size},"sha256":"${entry.sha256}","extra":1}`)],
      ['absolute path', one(`{"path":"/a.txt","size":${entry.size},"sha256":"${entry.sha256}"}`)],
      ['dotdot segment', one(`{"path":"x/../a.txt","size":${entry.size},"sha256":"${entry.sha256}"}`)],
      ['empty segment', one(`{"path":"dir//a.txt","size":${entry.size},"sha256":"${entry.sha256}"}`)],
      ['backslash path', one(`{"path":"a\\\\b.txt","size":${entry.size},"sha256":"${entry.sha256}"}`)],
      ['non-ascii path', one(`{"path":"café.txt","size":${entry.size},"sha256":"${entry.sha256}"}`)],
      ['negative size', one(`{"path":"a.txt","size":-1,"sha256":"${entry.sha256}"}`)],
      ['non-integer size', one(`{"path":"a.txt","size":1.5,"sha256":"${entry.sha256}"}`)],
      ['non-hex hash', one(`{"path":"a.txt","size":${entry.size},"sha256":"${'G'.repeat(64)}"}`)],
    ];
    for (const [label, text] of cases) {
      const digest = await withManifest(runtime, Buffer.from(text, 'utf8'));
      await assert.rejects(verifyRuntime(runtime.root, digest), null, `${label} must be rejected`);
    }
  });

  test('rejects unsorted and duplicate inventories', async t => {
    const runtime = await buildRuntime(t, ['a.txt', 'b.txt', 'c.txt']);
    const [a, b, c] = [...runtime.entries].sort((x, y) => (x.path < y.path ? -1 : 1));
    const unsorted = manifestBytes([b, a, c]);
    await assert.rejects(verifyRuntime(runtime.root, await withManifest(runtime, unsorted)), /ascending/);
    const duplicate = manifestBytes([a, a]);
    await assert.rejects(verifyRuntime(runtime.root, await withManifest(runtime, duplicate)), /ascending/);
  });

  test('rejects runtime trees that deviate from the inventory', async t => {
    const extraFile = await buildRuntime(t);
    await writeFile(join(extraFile.root, 'stray.txt'), 'stray\n', { mode: 0o600 });
    await assert.rejects(verifyRuntime(extraFile.root, extraFile.digest), /not listed/);

    const extraDir = await buildRuntime(t);
    await mkdir(join(extraDir.root, 'extra'), { recursive: true });
    await assert.rejects(verifyRuntime(extraDir.root, extraDir.digest), /not implied/);

    const missing = await buildRuntime(t);
    await rm(join(missing.root, ...'src/transport/lifecycle-http.mjs'.split('/')));
    await assert.rejects(verifyRuntime(missing.root, missing.digest), /missing from the runtime tree/);

    const modified = await buildRuntime(t, ['a.txt']);
    await writeFile(join(modified.root, 'a.txt'), Buffer.alloc(modified.entries[0].size, 0x78), { mode: 0o600 });
    await assert.rejects(verifyRuntime(modified.root, modified.digest), /do not match the manifest sha256/);

    const wrongSize = await buildRuntime(t, ['a.txt']);
    await writeFile(join(wrongSize.root, 'a.txt'), 'short', { mode: 0o600 });
    await assert.rejects(verifyRuntime(wrongSize.root, wrongSize.digest), /declares/);

    const linked = await buildRuntime(t);
    await rm(join(linked.root, ...'public/index.html'.split('/')));
    await symlink(join(linked.root, ...'src/transport/server.mjs'.split('/')),
      join(linked.root, ...'public/index.html'.split('/')));
    await assert.rejects(verifyRuntime(linked.root, linked.digest), /symbolic link/);

    const unprivateDir = await buildRuntime(t);
    await chmod(join(unprivateDir.root, ...'src/transport'.split('/')), 0o755);
    await assert.rejects(verifyRuntime(unprivateDir.root, unprivateDir.digest), /not private/);

    const permissive = await buildRuntime(t);
    await chmod(join(permissive.root, ...'public/index.html'.split('/')), 0o644);
    await assert.rejects(verifyRuntime(permissive.root, permissive.digest), /not private/);

    const oversized = await buildRuntime(t);
    const big = Buffer.alloc(1024 * 1024 + 1, 0x20);
    await assert.rejects(verifyRuntime(oversized.root, await withManifest(oversized, big)), /1 MiB limit/);
  });

  test('rejects a manifest that lists itself in the inventory', async t => {
    const runtime = await buildRuntime(t, ['a.txt']);
    const bytes = manifestBytes([...runtime.entries,
      { path: 'runtime-manifest.json', size: runtime.bytes.length, sha256: sha256(runtime.bytes) }]);
    await assert.rejects(verifyRuntime(runtime.root, await withManifest(runtime, bytes)), /must not list itself/);
  });
});
