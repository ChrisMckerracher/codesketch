import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { constants as fsConstants, chmodSync, closeSync, mkdtempSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { readLaunchInput, validateManagedResources } from '../src/transport/managed-input.mjs';

const capability = 'a'.repeat(64);
const digest = 'b'.repeat(64);
const launchBody = JSON.stringify({ dataDir: '/tmp/codesketch-data', port: 0, capability, digest });
const launch = chunks => readLaunchInput(Readable.from(chunks));

describe('managed launch input', () => {
  test('consumes chunked valid input and returns the parsed object', async () => {
    const result = await launch([launchBody.slice(0, 12), launchBody.slice(12, 41), launchBody.slice(41)]);
    assert.deepEqual(result, { dataDir: '/tmp/codesketch-data', port: 0, capability, digest });
  });

  test('rejects every bad shape with the same generic message', async () => {
    const cases = [
      ['oversize', [Buffer.from(launchBody), Buffer.alloc(16 * 1024)]],
      ['truncated', [launchBody.slice(0, launchBody.length - 3)]],
      ['malformed', ['{"dataDir":']],
      ['unknown field', [JSON.stringify({ dataDir: '/x', port: 0, capability, digest, extra: 1 })]],
      ['missing field', [JSON.stringify({ dataDir: '/x', port: 0, capability })]],
      ['relative dataDir', [JSON.stringify({ dataDir: 'relative', port: 0, capability, digest })]],
      ['root dataDir', [JSON.stringify({ dataDir: '/', port: 0, capability, digest })]],
      ['privileged port', [JSON.stringify({ dataDir: '/x', port: 80, capability, digest })]],
      ['out of range port', [JSON.stringify({ dataDir: '/x', port: 65536, capability, digest })]],
      ['fractional port', [JSON.stringify({ dataDir: '/x', port: 0.5, capability, digest })]],
      ['string port', [JSON.stringify({ dataDir: '/x', port: '0', capability, digest })]],
      ['uppercase capability', [JSON.stringify({ dataDir: '/x', port: 0, capability: 'A'.repeat(64), digest })]],
      ['short digest', [JSON.stringify({ dataDir: '/x', port: 0, capability, digest: 'b'.repeat(63) })]],
    ];
    for (const [label, chunks] of cases) {
      const error = await launch(chunks).then(() => null, error => error);
      assert.ok(error, `${label} must be rejected`);
      assert.equal(error.message, 'Invalid launch input: expected one JSON object with exactly dataDir, port, capability and digest',
        `${label} errors stay generic`);
    }
  });

  test('errors never echo secrets or input fragments', async () => {
    const token = 'f'.repeat(64);
    const raw = JSON.stringify({ dataDir: '/tmp/secret-data', port: 0, capability: token, digest: 'zz' });
    const error = await launch([raw]).then(() => null, error => error);
    assert.ok(error);
    assert.ok(!error.message.includes(token), 'errors never contain the capability');
    assert.ok(!error.message.includes('secret-data'), 'errors never contain input fragments');
  });
});

const fixtureDir = mkdtempSync(join(tmpdir(), 'codesketch-managed-test-'));
process.on('exit', () => rmSync(fixtureDir, { recursive: true, force: true }));
const childScript = join(fixtureDir, 'child.mjs');
writeFileSync(childScript, [
  "import { fstatSync } from 'node:fs';",
  `import { validateManagedResources } from ${JSON.stringify(new URL('../src/transport/managed-input.mjs', import.meta.url).href)};`,
  'try {',
  '  validateManagedResources(process.argv[2]);',
  '  fstatSync(3);',
  "  process.stdout.write('ok lease-open');",
  '} catch (error) {',
  "  process.stdout.write('error ' + error.message);",
  '}',
].join('\n'), { mode: 0o600 });

function childRun(dataDir, extraFds = []) {
  return spawnSync(process.execPath, [childScript, dataDir], { stdio: ['ignore', 'pipe', 'pipe', ...extraFds] });
}

describe('managed resource validation', () => {
  test('accepts a private data directory with the inherited lease and FIFO pipe', async t => {
    const dataDir = mkdtempSync(join(tmpdir(), 'codesketch-managed-'));
    t.after(() => rmSync(dataDir, { recursive: true, force: true }));
    const lock = join(dataDir, '.writer.lock');
    writeFileSync(lock, 'lease\n', { mode: 0o600 });
    const fifo = join(dataDir, 'ready.fifo');
    spawnSync('mkfifo', ['-m', '600', fifo]);
    const lockFd = openSync(lock, fsConstants.O_RDONLY);
    const fifoFd = openSync(fifo, fsConstants.O_RDONLY | fsConstants.O_NONBLOCK);
    try {
      const result = childRun(dataDir, [lockFd, fifoFd]);
      assert.equal(result.status, 0, result.stderr.toString());
      assert.equal(result.stdout.toString(), 'ok lease-open', 'fd 3 stays open through validation');
    } finally {
      closeSync(lockFd);
      closeSync(fifoFd);
    }
  });

  test('rejects missing lease, foreign lease, non-FIFO readiness and bad directory state', async t => {
    const missing = mkdtempSync(join(tmpdir(), 'codesketch-managed-'));
    t.after(() => rmSync(missing, { recursive: true, force: true }));
    writeFileSync(join(missing, '.writer.lock'), 'lease\n', { mode: 0o600 });
    assert.match(childRun(missing).stdout.toString(), /writer lease/);

    const foreignDir = mkdtempSync(join(tmpdir(), 'codesketch-managed-'));
    t.after(() => rmSync(foreignDir, { recursive: true, force: true }));
    const foreignLock = join(foreignDir, '.writer.lock');
    writeFileSync(foreignLock, 'lease\n', { mode: 0o600 });
    const dataDir = mkdtempSync(join(tmpdir(), 'codesketch-managed-'));
    t.after(() => rmSync(dataDir, { recursive: true, force: true }));
    const lock = join(dataDir, '.writer.lock');
    writeFileSync(lock, 'lease\n', { mode: 0o600 });
    const fifo = join(dataDir, 'ready.fifo');
    spawnSync('mkfifo', ['-m', '600', fifo]);
    const foreignFd = openSync(foreignLock, fsConstants.O_RDONLY);
    const regularFd = openSync(lock, fsConstants.O_RDONLY);
    const fifoFd = openSync(fifo, fsConstants.O_RDONLY | fsConstants.O_NONBLOCK);
    try {
      assert.match(childRun(dataDir, [foreignFd, fifoFd]).stdout.toString(), /\.writer\.lock/,
        'a foreign lease cannot stand in');
      assert.match(childRun(dataDir, [regularFd, regularFd]).stdout.toString(), /FIFO/);
    } finally {
      closeSync(foreignFd);
      closeSync(regularFd);
      closeSync(fifoFd);
    }

    const permissive = mkdtempSync(join(tmpdir(), 'codesketch-managed-'), { mode: 0o700 });
    t.after(() => rmSync(permissive, { recursive: true, force: true }));
    chmodSync(permissive, 0o755);
    assert.match(childRun(permissive).stdout.toString(), /private/);

    const recoveryDir = mkdtempSync(join(tmpdir(), 'codesketch-managed-'));
    t.after(() => rmSync(recoveryDir, { recursive: true, force: true }));
    writeFileSync(join(recoveryDir, '.writer.lock'), 'lease\n', { mode: 0o600 });
    await writeFile(join(recoveryDir, 'recovery.json'), '{}\n', { mode: 0o644 });
    assert.match(childRun(recoveryDir).stdout.toString(), /recovery\.json must be private/);
  });
});
