import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, delimiter } from 'node:path';
import { tmpdir, homedir } from 'node:os';

const CANDIDATE_NAMES = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome', 'msedge'];

export function findBrowser(explicitPath) {
  if (explicitPath) {
    if (existsSync(explicitPath)) return explicitPath;
    throw new Error(`Specified browser executable not found: ${explicitPath}`);
  }

  const envPath = process.env.PAINT_BROWSER;
  if (envPath) {
    if (existsSync(envPath)) return envPath;
    throw new Error(`PAINT_BROWSER executable not found: ${envPath}`);
  }

  const platform = process.platform;
  const candidates = [];

  if (platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      join(homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
      join(homedir(), 'Applications/Chromium.app/Contents/MacOS/Chromium')
    );
  } else if (platform === 'linux') {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium'
    );
  } else if (platform === 'win32') {
    const local = process.env.LOCALAPPDATA || '';
    candidates.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      join(local, 'Google\\Chrome\\Application\\chrome.exe'),
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    );
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  const pathDirs = (process.env.PATH || '').split(delimiter);
  for (const dir of pathDirs) {
    for (const name of CANDIDATE_NAMES) {
      const fullPath = join(dir, platform === 'win32' ? `${name}.exe` : name);
      try {
        if (existsSync(fullPath) && statSync(fullPath).isFile()) return fullPath;
      } catch {}
    }
  }

  throw new Error(
    'No Chromium-family browser found. Install Google Chrome or Chromium, or set the PAINT_BROWSER environment variable to the browser executable path.'
  );
}

export function createProfileDir() {
  return mkdtempSync(join(tmpdir(), 'codesketch-capture-profile-'));
}

export function cleanupProfile(profileDir) {
  if (!profileDir) return;
  try {
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch {}
}

export async function terminateBrowser(child, timeoutMs = 2000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;

  return new Promise((resolve) => {
    let termTimer = null;
    let killTimer = null;

    const onExit = () => {
      if (termTimer) clearTimeout(termTimer);
      if (killTimer) clearTimeout(killTimer);
      resolve();
    };

    child.once('exit', onExit);

    try {
      child.kill('SIGTERM');
    } catch {
      if (termTimer) clearTimeout(termTimer);
      resolve();
      return;
    }

    termTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          child.kill('SIGKILL');
        } catch {
          resolve();
          return;
        }

        killTimer = setTimeout(() => {
          resolve();
        }, 1000);
        killTimer.unref?.();
      } else {
        resolve();
      }
    }, timeoutMs);
    termTimer.unref?.();
  });
}

export function launchBrowser(browserPath, profileDir, url) {
  const flags = [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--disable-default-apps',
    '--mute-audio',
    '--hide-scrollbars',
    url,
  ];

  const child = spawn(browserPath, flags, { stdio: ['ignore', 'ignore', 'pipe'] });
  child.spawnError = null;
  child.on('error', (err) => {
    child.spawnError = err;
  });

  return child;
}

export async function getPageWebSocketUrl(child, profileDir, timeoutMs = 10000, signal = null) {
  const start = Date.now();
  let port = null;

  child.stderr?.on('data', (chunk) => {
    if (port) return;
    const match = chunk.toString().match(/ws:\/\/127\.0\.0\.1:(\d+)\//);
    if (match) port = Number(match[1]);
  });

  while (Date.now() - start < timeoutMs) {
    signal?.throwIfAborted();

    if (child.spawnError) {
      throw new Error(`Failed to spawn browser process: ${child.spawnError.message}`);
    }

    if (child.exitCode !== null || child.signalCode !== null) {
      const code = child.exitCode ?? child.signalCode;
      throw new Error(`Browser process exited prematurely with code ${code}`);
    }

    if (!port) {
      const activePortFile = join(profileDir, 'DevToolsActivePort');
      if (existsSync(activePortFile)) {
        try {
          const lines = readFileSync(activePortFile, 'utf8').trim().split('\n');
          const parsed = Number(lines[0]);
          if (parsed > 0) port = parsed;
        } catch {}
      }
    }

    if (port) {
      try {
        const remaining = Math.max(50, timeoutMs - (Date.now() - start));
        const fetchTimeout = Math.min(1000, remaining);
        const fetchSignal = signal
          ? AbortSignal.any([signal, AbortSignal.timeout(fetchTimeout)])
          : AbortSignal.timeout(fetchTimeout);

        const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: fetchSignal });
        if (res.ok) {
          const targets = await res.json();
          const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
          if (page) return page.webSocketDebuggerUrl;
        }
      } catch (err) {
        if (signal?.aborted) throw signal.reason;
      }
    }

    await new Promise((r) => setTimeout(r, 25));
  }

  throw new Error(`Timeout waiting for browser DevTools target after ${timeoutMs}ms`);
}
