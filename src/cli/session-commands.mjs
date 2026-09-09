import { writeFileSync } from 'node:fs';
import { get, post } from './client.mjs';
import { formatStatus, formatFeedback } from './format.mjs';
import { parseFiniteNumber, readBoundedFile } from './parse.mjs';

export async function handleStatus(positionals, flags) {
  if (positionals.length > 0) {
    throw new Error('status does not accept positional arguments');
  }
  const snapshot = await get('/api/state');
  if (flags.json) {
    console.log(JSON.stringify(snapshot, null, 2));
  } else {
    console.log(formatStatus(snapshot));
  }
}

export async function handleControl(action, positionals, flags) {
  if (positionals.length > 0) {
    throw new Error(`${action} does not accept positional arguments`);
  }
  const res = await post('/api/control', { action });
  if (flags.json) {
    console.log(JSON.stringify(res, null, 2));
    return;
  }
  const messages = {
    pause: `Playback paused (revision ${res.revision})`,
    resume: `Playback resumed (revision ${res.revision})`,
    step: `Stepped 1 command (revision ${res.revision})`,
    clear: `Cleared pending queue (revision ${res.revision})`,
    undo: `Undo performed (cursor ${res.history?.cursor}/${res.history?.total}, revision ${res.revision})`,
    redo: `Redo performed (cursor ${res.history?.cursor}/${res.history?.total}, revision ${res.revision})`,
    new: `Created new session (revision ${res.revision})`,
  };
  console.log(messages[action] ?? `Action "${action}" executed (revision ${res.revision})`);
}

export async function handleSpeed(positionals, flags) {
  if (flags.speed !== undefined && positionals.length > 0) {
    throw new Error('speed provided via both flag and argument: speed NUMBER');
  }
  if (flags.speed === undefined && positionals.length !== 1) {
    throw new Error('speed requires exactly one argument: speed NUMBER');
  }
  const val = positionals[0] ?? flags.speed;
  const speed = parseFiniteNumber(val, 'speed', 0.25, 8);
  const res = await post('/api/control', { action: 'speed', speed });
  if (flags.json) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    console.log(`Playback speed set to ${speed}x (revision ${res.revision})`);
  }
}

export async function handleFeedback(positionals, flags) {
  const text = positionals.join(' ').trim();
  if (!text) {
    const snapshot = await get('/api/state');
    if (flags.json) {
      console.log(JSON.stringify(snapshot.feedback ?? [], null, 2));
    } else {
      console.log(formatFeedback(snapshot.feedback ?? []));
    }
    return;
  }
  const res = await post('/api/feedback', { text });
  if (flags.json) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    console.log(`Feedback recorded (playback paused, revision ${res.revision})`);
  }
}

export async function handleSave(positionals, flags) {
  if (positionals.length !== 1) {
    throw new Error('save requires exactly one argument: save FILE');
  }
  const file = positionals[0];
  const project = await get('/api/project');
  try {
    writeFileSync(file, `${JSON.stringify(project)}\n`, 'utf8');
  } catch (err) {
    throw new Error(`cannot write ${file}: ${err.code ?? err.message}`);
  }
  console.log(`saved project to ${file}`);
}

export async function handleLoad(positionals, flags) {
  if (positionals.length !== 1) {
    throw new Error('load requires exactly one argument: load FILE');
  }
  const file = positionals[0];
  const raw = readBoundedFile(file);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${file} is not valid JSON: ${err.message}`);
  }
  const res = await post('/api/project', parsed);
  if (flags.json) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    console.log(`loaded project from ${file} (revision ${res.revision})`);
  }
}
