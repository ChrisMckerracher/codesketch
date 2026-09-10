import { fstatSync, lstatSync } from 'node:fs';
import { join } from 'node:path';

const HEX64 = /^[0-9a-f]{64}$/;
const LAUNCH_LIMIT = 16 * 1024;
const INVALID_LAUNCH = 'Invalid launch input: expected one JSON object with exactly dataDir, port, capability and digest';

function invalidLaunch() {
  return new Error(INVALID_LAUNCH);
}

export async function readLaunchInput(readable) {
  let size = 0;
  const chunks = [];
  for await (const chunk of readable) {
    size += chunk.length;
    if (size > LAUNCH_LIMIT) throw invalidLaunch();
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw invalidLaunch();
  }
  const keys = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? Object.keys(parsed) : [];
  if (keys.length !== 4 || !['dataDir', 'port', 'capability', 'digest'].every(key => keys.includes(key))) {
    throw invalidLaunch();
  }
  const { dataDir, port, capability, digest } = parsed;
  if (typeof dataDir !== 'string' || !dataDir.startsWith('/') || dataDir.length < 2) throw invalidLaunch();
  if (!Number.isSafeInteger(port) || (port !== 0 && (port < 1024 || port > 65535))) throw invalidLaunch();
  if (typeof capability !== 'string' || !HEX64.test(capability)) throw invalidLaunch();
  if (typeof digest !== 'string' || !HEX64.test(digest)) throw invalidLaunch();
  return { dataDir, port, capability, digest };
}

function requireCurrentOwner(label, stats) {
  if (typeof process.getuid === 'function' && stats.uid !== process.getuid()) {
    throw new Error(`${label} must be owned by the current user`);
  }
}

export function validateManagedResources(dataDir) {
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    throw new Error('Managed studios run on Mac and Linux only');
  }
  const root = lstatSync(dataDir, { throwIfNoEntry: false });
  if (root === undefined) throw new Error('The managed data directory is missing');
  if (root.isSymbolicLink() || !root.isDirectory()) throw new Error('The managed data directory must be a real directory, not a symlink');
  if ((root.mode & 0o077) !== 0) throw new Error('The managed data directory must be private');
  requireCurrentOwner('The managed data directory', root);
  const lock = lstatSync(join(dataDir, '.writer.lock'), { throwIfNoEntry: false });
  if (lock === undefined) throw new Error('The writer lease file .writer.lock is missing');
  if (lock.isSymbolicLink()) throw new Error('.writer.lock must not be a symlink');
  if (!lock.isFile()) throw new Error('.writer.lock must be a regular file');
  if ((lock.mode & 0o077) !== 0) throw new Error('.writer.lock must be private');
  requireCurrentOwner('.writer.lock', lock);
  const recovery = lstatSync(join(dataDir, 'recovery.json'), { throwIfNoEntry: false });
  if (recovery !== undefined) {
    if (recovery.isSymbolicLink() || !recovery.isFile()) throw new Error('recovery.json must be a regular file and not a symlink');
    if ((recovery.mode & 0o077) !== 0) throw new Error('recovery.json must be private');
    requireCurrentOwner('recovery.json', recovery);
  }
  let lease;
  try {
    lease = fstatSync(3);
  } catch {
    throw new Error('The inherited writer lease must be provided as file descriptor 3');
  }
  if (!lease.isFile()) throw new Error('The inherited writer lease fd 3 must be a regular file');
  if ((lease.mode & 0o077) !== 0) throw new Error('The inherited writer lease must be private');
  requireCurrentOwner('The inherited writer lease', lease);
  if (lease.dev !== lock.dev || lease.ino !== lock.ino) {
    throw new Error('The inherited writer lease fd 3 must be the data directory .writer.lock');
  }
  let ready;
  try {
    ready = fstatSync(4);
  } catch {
    throw new Error('The private readiness pipe must be provided as file descriptor 4');
  }
  if (!ready.isFIFO()) throw new Error('The inherited readiness fd 4 must be a FIFO pipe');
}
