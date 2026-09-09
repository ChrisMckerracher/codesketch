import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createStudio } from '../../src/transport/index.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const PAINT_BIN = fileURLToPath(new URL('../../tools/paint.mjs', import.meta.url));

export async function startTestStudio() {
  const { server, session } = await createStudio({ root });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}`;
  const close = () =>
    new Promise((resolve) => {
      server.closeAllConnections();
      server.closeIdleConnections();
      server.close(resolve);
    });
  return { server, session, port, url, close };
}

export function execPaint(args, options = {}) {
  return new Promise((resolve, reject) => {
    const timeoutMs = options.timeoutMs ?? 15_000;
    const child = spawn(process.execPath, [PAINT_BIN, ...args], {
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      const forceTimer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch {}
      }, 1000);
      forceTimer.unref();
    }, timeoutMs);

    const stdoutChunks = [];
    const stderrChunks = [];
    child.stdout.on('data', (c) => stdoutChunks.push(c));
    child.stderr.on('data', (c) => stderrChunks.push(c));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`execPaint timed out after ${timeoutMs}ms: node tools/paint.mjs ${args.join(' ')}`));
        return;
      }
      resolve({
        code,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
      });
    });

    if (options.stdin !== undefined) {
      child.stdin.write(options.stdin);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
  });
}
