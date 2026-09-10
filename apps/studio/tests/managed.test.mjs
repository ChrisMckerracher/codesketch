import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildRuntime, capability, launchChild, launchFixture, readFrame, request, wait }
  from './managed-fixture.mjs';

describe('managed bootstrap', () => {
  test('a managed launch publishes ownership, signals readiness and stops cleanly', async t => {
    const runtime = await buildRuntime(t);
    const fixture = await launchFixture(t);
    const { child, exited } = launchChild(t, runtime, fixture);
    const frame = await readFrame(fixture.readerFd);
    assert.deepEqual(Object.keys(frame).sort(), ['digest', 'instanceId', 'pid', 'state', 'url']);
    assert.equal(frame.state, 'running');
    assert.equal(frame.pid, child.pid);
    assert.equal(frame.digest, runtime.digest);
    const record = JSON.parse(await readFile(join(fixture.dataDir, 'lifecycle.json'), 'utf8'));
    assert.equal(record.url, frame.url);
    assert.equal(record.capability, capability);
    const port = Number(new URL(frame.url).port);
    const host = `127.0.0.1:${port}`;
    const status = await request(port, 'GET', '/api/lifecycle/status',
      { host, 'x-codesketch-capability': capability });
    assert.equal(status.status, 200);
    assert.deepEqual(status.body, { ...frame, state: 'running' });
    const stopped = await request(port, 'POST', '/api/lifecycle/stop',
      { host, 'content-type': 'application/json', 'x-codesketch-capability': capability },
      JSON.stringify({ instanceId: frame.instanceId }));
    assert.equal(stopped.status, 200);
    assert.equal((await exited).code, 0);
    await assert.rejects(readFile(join(fixture.dataDir, 'lifecycle.json')), /ENOENT/, 'the record is removed on close');
  });

  test('a wrong digest fails startup without publishing anything', async t => {
    const runtime = await buildRuntime(t);
    const fixture = await launchFixture(t);
    const { exited, stderr, stderrBytes } = launchChild(t, runtime, fixture, { digest: 'c'.repeat(64) });
    const outcome = await exited;
    assert.notEqual(outcome.code, 0);
    assert.match(stderr(), /do not hash to the expected runtime digest/, 'digest verification is actually reached');
    assert.ok(stderrBytes() <= 64 * 1024, 'stderr stays within the launcher 64 KiB budget');
    await assert.rejects(readFile(join(fixture.dataDir, 'lifecycle.json')), /ENOENT/);
    await wait(30);
    let extra = 0;
    try { const buffer = Buffer.alloc(16); extra = readSync(fixture.readerFd, buffer, 0, 16); } catch {}
    assert.equal(extra, 0, 'no readiness frame is written before publication');
  });

  test('a broken readiness pipe leaves the healthy service discoverable', async t => {
    const runtime = await buildRuntime(t);
    const fixture = await launchFixture(t);
    const { child, exited } = launchChild(t, runtime, fixture);
    fixture.closeOnce(fixture.readerFd);
    let record = null;
    const started = Date.now();
    while (Date.now() - started < 12000) {
      try {
        record = JSON.parse(await readFile(join(fixture.dataDir, 'lifecycle.json'), 'utf8'));
        break;
      } catch {}
      await wait(50);
    }
    assert.ok(record, 'the ownership record is published despite EPIPE');
    const status = await request(Number(new URL(record.url).port), 'GET', '/api/lifecycle/status',
      { host: `127.0.0.1:${Number(new URL(record.url).port)}`, 'x-codesketch-capability': capability });
    assert.equal(status.status, 200, 'the service stays healthy after the pipe broke');
    child.kill('SIGTERM');
    assert.equal((await exited).code, 0);
  });

  test('SIGTERM flushes, removes the record and exits cleanly', async t => {
    const runtime = await buildRuntime(t);
    const fixture = await launchFixture(t);
    const { child, exited } = launchChild(t, runtime, fixture);
    const frame = await readFrame(fixture.readerFd);
    child.kill('SIGTERM');
    assert.equal((await exited).code, 0);
    await assert.rejects(readFile(join(fixture.dataDir, 'lifecycle.json')), /ENOENT/);
    assert.ok(frame.url.startsWith('http://127.0.0.1:'));
  });

  test('malformed input fails generically without echoing secrets', async t => {
    const runtime = await buildRuntime(t);
    const fixture = await launchFixture(t);
    const full = JSON.stringify({ dataDir: fixture.dataDir, port: 0, capability: 'f'.repeat(64), digest: runtime.digest });
    const { exited, stderr } = launchChild(t, runtime, fixture, full.slice(0, full.indexOf('"digest"')));
    const outcome = await exited;
    assert.notEqual(outcome.code, 0);
    assert.ok(!stderr().includes('f'.repeat(64)), 'the capability is never echoed');
    await assert.rejects(readFile(join(fixture.dataDir, 'lifecycle.json')), /ENOENT/);
  });
});
