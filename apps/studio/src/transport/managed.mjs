import { closeSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLaunchInput, validateManagedResources } from './managed-input.mjs';
import { publishOwnership, removeOwnership } from './ownership.mjs';
import { verifyRuntime } from './runtime-manifest.mjs';
import { createStudio } from './server.mjs';

const STDERR_BUDGET = 64 * 1024;
const ERROR_LIMIT = 4 * 1024;
const CLOSE_TIMEOUT_MS = 2000;
let stderrSpent = 0;

function note(message) {
  if (stderrSpent >= STDERR_BUDGET) return;
  const capped = Buffer.from(`${message}\n`, 'utf8').subarray(0, Math.min(ERROR_LIMIT, STDERR_BUDGET - stderrSpent));
  stderrSpent += capped.length;
  try {
    writeSync(2, capped);
  } catch {}
}

function redact(text, secrets) {
  let output = String(text);
  for (const secret of secrets) {
    if (secret) output = output.split(secret).join('[redacted]');
  }
  return output;
}

function emitReadyFrame(frame) {
  const buffer = Buffer.from(frame, 'utf8').subarray(0, 16 * 1024);
  let written = 0;
  try {
    while (written < buffer.length) {
      written += writeSync(4, buffer, written, buffer.length - written);
    }
  } catch {}
  try {
    closeSync(4);
  } catch {}
}

function closeListener(server) {
  return new Promise(resolve => {
    let timer = null;
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve();
    };
    server.close(settle);
    server.closeIdleConnections();
    timer = setTimeout(() => server.closeAllConnections(), CLOSE_TIMEOUT_MS);
    timer.unref();
  });
}

export async function runManaged() {
  const secrets = [];
  let studio = null;
  let published = null;
  let input = null;
  let dataDir = null;
  try {
    const [major] = process.versions.node.split('.').map(Number);
    if (!Number.isInteger(major) || major < 22) throw new Error('managed studios require Node 22 or newer');
    input = await readLaunchInput(process.stdin);
    secrets.push(input.capability, input.digest);
    dataDir = input.dataDir;
    validateManagedResources(dataDir);
    const root = fileURLToPath(new URL('../../', import.meta.url));
    await verifyRuntime(root, input.digest);
    studio = await createStudio({ root, persistence: join(input.dataDir, 'recovery.json'),
      lifecycle: { capability: input.capability, digest: input.digest } });
    await new Promise((resolve, reject) => {
      studio.server.once('error', reject);
      studio.server.listen(input.port, '127.0.0.1', resolve);
    });
    const url = `http://127.0.0.1:${studio.server.address().port}`;
    published = { instanceId: studio.session.instanceId, pid: process.pid, url,
      digest: input.digest, capability: input.capability };
    await publishOwnership(input.dataDir, published);
    studio.markReady();
    emitReadyFrame(`${JSON.stringify({ instanceId: published.instanceId, pid: process.pid, url,
      digest: input.digest, state: 'running' })}\n`);
    studio.server.on('close', () => {
      removeOwnership(input.dataDir, published)
        .catch(() => note('the ownership record could not be removed; it stays stale metadata'))
        .finally(() => process.exit(0));
    });
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.on(signal, () => {
        studio.shutdown()
          .catch(error => note(redact(`flush failed; the studio stays paused and live: ${error.message}`, secrets)));
      });
    }
    note(`managed studio listening at ${url}`);
    return studio;
  } catch (error) {
    if (studio?.server?.listening) await closeListener(studio.server);
    if (published) await removeOwnership(input.dataDir, published).catch(() => {});
    note(`managed startup failed: ${redact(error.message, secrets).slice(0, ERROR_LIMIT)}`);
    process.exit(1);
  }
}

await runManaged();
