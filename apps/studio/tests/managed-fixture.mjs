// Shared managed-lifecycle launch fixtures: isolated runtime copies, private
// data directories with real descriptor-based launch inputs, and child
// processes whose exit promises register at spawn. Teardown reaps children
// (awaiting the real exit event, never the synthetic timeout) before
// restoring directory 0700, closing descriptors, and removing owned temps.
// These fixtures validate descriptor identity only; real flock lease
// lifetime is covered independently by native Go tests.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as fsConstants, closeSync, cpSync, mkdtempSync, openSync, readSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { chmod, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Session } from '../src/direction/index.mjs';

export const capability = 'a'.repeat(64);
const CAPTURE_BUDGET = 128 * 1024;
const studioRoot = fileURLToPath(new URL('..', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function until(produce, timeoutMs = 8000, stepMs = 25, label = 'the expected condition') {
  const started = Date.now();
  for (;;) {
    if (await produce()) return;
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out after ${timeoutMs}ms waiting for ${label}`);
    await wait(stepMs);
  }
}

function manifestBytes(entries) {
  const normalized = { files: entries.map(({ path, size, sha256: hash }) => ({ path, size, sha256: hash })) };
  return Buffer.from(`${JSON.stringify(normalized)}\n`, 'utf8');
}

export async function buildRuntime(t) {
  const root = await mkdtemp(join(tmpdir(), 'codesketch-launch-runtime-'));
  const owned = [];
  t.after(async () => {
    await Promise.allSettled(owned.splice(0).map(reap => reap()));
    await rm(root, { recursive: true, force: true });
  });
  cpSync(join(studioRoot, 'src'), join(root, 'src'), { recursive: true });
  cpSync(join(studioRoot, 'public'), join(root, 'public'), { recursive: true });
  const entries = [];
  async function normalize(relative) {
    for (const dirent of await readdir(join(root, relative), { withFileTypes: true })) {
      const path = relative ? `${relative}/${dirent.name}` : dirent.name;
      if (dirent.isDirectory()) {
        await chmod(join(root, ...path.split('/')), 0o700);
        await normalize(path);
      } else if (dirent.name === 'AGENTS.md' || /^README(\.|$)/i.test(dirent.name)) {
        await rm(join(root, ...path.split('/')));
      } else {
        await chmod(join(root, ...path.split('/')), 0o600);
        const body = await readFile(join(root, ...path.split('/')));
        entries.push({ path, size: body.length, sha256: sha256(body) });
      }
    }
  }
  await normalize('');
  async function prune(relative) {
    for (const dirent of await readdir(join(root, relative), { withFileTypes: true })) {
      const path = relative ? `${relative}/${dirent.name}` : dirent.name;
      if (dirent.isDirectory()) {
        await prune(path);
        if ((await readdir(join(root, ...path.split('/')))).length === 0) {
          await rm(join(root, ...path.split('/')), { recursive: true });
        }
      }
    }
  }
  await prune('');
  entries.sort((a, b) => (a.path < b.path ? -1 : 1));
  const bytes = manifestBytes(entries);
  writeFileSync(join(root, 'runtime-manifest.json'), bytes, { mode: 0o600 });
  return { root, owned, digest: sha256(bytes) };
}

export async function launchFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'codesketch-launch-data-'));
  const owned = [];
  writeFileSync(join(dataDir, '.writer.lock'), 'lease\n', { mode: 0o600 });
  const fifo = join(dataDir, 'ready.fifo');
  spawnSync('mkfifo', ['-m', '600', fifo]);
  const lockFd = openSync(join(dataDir, '.writer.lock'), fsConstants.O_RDONLY);
  const readerFd = openSync(fifo, fsConstants.O_RDONLY | fsConstants.O_NONBLOCK);
  const writerFd = openSync(fifo, fsConstants.O_WRONLY | fsConstants.O_NONBLOCK);
  const closed = new Set();
  const closeOnce = fd => {
    if (!closed.has(fd)) {
      closed.add(fd);
      closeSync(fd);
    }
  };
  t.after(async () => {
    await Promise.allSettled(owned.splice(0).map(reap => reap()));
    await chmod(dataDir, 0o700).catch(() => {});
    closeOnce(lockFd);
    closeOnce(readerFd);
    closeOnce(writerFd);
    await rm(dataDir, { recursive: true, force: true });
  });
  return { dataDir, owned, lockFd, readerFd, writerFd, closeOnce };
}

export function launchChild(t, runtime, fixture, inputOverride, options = {}) {
  const { dataDir, lockFd, writerFd } = fixture;
  const child = spawn(process.execPath, [...(options.execArgv ?? []),
    join(runtime.root, 'src', 'transport', 'managed.mjs')],
    { env: options.env ?? process.env, stdio: ['pipe', 'pipe', 'pipe', lockFd, writerFd] });
  const diagnostics = { stdout: { bytes: 0, text: '' }, stderr: { bytes: 0, text: '' } };
  const capture = key => chunk => {
    diagnostics[key].bytes += chunk.length;
    if (diagnostics[key].text.length >= CAPTURE_BUDGET) return;
    diagnostics[key].text = (diagnostics[key].text + chunk.toString('utf8')).slice(0, CAPTURE_BUDGET);
  };
  child.stdout.on('data', capture('stdout'));
  child.stderr.on('data', capture('stderr'));
  const exited = new Promise(resolve => {
    const timer = setTimeout(() => {
      child.removeListener('exit', onExit);
      resolve({ code: null, signal: 'timeout' });
    }, 15000);
    timer.unref?.();
    const onExit = (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    };
    child.once('exit', onExit);
  });
  const reaped = new Promise(resolve => child.once('exit', () => resolve()));
  const reap = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await reaped;
  };
  runtime.owned.push(reap);
  fixture.owned.push(reap);
  t.after(reap);
  child.stdin.end(typeof inputOverride === 'string'
    ? inputOverride
    : JSON.stringify({ dataDir, port: 0, capability, digest: runtime.digest, ...inputOverride }));
  return { child, exited,
    stderr: () => diagnostics.stderr.text, stdout: () => diagnostics.stdout.text,
    stderrBytes: () => diagnostics.stderr.bytes, stdoutBytes: () => diagnostics.stdout.bytes };
}

export function readFrame(fifoFd, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    let text = '';
    const started = Date.now();
    const timer = setInterval(() => {
      const buffer = Buffer.alloc(4096);
      let bytes = 0;
      try {
        bytes = readSync(fifoFd, buffer, 0, 4096);
      } catch {}
      if (bytes > 0) text += buffer.subarray(0, bytes).toString('utf8');
      if (text.includes('\n')) {
        clearInterval(timer);
        resolve(JSON.parse(text));
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error('no readiness frame arrived'));
      }
    }, 25);
  });
}

export function pendingFrameBytes(fifoFd) {
  try {
    return readSync(fifoFd, Buffer.alloc(64), 0, 64);
  } catch {
    return 0;
  }
}

export function request(port, method, path, headers, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null') }));
    });
    req.setTimeout(5000, () => req.destroy(new Error('client timeout')));
    req.on('error', reject);
    if (body === undefined) req.end(); else req.end(body);
  });
}

// A valid partial-playback recovery envelope built by the real Session:
// one committed stroke, a partial active stroke, and one queued command.
export function partialStrokeRecovery() {
  const session = new Session();
  session.submit({ commands: [{ type: 'stroke', points: [[0, 0], [100, 0]] }],
    immediate: true, source: 'human' });
  session.submit({ commands: [{ type: 'stroke', points: [[5, 5], [60, 60]] }, { type: 'fill', color: '#112233' }],
    play: false, source: 'human' });
  session.control('speed', 0.25, { source: 'human' });
  session.control('resume', undefined, { source: 'human' });
  session.tick(40);
  session.control('pause', undefined, { source: 'human' });
  const recovery = session.recovery();
  assert.ok(recovery.active, 'the fixture must hold a partial active stroke');
  assert.ok(recovery.active.progress > 0 && recovery.active.progress < 1,
    'the fixture active stroke must be partial');
  assert.equal(recovery.project.queue.length, 2,
    'the fixture project queue must hold the active head plus one queued command');
  return recovery;
}

export function recoveryBytes(recovery) {
  return Buffer.from(`${JSON.stringify(recovery)}\n`, 'utf8');
}
