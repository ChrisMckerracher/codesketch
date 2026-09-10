// artifacts/tumblr-runner.mjs
// Controller to submit batches to Codesketch, observe playback, and honor human pauses/feedback.

import { readFileSync, readdirSync } from 'node:fs';

const BASE_URL = process.env.PAINT_URL || 'http://127.0.0.1:4317';

async function getState() {
  const res = await fetch(`${BASE_URL}/api/state`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`GET /api/state failed: ${res.status}`);
  return res.json();
}

async function postCommands(commands, play = true) {
  const res = await fetch(`${BASE_URL}/api/commands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ commands, play, replace: false }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`POST /api/commands failed: ${res.status}`);
  return res.json();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForPlaybackIdle(maxSeconds = 30) {
  const start = Date.now();
  while (Date.now() - start < maxSeconds * 1000) {
    const state = await getState();
    const { status, remaining } = state.playback;
    if (status === 'paused') {
      console.log('Playback paused by user/feedback!');
      return { paused: true, feedback: state.feedback };
    }
    if (status === 'idle' || remaining === 0) {
      return { paused: false, feedback: state.feedback };
    }
    await sleep(400);
  }
  console.log('Playback wait timed out.');
  return { paused: false, timeout: true };
}

async function run(startBatch = 1, endBatch = 999) {
  const files = readdirSync('artifacts/tumblr-batches')
    .filter(f => f.startsWith('batch-') && f.endsWith('.json'))
    .sort();

  console.log(`Found ${files.length} batch files.`);
  let initialResumed = false;

  for (let i = 0; i < files.length; i++) {
    const batchNum = i + 1;
    if (batchNum < startBatch || batchNum > endBatch) continue;

    const file = `artifacts/tumblr-batches/${files[i]}`;
    const commands = JSON.parse(readFileSync(file, 'utf8'));

    // Check state before submitting
    const preState = await getState();
    if (preState.playback.status === 'paused') {
      console.log(`[STOP] Cannot submit batch ${batchNum}: canvas is currently PAUSED.`);
      if (preState.feedback?.length) {
        console.log(`Latest feedback: "${preState.feedback[preState.feedback.length - 1].text}"`);
      }
      return { paused: true, batch: batchNum };
    }

    console.log(`Submitting batch ${batchNum}/${files.length} (${commands.length} commands)...`);
    await postCommands(commands, true);

    // Wait for playback to complete
    const result = await waitForPlaybackIdle(25);
    if (result.paused) {
      console.log(`[PAUSED] Paused after batch ${batchNum}`);
      return { paused: true, batch: batchNum, feedback: result.feedback };
    }
    console.log(`Batch ${batchNum} completed playback.`);
  }

  console.log(`Finished batches ${startBatch} through ${Math.min(endBatch, files.length)}.`);
  return { done: true };
}

const args = process.argv.slice(2);
const start = args[0] ? parseInt(args[0], 10) : 1;
const end = args[1] ? parseInt(args[1], 10) : 999;

run(start, end).catch(err => {
  console.error('Runner error:', err);
  process.exit(1);
});
