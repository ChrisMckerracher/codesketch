#!/usr/bin/env node
// Native runner for Codesketch browser end-to-end verification.
// Fresh ephemeral in-memory studio plus a fresh short browser session per scenario.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createStudio } from '../apps/studio/src/transport/index.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const STUDIO_ROOT = resolve(ROOT, 'apps', 'studio');
const SCENARIOS = ['studio.mjs', 'layers-keyboard.mjs', 'layers-opacity.mjs', 'comments.mjs', 'comments-races.mjs', 'finish.mjs', 'appearance.mjs', 'connection.mjs'];
const ARTIFACTS = resolve(ROOT, 'artifacts', 'browser-check');
const STALE_ARTIFACTS = ['project.json'];

const onlyArgument = process.argv.slice(2).find((value) => value.startsWith('--only='));
const unknownArguments = process.argv.slice(2).filter((value) => !value.startsWith('--only='));
if (unknownArguments.length > 0) {
  console.error(`Unknown CLI arguments: ${unknownArguments.join(' ')}. Only --only=<scenario,scenario> is supported.`);
  process.exit(2);
}
const selected = onlyArgument ? onlyArgument.slice('--only='.length).split(',').map((name) => name.trim()).filter(Boolean) : SCENARIOS;
if (selected.length === 0) {
  console.error('Empty --only selection would run zero checks.');
  process.exit(2);
}

if (spawnSync('which', ['playwright-cli'], { encoding: 'utf8' }).status !== 0) {
  console.error('Browser check failed: playwright-cli is not installed or not in PATH.');
  process.exit(2);
}
for (const name of selected) {
  if (!SCENARIOS.includes(name)) { console.error(`Unknown scenario: ${name}`); process.exit(2); }
  if (!existsSync(resolve(STUDIO_ROOT, 'tests', 'browser', name))) { console.error(`Missing scenario file: ${name}`); process.exit(2); }
}
mkdirSync(ARTIFACTS, { recursive: true });

// Parses only the bounded run-code result section instead of trusting echoed source.
function parseResult(output) {
  const marker = output.indexOf('### Result');
  if (marker === -1) return null;
  const bodyStart = output.indexOf('\n', marker) + 1;
  const nextHeading = output.indexOf('\n### ', bodyStart);
  const body = (nextHeading === -1 ? output : output.slice(0, nextHeading)).slice(bodyStart).trim();
  if (!body) return null;
  try { return JSON.parse(body); } catch { return null; }
}

function execCli(session, args, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const child = spawn('playwright-cli', [`-s=${session}`, ...args]);
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      try { process.kill(child.pid, 'SIGKILL'); } catch {}
      reject(new Error(`playwright-cli ${args[0]} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}

function verifyArtifacts() {
  const jsonPath = resolve(ARTIFACTS, 'project.json');
  if (!existsSync(jsonPath)) throw new Error('Fresh project.json download missing');
  const project = JSON.parse(readFileSync(jsonPath, 'utf8'));
  if (project.format !== 'codesketch' || project.version !== 2 || !Array.isArray(project.commands)
    || !Array.isArray(project.queue) || !Array.isArray(project.comments) || !Number.isInteger(project.cursor)) {
    throw new Error('Downloaded project JSON is not current codesketch v2');
  }
  if (!project.commands.some((command) => command.type === 'stroke'
    && Array.isArray(command.points) && command.points.length >= 2)) {
    throw new Error('Downloaded project JSON lacks an actual drawn stroke command');
  }
  console.log('verified fresh project.json (codesketch v2) with an actual drawn stroke command');
}

async function runScenario(name) {
  const session = `r3${randomBytes(3).toString('hex')}`;
  let cliOut = '';
  let cliErr = '';
  if (name === 'studio.mjs') {
    for (const artifact of STALE_ARTIFACTS) rmSync(resolve(ARTIFACTS, artifact), { force: true });
  }
  let server = null;
  try {
    const studio = await createStudio({ root: STUDIO_ROOT });
    server = studio.server;
    await new Promise((resolveListen, rejectListen) => {
      server.listen(0, '127.0.0.1', resolveListen);
      server.on('error', rejectListen);
    });
    const url = `http://127.0.0.1:${server.address().port}/`;
    const opened = await execCli(session, ['open', url]);
    cliOut = opened.out;
    cliErr = opened.err;
    if (opened.code !== 0 || opened.out.includes('### Error')) {
      throw new Error(`browser open failed: ${opened.err || opened.out}`);
    }
    const scenario = resolve(STUDIO_ROOT, 'tests', 'browser', name);
    const result = await execCli(session, ['run-code', '--filename', scenario], 180000);
    cliOut = result.out;
    cliErr = result.err;
    if (result.code !== 0) throw new Error(`run-code exited ${result.code}`);
    const parsed = parseResult(result.out);
    const errored = result.out.includes('### Error') || result.err.includes('### Error');
    if (parsed === null) throw new Error('run-code produced no parseable ### Result JSON');
    if (parsed.success !== true) throw new Error(`scenario reported success:${JSON.stringify(parsed.success)}`);
    if (errored) throw new Error('run-code reported ### Error');
    if (name === 'studio.mjs') verifyArtifacts();
  } finally {
    if (cliOut || cliErr) {
      const evidence = resolve(ARTIFACTS, `${name.replace(/\.mjs$/, '')}.last-run.log`);
      writeFileSync(evidence, `--- stdout ---\n${cliOut}\n--- stderr ---\n${cliErr}`);
    }
    try { await execCli(session, ['close'], 15000); } catch {}
    if (server) {
      try {
        server.closeAllConnections();
        await new Promise((resolveClose) => server.close(resolveClose));
      } catch {}
    }
  }
}

const outcomes = [];
for (const name of selected) {
  console.log(`=== ${name} ===`);
  try {
    await runScenario(name);
    outcomes.push([name, true]);
    console.log(`${name} PASSED`);
  } catch (error) {
    outcomes.push([name, false]);
    const evidence = resolve(ARTIFACTS, `${name.replace(/\.mjs$/, '')}.last-run.log`);
    let detail = error.message;
    if (existsSync(evidence)) {
      const section = readFileSync(evidence, 'utf8').split('### Error')[1];
      if (section) detail = `run-code ### Error: ${section.trim().slice(0, 400)}`;
    }
    console.error(`${name} FAILED: ${detail}`);
    console.error(`full CLI output saved to: ${evidence}`);
  }
}
const failed = outcomes.filter(([, ok]) => !ok);
console.log(`\nBrowser check: ${outcomes.length - failed.length}/${outcomes.length} passed (${outcomes.map(([name, ok]) => `${name}=${ok ? 'pass' : 'FAIL'}`).join(', ')})`);
if (failed.length) process.exit(1);
