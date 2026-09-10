import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';
import { MAX_IMPORT_BYTES } from '../direction/index.mjs';

const SAVE_FAILED = 'Local recovery could not be saved';

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
    session.restoreRecovery(JSON.parse(content));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw Object.assign(new Error(`Recovery failed: ${error.message}. The original file is preserved.`),
        { statusCode: 500 });
    }
  } finally {
    if (fileHandle) await fileHandle.close();
  }

  const queue = [];
  let activeTask = null;

  async function writeSnapshot(serialized) {
    await mkdir(dirname(filename), { recursive: true });
    const temp = `${filename}.${randomBytes(8).toString('hex')}.tmp`;
    const handle = await open(temp, 'wx', 0o600);
    let renamed = false;
    let closed = false;
    try {
      await handle.writeFile(serialized);
      await handle.sync();
      await handle.close();
      closed = true;
      await rename(temp, filename);
      renamed = true;
      const directory = await open(dirname(filename), 'r');
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } finally {
      if (!closed) await handle.close().catch(() => {});
      if (!renamed) await unlink(temp).catch(() => {});
    }
  }

  function reportSaveFailure(error) {
    session.storageError = `${SAVE_FAILED}: ${error.message}`;
    session.revision++;
  }

  function enqueue(task) {
    const tail = queue[queue.length - 1];
    if (!task.explicit && tail && !tail.explicit) queue[queue.length - 1] = task;
    else queue.push(task);
    if (!activeTask) activeTask = runLoop();
  }

  async function runLoop() {
    try {
      while (queue.length) {
        const task = queue.shift();
        try {
          await writeSnapshot(task.serialized);
          if (session.storageError) {
            session.storageError = null;
            session.revision++;
          }
          task.resolve();
        } catch (error) {
          reportSaveFailure(error);
          if (task.explicit) task.reject(Object.assign(error, { statusCode: 500 }));
          else task.resolve();
        }
      }
    } finally {
      activeTask = null;
    }
  }

  session.onChange = () => {
    let serialized;
    try {
      serialized = JSON.stringify(session.recovery());
    } catch (error) {
      reportSaveFailure(error);
      return;
    }
    enqueue({ serialized, explicit: false, resolve() {}, reject() {} });
  };

  async function flush() {
    let serialized;
    try {
      serialized = JSON.stringify(session.recovery());
    } catch (error) {
      reportSaveFailure(error);
      throw Object.assign(error, { statusCode: 500 });
    }
    return new Promise((resolve, reject) => {
      enqueue({ serialized, explicit: true, resolve, reject });
    });
  }

  return { flush };
}
