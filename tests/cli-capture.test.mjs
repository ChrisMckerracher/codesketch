import test from 'node:test';
import './capture/readiness.mjs';
import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync, rmSync, writeFileSync, chmodSync, readFileSync, mkdtempSync, mkdirSync, readdirSync } from 'node:fs';
import { once } from 'node:events';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { capture } from '../src/cli/capture/index.mjs';
import { terminateBrowser } from '../src/cli/capture/browser.mjs';
import { writePngAtomically } from '../src/cli/capture/validate.mjs';
import { startCaptureServer } from '../src/cli/capture/server.mjs';

function isProcessDead(pid) {
  try {
    process.kill(pid, 0);
    return false;
  } catch (err) {
    return err.code === 'ESRCH';
  }
}

function sampleSnapshot(overrides = {}) {
  return {
    instanceId: 'test-inst-1',
    revision: 4,
    document: {
      version: 1,
      width: 300,
      height: 200,
      background: '#f5f5f5',
      layers: [
        { id: 'bg', name: 'Background', visible: true, opacity: 1 },
        { id: 'paint', name: 'Paint', visible: true, opacity: 1 },
      ],
      marks: [
        { type: 'rect', layer: 'paint', x: 20, y: 20, width: 60, height: 60, color: '#253d38', opacity: 1 },
      ],
    },
    playback: {
      active: {
        command: { type: 'stroke', layer: 'paint', brush: 'brush', size: 6, color: '#336699', opacity: 1, points: [[100, 50], [200, 50]] },
        progress: 0.5,
      },
    },
    ...overrides,
  };
}

