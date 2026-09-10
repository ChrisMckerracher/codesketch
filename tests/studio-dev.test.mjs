import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer, request as httpRequest } from 'node:http';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePort } from '../tools/studio-dev.mjs';

const LAUNCHER = fileURLToPath(new URL('../tools/studio-dev.mjs', import.meta.url));
const URL_LINE = /http:\/\/127\.0\.0\.1:(\d+)/;

function startLauncher(args = [], env = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'studio-dev-'));
  const child = spawn(process.execPath, [LAUNCHER, ...args], {
    cwd,
    env: { ...process.env, PORT: '', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const run = { child, cwd, stdoutText: '', stderrText: '', exited: once(child, 'exit') };
  child.stdout.on('data', chunk => { run.stdoutText += chunk; });
  child.stderr.on('data', chunk => { run.stderrText += chunk; });
  return run;
}

function waitFor(run, regex, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let timer = null;
    const scan = () => {
      const match = run.stdoutText.match(regex);
      if (!match) return;
      run.child.stdout.off('data', scan);
      clearTimeout(timer);
      resolve(match);
    };
    timer = setTimeout(() => {
      run.child.stdout.off('data', scan);
      reject(new Error(`timed out waiting for ${regex}; stdout: ${JSON.stringify(run.stdoutText)}; stderr: ${JSON.stringify(run.stderrText)}`));
    }, timeoutMs);
    run.child.stdout.on('data', scan);
    scan();
  });
}

async function cleanup(run) {
  if (run.child.exitCode === null && run.child.signalCode === null) {
    run.child.kill('SIGKILL');
    await run.exited;
  }
  rmSync(run.cwd, { recursive: true, force: true });
}

function get(port, path) {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest({ host: '127.0.0.1', port, path, headers: { connection: 'close' } }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, type: response.headers['content-type'] ?? '', body }));
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

function assertRebindable(port) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve()));
  });
}

test('parsePort defaults to 0 and accepts the registered port range', () => {
  assert.equal(parsePort(undefined), 0);
  assert.equal(parsePort(''), 0);
  assert.equal(parsePort(' 0 '), 0);
  assert.equal(parsePort('1024'), 1024);
  assert.equal(parsePort('65535'), 65535);
});

test('parsePort rejects malformed, privileged, oversized, and production ports', () => {
  assert.throws(() => parsePort('abc'), /Invalid port 'abc'/);
  assert.throws(() => parsePort('-1'), /Invalid port '-1'/);
  assert.throws(() => parsePort('8.5'), /Invalid port/);
  assert.throws(() => parsePort('80'), /privileged/);
  assert.throws(() => parsePort('1023'), /privileged/);
  assert.throws(() => parsePort('65536'), /65535/);
  assert.throws(() => parsePort('4317'), /4317.*production/s);
});

test('launcher serves an in-memory studio on an ephemeral port and exits cleanly on SIGTERM', async () => {
  const run = startLauncher();
  try {
    const match = await waitFor(run, URL_LINE);
    const port = Number(match[1]);
    assert.ok(port > 0 && port <= 65535, `expected an actual ephemeral port, got ${port}`);
    const page = await get(port, '/');
    assert.equal(page.status, 404, 'the browser shell was removed; root has no HTML fallback');
    assert.equal(page.type, 'application/json');
    assert.deepEqual(JSON.parse(page.body), { error: 'Not found' });
    const state = await get(port, '/api/state');
    assert.equal(state.status, 200);
    const snapshot = JSON.parse(state.body);
    assert.ok(snapshot.instanceId, 'expected an in-memory session identity');
    run.child.kill('SIGTERM');
    const [code, signal] = await run.exited;
    assert.equal(code, 0);
    assert.equal(signal, null);
    assert.equal(existsSync(join(run.cwd, '.studio')), false, 'development launcher must not create persistence files');
    await assertRebindable(port);
  } finally {
    await cleanup(run);
  }
});

test('launcher exits cleanly on SIGINT', async () => {
  const run = startLauncher();
  try {
    await waitFor(run, URL_LINE);
    run.child.kill('SIGINT');
    const [code] = await run.exited;
    assert.equal(code, 0);
  } finally {
    await cleanup(run);
  }
});

test('launcher runs on PORT=N and refuses the production port before listening', async () => {
  const run = startLauncher([], { PORT: '4317' });
  try {
    const [code, signal] = await run.exited;
    assert.equal(code, 2, `expected an invocation rejection, got exit ${code}/${signal}`);
    assert.match(run.stderrText, /4317/);
    assert.match(run.stderrText, /production/);
    assert.match(run.stderrText, /PORT/);
    assert.doesNotMatch(run.stdoutText, URL_LINE, 'the launcher must reject 4317 before listening');
  } finally {
    await cleanup(run);
  }
});

test('launcher rejects any command-line arguments with concise PORT usage', async () => {
  for (const args of [['--port=5000'], ['--port', '5000'], ['extra']]) {
    const run = startLauncher(args);
    try {
      const [code] = await run.exited;
      assert.equal(code, 2, `expected rejection for ${JSON.stringify(args)}, got exit ${code}`);
      assert.match(run.stderrText, /unexpected arguments/);
      assert.match(run.stderrText, /PORT=/);
      assert.doesNotMatch(run.stdoutText, URL_LINE);
    } finally {
      await cleanup(run);
    }
  }
});

test('launcher rejects other invalid PORT values with actionable errors', async () => {
  for (const [value, pattern] of [['80', /privileged/], ['70000', /65535/], ['abc', /Invalid port/]]) {
    const run = startLauncher([], { PORT: value });
    try {
      const [code] = await run.exited;
      assert.equal(code, 2, `expected rejection for ${value}, got exit ${code}`);
      assert.match(run.stderrText, pattern);
      assert.doesNotMatch(run.stdoutText, URL_LINE);
    } finally {
      await cleanup(run);
    }
  }
});
