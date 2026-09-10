#!/usr/bin/env node
// Native runner for Codesketch browser end-to-end verification.
// Ephemeral loopback studio server + isolated playwright-cli session.

import { resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createStudio } from '../apps/studio/src/transport/index.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const STUDIO_ROOT = resolve(ROOT, 'apps', 'studio');
const SCENARIOS = ['studio.mjs', 'layers-keyboard.mjs', 'layers-opacity.mjs', 'comments.mjs', 'comments-races.mjs', 'finish.mjs'];
const ARTIFACTS_DIR = resolve(ROOT, 'artifacts/browser-check');

// The studio UI was removed for the from-zero reconstruction: browser
// scenarios are suspended coverage until the rebuilt UI lands. Exit before
// any studio server or browser runtime starts; the runner and scenario
// files below are kept intact for that future revision.
console.error('Browser check is suspended: the studio UI was removed for reconstruction.');
console.error('Scenario files remain in apps/studio/tests/browser as suspended coverage');
console.error('and will run again once the rebuilt UI lands. Do not report UI green.');
process.exit(1);

// 1. Verify playwright-cli availability
const checkCli = spawnSync('which', ['playwright-cli'], { encoding: 'utf8' });
if (checkCli.status !== 0) {
  console.error('Browser check failed: playwright-cli is not installed or not in PATH.');
  console.error('Ensure playwright-cli --help works in your terminal.');
  process.exit(1);
}

for (const name of SCENARIOS) {
  if (!existsSync(resolve(STUDIO_ROOT, 'tests/browser', name))) {
    console.error(`Browser test scenario not found: ${name}`);
    process.exit(1);
  }
}

mkdirSync(ARTIFACTS_DIR, { recursive: true });

// Short session ID keeps Unix domain socket path well under macOS 104-char limit
const sessionId = `cs-${Date.now().toString(36)}`;
let serverInstance = null;

function execCli(args, timeoutMs = 30_000) {
  return new Promise((resolveResult, rejectResult) => {
    const child = spawn('playwright-cli', [`-s=${sessionId}`, ...args]);
    let out = '';
    let err = '';
    let timer = null;

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        if (child.pid) {
          try {
            process.kill(child.pid, 'SIGKILL');
          } catch {}
        }
        rejectResult(new Error(`playwright-cli ${args.join(' ')} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }

    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => {
      if (timer) clearTimeout(timer);
      rejectResult(e);
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolveResult({ code, out, err });
    });
  });
}

function verifyArtifacts() {
  const jsonPath = resolve(ARTIFACTS_DIR, 'project.json');
  if (!existsSync(jsonPath)) throw new Error(`Expected downloaded project JSON at ${jsonPath}`);
  const projectData = JSON.parse(readFileSync(jsonPath, 'utf8'));
  if (!projectData || projectData.format !== 'codesketch' || projectData.version !== 2 ||
      !Array.isArray(projectData.commands) || !Array.isArray(projectData.queue) ||
      !Array.isArray(projectData.comments) || !Number.isInteger(projectData.cursor)) {
    throw new Error('Downloaded project JSON does not match the current codesketch v2 project format');
  }

  const pngPath = resolve(ARTIFACTS_DIR, 'artwork.png');
  if (!existsSync(pngPath)) throw new Error(`Expected exported PNG at ${pngPath}`);
  const pngBuffer = readFileSync(pngPath);
  if (pngBuffer.length < 24) throw new Error('Exported PNG file is too small');
  const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!pngBuffer.subarray(0, 8).equals(pngMagic)) {
    throw new Error('Exported PNG does not have valid PNG signature');
  }
  const width = pngBuffer.readUInt32BE(16);
  const height = pngBuffer.readUInt32BE(20);
  if (width !== 1000 || height !== 700) {
    throw new Error(`Exported PNG dimensions mismatch: expected 1000x700, got ${width}x${height}`);
  }
  console.log(`Verified exported PNG (1000x700, ${pngBuffer.length} bytes) and project JSON.`);
}

async function run() {
  console.log('Starting ephemeral studio server (no persistence)...');
  const { server } = await createStudio({ root: STUDIO_ROOT });
  serverInstance = server;

  await new Promise((resolveListen, rejectListen) => {
    server.listen(0, '127.0.0.1', () => resolveListen());
    server.on('error', rejectListen);
  });

  const port = server.address().port;
  const url = `http://127.0.0.1:${port}`;
  console.log(`Ephemeral studio server listening on ${url}`);

  console.log(`Opening isolated browser session: ${sessionId}`);
  const openRes = await execCli(['open', url], 30_000);
  if (openRes.code !== 0 || openRes.out.includes('### Error') || openRes.err.includes('### Error')) {
    throw new Error(`Failed to open browser session: ${openRes.err || openRes.out}`);
  }

  for (const name of SCENARIOS) {
    console.log(`Running browser scenario: ${name}...`);
    const file = resolve(STUDIO_ROOT, 'tests/browser', name);
    const result = await execCli(['run-code', '--filename', file], 60_000);
    if (result.code !== 0 || result.out.includes('### Error') || result.err.includes('### Error')) {
      throw new Error(`${name} failed:\n${result.out}\n${result.err}`);
    }
    if (!/"success"\s*:\s*true\b/.test(result.out)) {
      throw new Error(`${name} did not report success: true:\n${result.out}`);
    }
    if (name === 'studio.mjs') verifyArtifacts();
    console.log(`${name} passed.`);
  }
}

try {
  await run();
} catch (error) {
  console.error(`\n[FAIL] Browser check: ${error.message}`);
  process.exitCode = 1;
} finally {
  console.log(`Closing session ${sessionId} and stopping ephemeral server...`);
  try {
    await execCli(['close'], 10_000);
  } catch {}
  if (serverInstance) {
    try {
      serverInstance.closeAllConnections();
      await new Promise((resolveClose) => serverInstance.close(resolveClose));
    } catch {}
  }
}