function rawHttpRequest(port, path = '/', headers = {}) {
  return new Promise((resolveRequest, rejectRequest) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'GET', path, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolveRequest({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.setTimeout(3000, () => req.destroy(new Error('timeout')));
    req.on('error', rejectRequest);
    req.end();
  });
}

test('rejects missing or malformed snapshot objects', async () => {
  await assert.rejects(() => capture(null), /Capture requires a valid snapshot/);
  await assert.rejects(() => capture(undefined), /Capture requires a valid snapshot/);
  await assert.rejects(() => capture('snapshot'), /Capture requires a valid snapshot/);
  await assert.rejects(() => capture([]), /Capture requires a valid snapshot/);
});

test('rejects document with invalid dimensions, layers, marks, or background', async () => {
  await assert.rejects(() => capture({ width: 0, height: 200, layers: [], marks: [], background: '#fff' }), /positive finite width/);
  await assert.rejects(() => capture({ width: 200, height: -10, layers: [], marks: [], background: '#fff' }), /positive finite width/);
  await assert.rejects(() => capture({ width: 200, height: 200, marks: [], background: '#fff' }), /layers and marks arrays/);
  await assert.rejects(() => capture({ width: 200, height: 200, layers: [], background: '#fff' }), /layers and marks arrays/);
  await assert.rejects(() => capture({ width: 200, height: 200, layers: [], marks: [] }), /background color string/);
});

test('enforces budget limits for snapshot size, canvas dimensions, marks, layers, and stroke points', async () => {
  const s = sampleSnapshot();
  const hugeSnapshot = sampleSnapshot({ largeData: 'x'.repeat(8 * 1024 * 1024 + 100) });
  await assert.rejects(() => capture(hugeSnapshot), /exceeds 8 MiB budget/);

  await assert.rejects(() => capture(sampleSnapshot({
    document: { ...s.document, width: 4097 }
  })), /exceed maximum allowed of 4096/);

  const tooManyLayers = Array.from({ length: 25 }, (_, i) => ({ id: `l${i}`, name: `L${i}`, visible: true, opacity: 1 }));
  await assert.rejects(() => capture(sampleSnapshot({
    document: { ...s.document, layers: tooManyLayers }
  })), /Layer count \(25\) exceeds maximum limit of 24/);

  const tooManyMarks = Array.from({ length: 3001 }, () => ({ type: 'rect', layer: 'paint', x: 0, y: 0, width: 1, height: 1, color: '#000', opacity: 1 }));
  await assert.rejects(() => capture(sampleSnapshot({
    document: { ...s.document, marks: tooManyMarks }
  })), /Mark count \(3001\) exceeds maximum limit of 3000/);

  const tooManyPoints = Array.from({ length: 2001 }, (_, i) => [i, i]);
  await assert.rejects(() => capture(sampleSnapshot({
    document: {
      ...s.document,
      marks: [{ type: 'stroke', layer: 'paint', brush: 'brush', size: 1, color: '#000', opacity: 1, points: tooManyPoints }]
    }
  })), /Stroke points \(2001\) exceed limit of 2000/);

  await assert.rejects(() => capture(sampleSnapshot({
    document: { ...s.document, width: 4000, height: 4000 }
  }), { scale: 2 }), /exceed maximum limit of 16.*pixels/i);
});

test('validates crop bounds, scale boundaries, timeout, and output options', async () => {
  const s = sampleSnapshot();
  await assert.rejects(() => capture(s, { crop: { x: -5, y: 0, width: 50, height: 50 } }), /exceeds canvas boundaries/);
  await assert.rejects(() => capture(s, { crop: { x: 0, y: 0, width: 500, height: 50 } }), /exceeds canvas boundaries/);
  await assert.rejects(() => capture(s, { crop: { x: 0, y: 0, width: 0, height: 50 } }), /positive numbers/);
  await assert.rejects(() => capture(s, { scale: 0 }), /between 0.05 and 16/);
  await assert.rejects(() => capture(s, { scale: -1 }), /between 0.05 and 16/);
  await assert.rejects(() => capture(s, { scale: 20 }), /between 0.05 and 16/);
  await assert.rejects(() => capture(s, { timeoutMs: 0 }), /positive finite number/);
  await assert.rejects(() => capture(s, { output: '   ' }), /non-empty string path/);
});

test('capture server rejects foreign Host, Origin, and Sec-Fetch-Site to prevent DNS rebinding', async () => {
  const serverInstance = await startCaptureServer({
    document: sampleSnapshot().document, active: null, crop: null, scale: 1,
  });

  try {
    const { port } = serverInstance;
    const foreignHostRes = await rawHttpRequest(port, '/capture.html', { host: 'attacker.evil.com:1234' });
    assert.equal(foreignHostRes.status, 403);

    const foreignOriginRes = await rawHttpRequest(port, '/capture.html', {
      host: `127.0.0.1:${port}`, origin: 'http://attacker.evil.com',
    });
    assert.equal(foreignOriginRes.status, 403);

    const foreignSecFetchRes = await rawHttpRequest(port, '/capture.html', {
      host: `127.0.0.1:${port}`, 'sec-fetch-site': 'cross-site',
    });
    assert.equal(foreignSecFetchRes.status, 403);

    const sameOriginRes = await rawHttpRequest(port, '/capture.html', {
      host: `127.0.0.1:${port}`, 'sec-fetch-site': 'same-origin',
    });
    assert.equal(sameOriginRes.status, 200);

    const notFoundRes = await rawHttpRequest(port, '/unknown-path', {
      host: `127.0.0.1:${port}`,
    });
    assert.equal(notFoundRes.status, 404);
  } finally {
    await serverInstance.close();
  }
});

test('handles non-executable browser binary without crashing Node and cleans up', async () => {
  const nonExecFile = join(tmpdir(), `non-exec-${randomUUID()}.bin`);
  writeFileSync(nonExecFile, '#!/bin/sh\necho hi\n');
  chmodSync(nonExecFile, 0o644); // No execute permissions

  try {
    await assert.rejects(
      () => capture(sampleSnapshot(), { browser: nonExecFile, timeoutMs: 2000 }),
      /Failed to spawn browser process|EACCES/
    );
  } finally {
    try { rmSync(nonExecFile, { force: true }); } catch {}
  }
});

test('terminateBrowser treats signalCode as exited and handles child killed by signal', async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000); process.stdout.write("ready");'],
    { stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    const [ready] = await once(child.stdout, 'data', { signal: AbortSignal.timeout(5000) });
    assert.equal(ready.toString(), 'ready', 'Child must initialize before termination');
    assert.equal(child.exitCode, null);
    assert.equal(child.signalCode, null);
    await terminateBrowser(child, 1000);
    assert.ok(child.exitCode !== null || child.signalCode !== null, 'Child must have an exit or signal code');
    assert.ok(isProcessDead(child.pid), 'Initialized child process must be dead');
    await terminateBrowser(child, 1000); // Already-exited child is a no-op.
  } finally { await terminateBrowser(child, 1000); }
});

