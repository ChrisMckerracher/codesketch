import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const HEX64 = /^[0-9a-f]{64}$/;
const PATH_SEGMENT = /^[A-Za-z0-9_.-]+$/;
const MANIFEST_NAME = 'runtime-manifest.json';
const MANIFEST_LIMIT = 1024 * 1024;
const CHUNK_BYTES = 64 * 1024;

function reject(message) {
  throw new Error(`Runtime verification failed: ${message}`);
}

function sha256Hex(chunk) {
  return createHash('sha256').update(chunk).digest('hex');
}

function validManifestPath(path) {
  if (path === '' || path.startsWith('/') || path.includes('\\')) return false;
  return path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..'
    && PATH_SEGMENT.test(segment));
}

function checkPrivateRegular(relative, stats) {
  if (!stats.isFile()) reject(`${relative} is not a regular file`);
  if ((stats.mode & 0o077) !== 0) reject(`${relative} is not private`);
  if (typeof process.getuid === 'function' && stats.uid !== process.getuid()) {
    reject(`${relative} is not owned by the current user`);
  }
}

async function openNoFollow(root, relative, missingMessage) {
  return open(join(root, ...relative.split('/')), fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
    .catch(error => {
      if (error.code === 'ENOENT') reject(missingMessage);
      if (error.code === 'ELOOP') reject(`${relative} is a symbolic link`);
      throw error;
    });
}

async function readBounded(root, relative, size, growthMessage) {
  const handle = await openNoFollow(root, relative, `${relative} is missing from the runtime tree`);
  try {
    const stats = await handle.stat();
    checkPrivateRegular(relative, stats);
    if (stats.size !== size) reject(`${relative} is ${stats.size} bytes but ${size} were declared`);
    const bytes = Buffer.alloc(size + 1);
    let read = 0;
    while (read < size + 1) {
      const { bytesRead } = await handle.read(bytes, read, size + 1 - read, null);
      if (bytesRead === 0) break;
      read += bytesRead;
    }
    if (read > size) reject(growthMessage);
    if (read < size) reject(`${relative} ended before its declared size`);
    return bytes.subarray(0, size);
  } finally {
    await handle.close();
  }
}

async function streamDigest(root, relative, size, expectedSha256) {
  const handle = await openNoFollow(root, relative, `${relative} is missing from the runtime tree`);
  try {
    const stats = await handle.stat();
    checkPrivateRegular(relative, stats);
    if (stats.size !== size) reject(`${relative} is ${stats.size} bytes but the manifest declares ${size}`);
    const hash = createHash('sha256');
    const chunk = Buffer.alloc(CHUNK_BYTES);
    let read = 0;
    while (read < size) {
      const length = Math.min(CHUNK_BYTES, size - read);
      const { bytesRead } = await handle.read(chunk, 0, length, null);
      if (bytesRead === 0) reject(`${relative} ended before its declared size`);
      hash.update(chunk.subarray(0, bytesRead));
      read += bytesRead;
    }
    const extra = Buffer.alloc(1);
    if ((await handle.read(extra, 0, 1, null)).bytesRead !== 0) {
      reject(`${relative} grew beyond its declared size`);
    }
    const digest = hash.digest('hex');
    if (digest !== expectedSha256) reject(`${relative} bytes do not match the manifest sha256`);
  } finally {
    await handle.close();
  }
}

async function readManifest(root, expectedDigest) {
  const relative = MANIFEST_NAME;
  const stats = await lstat(join(root, relative)).catch(error => {
    if (error.code === 'ENOENT') reject(`${relative} is missing from the runtime root`);
    throw error;
  });
  checkPrivateRegular(relative, stats);
  if (stats.size > MANIFEST_LIMIT) reject(`${relative} exceeds the 1 MiB limit (${stats.size} bytes)`);
  const bytes = await readBounded(root, relative, stats.size, `${relative} grew beyond its declared size`);
  if (sha256Hex(bytes) !== expectedDigest) {
    reject(`${relative} bytes do not hash to the expected runtime digest`);
  }
  return bytes;
}

function parseManifest(bytes) {
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    reject(`${MANIFEST_NAME} is not valid UTF-8 JSON`);
  }
  const shape = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    && Object.keys(parsed).length === 1 && Object.hasOwn(parsed, 'files') && Array.isArray(parsed.files);
  if (!shape) reject(`runtime manifest must be exactly {"files":[...]}`);
  const entries = [];
  for (const entry of parsed.files) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      reject('manifest entries must be JSON objects');
    }
    const keys = Object.keys(entry);
    if (keys.length !== 3 || !keys.includes('path') || !keys.includes('size') || !keys.includes('sha256')) {
      reject('manifest entries require exactly the keys path, size and sha256');
    }
    if (typeof entry.path !== 'string' || !validManifestPath(entry.path)) {
      reject(`manifest path violates the path contract: ${JSON.stringify(entry.path)}`);
    }
    if (entry.path === MANIFEST_NAME) reject('the manifest must not list itself in the inventory');
    if (!Number.isSafeInteger(entry.size) || entry.size < 0) {
      reject(`manifest size for ${entry.path} must be a nonnegative safe integer`);
    }
    if (typeof entry.sha256 !== 'string' || !HEX64.test(entry.sha256)) {
      reject(`manifest sha256 for ${entry.path} must be 64 lowercase hex characters`);
    }
    entries.push({ path: entry.path, size: entry.size, sha256: entry.sha256 });
  }
  for (let index = 1; index < entries.length; index += 1) {
    if (!(entries[index].path > entries[index - 1].path)) {
      reject('manifest entries must be strictly ascending by path with no duplicates');
    }
  }
  return entries;
}

