import { mkdir, open, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { MAX_IMPORT_BYTES } from '../direction/index.mjs';

export async function attachPersistence(session, filename) {
  let fileHandle;
  try {
    fileHandle = await open(filename, 'r');
    const maxRead = MAX_IMPORT_BYTES + 1;
    const chunks = [];
    let totalBytes = 0;
    while (totalBytes < maxRead) {
      const chunkSize = Math.min(64 * 1024, maxRead - totalBytes);
      const chunk = Buffer.alloc(chunkSize);
      const { bytesRead } = await fileHandle.read(chunk, 0, chunkSize, null);
      if (bytesRead === 0) break;
      chunks.push(bytesRead === chunkSize ? chunk : chunk.subarray(0, bytesRead));
      totalBytes += bytesRead;
    }
    if (totalBytes > MAX_IMPORT_BYTES) throw new Error(`Recovery file exceeds 8 MiB limit (${totalBytes} bytes)`);
    const content = Buffer.concat(chunks, totalBytes).toString('utf8');
    session.load(JSON.parse(content));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      session.storageError = `Recovery failed: ${error.message}. Original file preserved until the next edit.`;
    }
  } finally {
    if (fileHandle) await fileHandle.close();
  }

  let pendingSnapshot = null;
  let activeTask = null;

  async function writeSnapshot(serialized) {
    try {
      await mkdir(dirname(filename), { recursive: true });
      await writeFile(`${filename}.tmp`, serialized, { mode: 0o600 });
      await rename(`${filename}.tmp`, filename);
      if (session.storageError) {
        session.storageError = null;
        session.revision++;
      }
    } catch (error) {
      session.storageError = `Local recovery could not be saved: ${error.message}`;
      session.revision++;
    }
  }

  async function runLoop() {
    try {
      while (pendingSnapshot !== null) {
        const next = pendingSnapshot;
        pendingSnapshot = null;
        await writeSnapshot(next);
      }
    } finally {
      activeTask = null;
    }
  }

  session.onChange = () => {
    pendingSnapshot = JSON.stringify(session.project());
    if (!activeTask) activeTask = runLoop();
  };

  return async function flush() {
    while (activeTask || pendingSnapshot !== null) {
      if (!activeTask && pendingSnapshot !== null) activeTask = runLoop();
      await activeTask;
    }
  };
}