test('writePngAtomically aborts without publishing or leaving temporary files', async () => {
  const outPath = join(tmpdir(), `no-publish-${randomUUID()}.png`);
  const controller = new AbortController();
  controller.abort(new Error('Pre-aborted'));

  await assert.rejects(
    () => writePngAtomically(Buffer.from('test'), outPath, controller.signal),
    /Pre-aborted/
  );
  assert.equal(existsSync(outPath), false, 'Target PNG must not be published');
});

test('timeout cleans up before or after mock startup, with no late profiles or output', { timeout: 5000 }, async () => {
  const testRoot = mkdtempSync(join(tmpdir(), 'capture-timeout-test-'));
  const resources = join(testRoot, 'resources');
  mkdirSync(resources);
  const coordFile = join(testRoot, 'coordinates.json');
  const mockScript = join(testRoot, 'browser.mjs');
  const testOutput = join(resources, 'output.png');
  const previousTemp = Object.fromEntries(['TMPDIR', 'TEMP', 'TMP'].map(key => [key, process.env[key]]));

  const mockCode = `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
const userDirArg = process.argv.find(a => a.startsWith('--user-data-dir='));
const profileDir = userDirArg ? userDirArg.split('=')[1] : null;
writeFileSync(${JSON.stringify(coordFile)}, JSON.stringify({ pid: process.pid, profileDir }));
setInterval(() => {}, 1000);
`;
  writeFileSync(mockScript, mockCode);
  chmodSync(mockScript, 0o755);

  try {
    for (const key of Object.keys(previousTemp)) process.env[key] = resources;
    assert.equal(tmpdir(), resources, 'Capture profiles must use the test-owned temporary root');
    const s = sampleSnapshot();
    await assert.rejects(
      () => capture(s, { browser: mockScript, timeoutMs: 800, output: testOutput }),
      /timed out|timeout/i
    );

    const assertClean = () => {
      assert.deepEqual(readdirSync(resources), [], 'No profile, output, or temporary output may remain');
      assert.equal(existsSync(testOutput), false, 'Output file must not exist');
      if (existsSync(coordFile)) {
        const { pid, profileDir } = JSON.parse(readFileSync(coordFile, 'utf8'));
        assert.ok(isProcessDead(pid), `Child browser PID ${pid} must be dead after cleanup`);
        assert.equal(existsSync(profileDir), false, `Profile directory ${profileDir} must be removed`);
      }
    };
    assertClean();
    await new Promise((r) => setTimeout(r, 200));
    assertClean();
  } finally {
    for (const [key, value] of Object.entries(previousTemp)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(testRoot, { recursive: true, force: true });
  }
});

test('interrupt signal aborts capture promptly, prevents output write, and cleans up', async () => {
  const coordFile = join(tmpdir(), `sig-coord-${randomUUID()}.json`);
  const mockScript = join(tmpdir(), `sig-inst-${randomUUID()}.mjs`);
  const testOutput = join(tmpdir(), `sig-no-output-${randomUUID()}.png`);

  const mockCode = `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
const userDirArg = process.argv.find(a => a.startsWith('--user-data-dir='));
const profileDir = userDirArg ? userDirArg.split('=')[1] : null;
writeFileSync(${JSON.stringify(coordFile)}, JSON.stringify({ pid: process.pid, profileDir }));
setInterval(() => {}, 1000);
`;
  writeFileSync(mockScript, mockCode);
  chmodSync(mockScript, 0o755);

  try {
    const s = sampleSnapshot();
    const capturePromise = capture(s, { browser: mockScript, timeoutMs: 10000, output: testOutput });

    setTimeout(() => {
      process.emit('SIGINT');
    }, 300);

    await assert.rejects(
      capturePromise,
      /Capture cancelled due to SIGINT/
    );

    assert.equal(existsSync(testOutput), false, 'Output file must not be written on SIGINT');

    if (existsSync(coordFile)) {
      const { pid, profileDir } = JSON.parse(readFileSync(coordFile, 'utf8'));
      assert.ok(isProcessDead(pid), 'Browser PID must be dead after SIGINT cleanup');
      assert.equal(existsSync(profileDir), false, 'Profile directory must be deleted after SIGINT');
    }
  } finally {
    try { rmSync(coordFile, { force: true }); } catch {}
    try { rmSync(mockScript, { force: true }); } catch {}
    try { rmSync(testOutput, { force: true }); } catch {}
  }
});