function canonicalBytes(entries) {
  const normalized = {
    files: entries.map(({ path, size, sha256: hash }) => ({ path, size, sha256: hash })),
  };
  return Buffer.from(`${JSON.stringify(normalized)}\n`, 'utf8');
}

async function verifyTree(root, entries) {
  const expectedFiles = new Set(entries.map(entry => entry.path));
  const expectedDirs = new Set();
  for (const entry of entries) {
    const segments = entry.path.split('/');
    segments.pop();
    let prefix = '';
    for (const segment of segments) {
      prefix = prefix ? `${prefix}/${segment}` : segment;
      expectedDirs.add(prefix);
    }
  }
  const actualFiles = new Set([MANIFEST_NAME]);
  const actualDirs = new Set();
  async function walk(relative) {
    for (const dirent of await readdir(join(root, relative), { withFileTypes: true })) {
      const path = relative ? `${relative}/${dirent.name}` : dirent.name;
      if (dirent.isSymbolicLink()) reject(`${path} is a symbolic link`);
      if (dirent.isDirectory()) {
        if (!expectedDirs.has(path)) reject(`${path} is not implied by the manifest inventory`);
        actualDirs.add(path);
        const stats = await lstat(join(root, ...path.split('/')));
        if ((stats.mode & 0o077) !== 0) reject(`${path} is not private`);
        if (typeof process.getuid === 'function' && stats.uid !== process.getuid()) {
          reject(`${path} is not owned by the current user`);
        }
        await walk(path);
      } else if (dirent.isFile()) actualFiles.add(path);
      else reject(`${path} is not a regular file or directory`);
    }
  }
  await walk('');
  for (const dir of actualDirs) {
    if (!expectedDirs.has(dir)) reject(`${dir} is not implied by the manifest inventory`);
  }
  for (const dir of expectedDirs) {
    if (!actualDirs.has(dir)) reject(`${dir} is missing from the runtime tree`);
  }
  for (const file of actualFiles) {
    if (file !== MANIFEST_NAME && !expectedFiles.has(file)) {
      reject(`${file} is not listed in the manifest inventory`);
    }
  }
  for (const entry of entries) {
    const stats = await lstat(join(root, ...entry.path.split('/'))).catch(error => {
      if (error.code === 'ENOENT') reject(`${entry.path} is missing from the runtime tree`);
      throw error;
    });
    checkPrivateRegular(entry.path, stats);
    if (stats.size !== entry.size) {
      reject(`${entry.path} is ${stats.size} bytes but the manifest declares ${entry.size}`);
    }
    await streamDigest(root, entry.path, entry.size, entry.sha256);
  }
}

export async function verifyRuntime(root, expectedDigest) {
  if (typeof expectedDigest !== 'string' || !HEX64.test(expectedDigest)) {
    reject('the expected runtime digest must be 64 lowercase hex characters');
  }
  const rootStats = await lstat(root).catch(error => {
    if (error.code === 'ENOENT') reject('the runtime root is missing');
    throw error;
  });
  if (!rootStats.isDirectory()) reject('the runtime root is not a directory');
  if ((rootStats.mode & 0o077) !== 0) reject('the runtime root is not private');
  if (typeof process.getuid === 'function' && rootStats.uid !== process.getuid()) {
    reject('the runtime root is not owned by the current user');
  }
  const bytes = await readManifest(root, expectedDigest);
  const entries = parseManifest(bytes);
  const canonical = canonicalBytes(entries);
  if (canonical.length !== bytes.length || !canonical.equals(bytes)) {
    reject(`${MANIFEST_NAME} is not the canonical frozen encoding`);
  }
  await verifyTree(root, entries);
  return expectedDigest;
}
