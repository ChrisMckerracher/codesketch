import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { chmod, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildRuntime, capability, launchChild, launchFixture, partialStrokeRecovery, readFrame,
  recoveryBytes, request, until, wait } from './managed-fixture.mjs';

function authorized(port) {
  return { host: `127.0.0.1:${port}`, 'content-type': 'application/json', 'x-codesketch-capability': capability };
}

async function stopRequest(port, instanceId) {
  return request(port, 'POST', '/api/lifecycle/stop', authorized(port),
    JSON.stringify({ instanceId }));
}

async function startManagedCase(t) {
  const runtime = await buildRuntime(t);
  const fixture = await launchFixture(t);
  const recovery = partialStrokeRecovery();
  writeFileSync(join(fixture.dataDir, 'recovery.json'), recoveryBytes(recovery), { mode: 0o600 });
  const { child, exited, stderr, stderrBytes } = launchChild(t, runtime, fixture);
  const frame = await readFrame(fixture.readerFd);
  const port = Number(new URL(frame.url).port);
  const restored = await request(port, 'GET', '/api/state', { host: `127.0.0.1:${port}` });
  assert.equal(restored.status, 200);
  return { child, exited, stderr, stderrBytes, fixture, frame, port, recovery, restored: restored.body };
}

function assertSameRunningIdentity(body, frame) {
  assert.deepEqual(body, { instanceId: frame.instanceId, pid: frame.pid,
    url: frame.url, digest: frame.digest, state: 'running' }, 'the running identity is unchanged');
}

async function runFlushFailureCase(t, stimulus) {
  const working = await startManagedCase(t);
  const { child, exited, stderr, stderrBytes, fixture, frame, port, recovery, restored } = working;
  assert.equal(restored.playback.status, 'paused', 'the recovery restores a paused session');
  assert.equal(restored.playback.active.progress, recovery.active.progress,
    'the partial active stroke is restored');
  assert.equal(restored.playback.remaining, 2, 'the active stroke plus queued work is restored');
  const recordPath = join(fixture.dataDir, 'lifecycle.json');
  const before = await readFile(recordPath);
  await chmod(fixture.dataDir, 0o500);
  if (stimulus.signal) {
    child.kill(stimulus.signal);
    await until(() => stderr().includes('flush failed'), 8000, 25, 'the failed flush diagnostic');
  } else {
    const failed = await stopRequest(port, frame.instanceId);
    assert.equal(failed.status, 500, 'the authenticated HTTP stop reports the flush failure');
    assert.match(failed.body.error, /could not be saved/);
  }
  await wait(250);
  assert.ok(child.exitCode === null && child.signalCode === null,
    'the process remains live after the failed flush');
  assertSameRunningIdentity(
    (await request(port, 'GET', '/api/lifecycle/status', authorized(port))).body, frame);  const paused = await request(port, 'GET', '/api/state', { host: `127.0.0.1:${port}` });
  assert.equal(paused.body.playback.status, 'paused', 'the studio stays paused');
  assert.equal(paused.body.playback.active.progress, recovery.active.progress,
    'the partial preview is preserved');
  assert.equal(paused.body.playback.remaining, 2, 'the queued work is preserved');
  assert.ok(paused.body.storageError, 'the failed save is visible to the client');
  assert.ok((await readFile(recordPath)).equals(before), 'the ownership record bytes are unchanged');
  assert.ok(!stderr().includes(capability), 'the capability is never echoed');
  assert.ok(stderrBytes() <= 64 * 1024, 'stderr stays within the launcher 64 KiB budget');
  await chmod(fixture.dataDir, 0o700);
  const retried = await stopRequest(port, frame.instanceId);
  assert.equal(retried.status, 200, 'the retried authenticated stop succeeds');
  assert.equal((await exited).code, 0, 'the process exits cleanly');
  await assert.rejects(readFile(recordPath), /ENOENT/, 'the record is removed');
  const durable = JSON.parse(await readFile(join(fixture.dataDir, 'recovery.json'), 'utf8'));
  assert.equal(durable.active.progress, recovery.active.progress,
    'the durable recovery keeps the partial active stroke');
  assert.equal(durable.project.queue.length, 2,
    'the durable recovery keeps the active head plus the queued work');
  assert.equal(durable.project.commands.length, 1, 'the durable recovery keeps committed history');
}

describe('managed flush failure preservation', () => {
  test('SIGTERM reports the failed flush and preserves the live paused studio', async t => {
    await runFlushFailureCase(t, { signal: 'SIGTERM' });
  });

  test('SIGINT reports the failed flush and preserves the live paused studio', async t => {
    await runFlushFailureCase(t, { signal: 'SIGINT' });
  });

  test('an authenticated HTTP stop failure returns 500 and preserves the live paused studio', async t => {
    await runFlushFailureCase(t, {});
  });
});
