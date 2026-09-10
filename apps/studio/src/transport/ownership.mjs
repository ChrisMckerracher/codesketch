import { randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const HEX64 = /^[0-9a-f]{64}$/;
const RECORD_NAME = 'lifecycle.json';
const RECORD_LIMIT = 16 * 1024;

export function validateRecord(value) {
  const keys = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value) : [];
  if (keys.length !== 5 || !['instanceId', 'pid', 'url', 'digest', 'capability'].every(key => keys.includes(key))) {
    throw new Error('The ownership record requires exactly instanceId, pid, url, digest and capability');
  }
  const { instanceId, pid, url, digest, capability } = value;
  if (typeof instanceId !== 'string' || !instanceId || instanceId.length > 256) {
    throw new Error('The ownership instanceId must be a nonempty bounded string');
  }
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('The ownership pid must be a positive integer');
  const literal = typeof url === 'string' ? /^http:\/\/127\.0\.0\.1:([0-9]+)$/.exec(url) : null;
  const port = literal ? Number(literal[1]) : 0;
  if (!literal || port < 1 || port > 65535 || String(port) !== literal[1]) {
    throw new Error('The ownership url must be exactly http://127.0.0.1:<port> with canonical digits');
  }
  if (typeof digest !== 'string' || !HEX64.test(digest)) throw new Error('The ownership digest must be 64 lowercase hex characters');
  if (typeof capability !== 'string' || !HEX64.test(capability)) throw new Error('The ownership capability must be 64 lowercase hex characters');
  return Object.freeze({ instanceId, pid, url, digest, capability });
}

function recordPath(dataDir) {
  return join(dataDir, RECORD_NAME);
}

function sameRecord(a, b) {
  return ['instanceId', 'pid', 'url', 'digest', 'capability'].every(key => a[key] === b[key]);
}

async function syncDirectory(dataDir) {
  const handle = await open(dataDir, fsConstants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function readOwnership(dataDir) {
  const path = recordPath(dataDir);
  const stats = await lstat(path).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (stats === null) return null;
  if (stats.isSymbolicLink() || !stats.isFile()) throw new Error('The ownership record must be a regular file and not a symlink');
  if ((stats.mode & 0o077) !== 0) throw new Error('The ownership record must be private');
  if (typeof process.getuid === 'function' && stats.uid !== process.getuid()) {
    throw new Error('The ownership record must be owned by the current user');
  }
  if (stats.size > RECORD_LIMIT) throw new Error(`The ownership record exceeds the 16 KiB limit (${stats.size} bytes)`);
  const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK).catch(error => {
    if (error.code === 'ELOOP') throw new Error('The ownership record must not be a symlink');
    throw error;
  });
  try {
    const live = await handle.stat();
    if (!live.isFile() || (live.mode & 0o077) !== 0) throw new Error('The ownership record must be a private regular file');
    if (typeof process.getuid === 'function' && live.uid !== process.getuid()) {
      throw new Error('The ownership record must be owned by the current user');
    }
    if (live.size > RECORD_LIMIT) throw new Error(`The ownership record exceeds the 16 KiB limit (${live.size} bytes)`);
    const bytes = Buffer.alloc(RECORD_LIMIT + 1);
    let read = 0;
    while (read <= RECORD_LIMIT) {
      const { bytesRead } = await handle.read(bytes, read, RECORD_LIMIT + 1 - read, null);
      if (bytesRead === 0) break;
      read += bytesRead;
    }
    if (read > RECORD_LIMIT) throw new Error(`The ownership record exceeds the 16 KiB limit (${read} bytes)`);
    if (read < live.size) throw new Error('The ownership record shrank while it was read');
    let parsed;
    try {
      parsed = JSON.parse(bytes.subarray(0, read).toString('utf8'));
    } catch {
      throw new Error('The ownership record must be valid JSON');
    }
    return validateRecord(parsed);
  } finally {
    await handle.close();
  }
}

export async function publishOwnership(dataDir, record) {
  const validated = validateRecord(record);
  const path = recordPath(dataDir);
  let existing = false;
  try {
    await lstat(path);
    existing = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (existing) throw new Error('An ownership record already exists; Node never replaces ownership');
  const bytes = Buffer.from(`${JSON.stringify(validated)}\n`, 'utf8');
  if (bytes.length > RECORD_LIMIT) throw new Error('The ownership record exceeds the 16 KiB limit');
  const temp = join(dataDir, `.lifecycle.${randomBytes(8).toString('hex')}.tmp`);
  const handle = await open(temp, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600);
  let renamed = false;
  let closed = false;
  try {
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    closed = true;
    await rename(temp, path);
    renamed = true;
    try {
      await syncDirectory(dataDir);
    } catch (syncError) {
      try {
        await removeOwnership(dataDir, validated);
      } catch {}
      throw new Error(`Ownership publication could not sync its directory: ${syncError.message}`);
    }
  } catch (error) {
    if (!closed) await handle.close().catch(() => {});
    if (!renamed) await unlink(temp).catch(() => {});
    throw error;
  }
  return validated;
}

export async function removeOwnership(dataDir, expected) {
  const wanted = validateRecord(expected);
  const current = await readOwnership(dataDir);
  if (current === null) return false;
  if (!sameRecord(current, wanted)) throw new Error('A different ownership record is preserved');
  await unlink(recordPath(dataDir));
  await syncDirectory(dataDir);
  return true;
}
