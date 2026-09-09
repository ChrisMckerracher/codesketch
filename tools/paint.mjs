#!/usr/bin/env node
// Codesketch agent CLI. Dependency-free; talks to the local studio HTTP API.

import { readFileSync, writeFileSync } from 'node:fs';

const HELP = `paint - Codesketch agent CLI

Usage: node tools/paint.mjs <command> [args]

Commands:
  status                          Print session state (GET /api/state)
  submit FILE [--replace] [--paused]
                                  Queue commands from a JSON array or {commands:[...]}
  pause | resume | step | clear | undo | redo
                                  Send a playback control action
  feedback TEXT...                Send feedback (pauses the painter)
  save FILE                       Save project JSON from the studio
  load FILE                       Load project JSON into the studio
  help                            Show this help

Environment:
  PAINT_URL                       Base URL (default http://127.0.0.1:4317)`;

const base = (process.env.PAINT_URL ?? 'http://127.0.0.1:4317').replace(/\/+$/, '');

function fail(message) {
  console.error(`paint: ${message}`);
  process.exit(1);
}

function print(value) {
  console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(base + path, { signal: AbortSignal.timeout(10_000), ...options });
  } catch (error) {
    fail(`request to ${base}${path} failed (${error.cause?.code ?? error.name ?? error.message})`);
  }
  const text = await response.text();
  if (!response.ok) fail(`${base}${path} responded ${response.status} ${response.statusText}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const get = (path) => request(path);

const post = (path, body) =>
  request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

function readJson(file) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (error) {
    fail(`cannot read ${file}: ${error.code ?? error.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`${file} is not valid JSON: ${error.message}`);
  }
}

function requireFile(args, usage) {
  const file = args[0];
  if (!file || file.startsWith('--')) fail(usage);
  return file;
}

async function main([command, ...rest]) {
  switch (command ?? 'help') {
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP);
      return;
    case 'status':
      print(await get('/api/state'));
      return;
    case 'submit': {
      const flags = rest.filter((arg) => arg.startsWith('--'));
      const unknown = flags.find((flag) => flag !== '--replace' && flag !== '--paused');
      if (unknown) fail(`unknown flag "${unknown}" (submit FILE [--replace] [--paused])`);
      const file = requireFile(rest, 'submit requires FILE: submit FILE [--replace] [--paused]');
      const parsed = readJson(file);
      const commands = Array.isArray(parsed) ? parsed : parsed?.commands;
      if (!Array.isArray(commands)) fail(`${file} must hold a JSON array or an object with a "commands" array`);
      print(await post('/api/commands', {
        commands,
        replace: flags.includes('--replace'),
        play: !flags.includes('--paused'),
      }));
      return;
    }
    case 'pause':
    case 'resume':
    case 'step':
    case 'clear':
    case 'undo':
    case 'redo':
      print(await post('/api/control', { action: command }));
      return;
    case 'feedback': {
      const text = rest.join(' ').trim();
      if (!text) fail('feedback requires TEXT: feedback TEXT...');
      print(await post('/api/feedback', { text }));
      return;
    }
    case 'save': {
      const file = requireFile(rest, 'save requires FILE: save FILE');
      const project = await get('/api/project');
      try {
        writeFileSync(file, `${JSON.stringify(project)}\n`);
      } catch (error) {
        fail(`cannot write ${file}: ${error.code ?? error.message}`);
      }
      console.log(`saved project to ${file}`);
      return;
    }
    case 'load': {
      const file = requireFile(rest, 'load requires FILE: load FILE');
      print(await post('/api/project', readJson(file)));
      return;
    }
    default:
      fail(`unknown command "${command}"\n\n${HELP}`);
  }
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  fail(error.message);
}
