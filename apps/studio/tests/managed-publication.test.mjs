import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRuntime, capability, launchChild, launchFixture, partialStrokeRecovery,
  pendingFrameBytes, recoveryBytes } from './managed-fixture.mjs';

const recordPath = dataDir => join(dataDir, 'lifecycle.json');

function assertWithinDeadline(outcome) {
  assert.ok(outcome.signal !== 'timeout', 'the launcher exits within the deadline');
  assert.notEqual(outcome.code, 0, 'the launcher exits nonzero');
}

describe('managed publication failure evidence', () => {
  test('a pre-existing different record refuses publication after listening and preserves its bytes', async t => {
    const runtime = await buildRuntime(t);
    const fixture = await launchFixture(t);
    const recovery = partialStrokeRecovery();
    writeFileSync(join(fixture.dataDir, 'recovery.json'), recoveryBytes(recovery), { mode: 0o600 });
    const original = Buffer.from(`${JSON.stringify({ instanceId: 'managed-fixture-earlier-studio',
      pid: 4242424, url: 'http://127.0.0.1:65530', digest: 'c'.repeat(64), capability: 'd'.repeat(64) })}\n`, 'utf8');
    writeFileSync(recordPath(fixture.dataDir), original, { mode: 0o600 });
    const { exited, stderr, stderrBytes } = launchChild(t, runtime, fixture);
    const outcome = await exited;
    assertWithinDeadline(outcome);
    assert.equal(pendingFrameBytes(fixture.readerFd), 0, 'no readiness frame is emitted');
    assert.ok((await readFile(recordPath(fixture.dataDir))).equals(original),
      'the pre-existing record bytes are preserved exactly');
    assert.ok((await readFile(join(fixture.dataDir, 'recovery.json'))).equals(recoveryBytes(recovery)),
      'the valid recovery bytes are preserved exactly');
    assert.match(stderr(), /never replaces ownership/, 'the refusal is reported');
    assert.ok(!stderr().includes(capability), 'the launch capability is never echoed');
    assert.ok(stderrBytes() <= 64 * 1024, 'stderr stays within the launcher 64 KiB budget');
    assert.deepEqual((await readdir(fixture.dataDir)).sort(),
      ['.writer.lock', 'lifecycle.json', 'ready.fifo', 'recovery.json'],
      'no publication temporary is left behind');
  });

  test('malformed private recovery fails startup before listening and preserves its bytes', async t => {
    const runtime = await buildRuntime(t);
    const fixture = await launchFixture(t);
    const original = Buffer.from('{ "format": "codesketch-recovery"\n', 'utf8');
    writeFileSync(join(fixture.dataDir, 'recovery.json'), original, { mode: 0o600 });
    const { exited, stderr, stderrBytes } = launchChild(t, runtime, fixture);
    const outcome = await exited;
    assertWithinDeadline(outcome);
    assert.equal(pendingFrameBytes(fixture.readerFd), 0, 'no readiness frame is emitted');
    await assert.rejects(readFile(recordPath(fixture.dataDir)), /ENOENT/, 'nothing is published');
    assert.ok((await readFile(join(fixture.dataDir, 'recovery.json'))).equals(original),
      'the malformed recovery bytes are preserved exactly');
    assert.match(stderr(), /Recovery failed/, 'the recovery rejection is reported before listening');
    assert.ok(!stderr().includes(capability), 'the launch capability is never echoed');
    assert.ok(stderrBytes() <= 64 * 1024, 'stderr stays within the launcher 64 KiB budget');
  });

  test('an injected directory sync failure after rename removes the matching record and preserves recovery', async t => {
    const runtime = await buildRuntime(t);
    const fixture = await launchFixture(t);
    const recovery = partialStrokeRecovery();
    writeFileSync(join(fixture.dataDir, 'recovery.json'), recoveryBytes(recovery), { mode: 0o600 });
    const proofDir = await mkdtemp(join(tmpdir(), 'codesketch-dirsync-proof-'));
    t.after(() => rm(proofDir, { recursive: true, force: true }));
    const proof = join(proofDir, 'injection.proof');
    const identity = statSync(fixture.dataDir);
    const preload = fileURLToPath(new URL('./managed-sync-fail-preload.mjs', import.meta.url));
    const { exited, stderr, stderrBytes } = launchChild(t, runtime, fixture, undefined, {
      execArgv: ['--import', preload],
      env: { ...process.env,
        CODESKETCH_TEST_DIRSYNC_DEV: String(identity.dev),
        CODESKETCH_TEST_DIRSYNC_INO: String(identity.ino),
        CODESKETCH_TEST_DIRSYNC_PROOF: proof },
    });
    const outcome = await exited;
    assert.equal(readFileSync(proof, 'utf8').trim(), '1', 'the injected EIO fired exactly once');
    assertWithinDeadline(outcome);
    assert.equal(pendingFrameBytes(fixture.readerFd), 0, 'no readiness frame is emitted');
    await assert.rejects(readFile(recordPath(fixture.dataDir)), /ENOENT/,
      'the matching published record is removed');
    assert.ok((await readFile(join(fixture.dataDir, 'recovery.json'))).equals(recoveryBytes(recovery)),
      'the original recovery bytes are preserved exactly');
    assert.deepEqual((await readdir(fixture.dataDir)).sort(),
      ['.writer.lock', 'ready.fifo', 'recovery.json'],
      'the data directory keeps only its own entries with no temporary left');
    assert.match(stderr(), /could not sync its directory/, 'the publication gate is reported');
    assert.ok(!stderr().includes(capability), 'the launch capability is never echoed');
    assert.ok(stderrBytes() <= 64 * 1024, 'stderr stays within the launcher 64 KiB budget');
  });
});
