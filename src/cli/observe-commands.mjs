import { resolve } from 'node:path';
import { get } from './client.mjs';
import { formatStatus, formatFeedback, formatView, formatExport } from './format.mjs';
import { parseCrop, parseFiniteNumber } from './parse.mjs';
import { capture } from './capture/index.mjs';

function formatWatchEvent(event, snapshot) {
  return {
    event,
    instanceId: snapshot.instanceId,
    revision: snapshot.revision,
    artRevision: snapshot.artRevision,
    playback: snapshot.playback,
    history: snapshot.history,
    feedback: snapshot.feedback,
  };
}

export async function handleView(positionals, flags) {
  if (positionals.length > 1) {
    throw new Error('view takes at most one argument: view [FILE]');
  }
  const file = positionals[0] ? resolve(positionals[0]) : undefined;
  const crop = flags.crop ? parseCrop(flags.crop) : null;
  const scale = flags.scale !== undefined ? parseFiniteNumber(flags.scale, 'scale', 0.1, 10) : 1;

  const snapshot = await get('/api/state');
  const result = await capture(snapshot, {
    output: file,
    crop,
    scale,
    committed: false,
    browser: flags.browser,
  });
  result.playback = snapshot.playback?.status ?? 'idle';

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatView(result, result.playback));
  }
}

export async function handleExport(positionals, flags) {
  if (positionals.length !== 1) {
    throw new Error('export requires FILE: export FILE [--crop x,y,w,h] [--scale N] [--json]');
  }
  const file = positionals[0];
  const crop = flags.crop ? parseCrop(flags.crop) : null;
  const scale = flags.scale !== undefined ? parseFiniteNumber(flags.scale, 'scale', 0.1, 10) : 1;

  const snapshot = await get('/api/state');
  const result = await capture(snapshot, {
    output: resolve(file),
    crop,
    scale,
    committed: true,
    browser: flags.browser,
  });

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatExport(result));
  }
}

export async function handleWait(positionals, flags) {
  if (positionals.length > 0) {
    throw new Error('wait does not accept positional arguments');
  }
  const timeoutSec = flags.timeout !== undefined ? parseFiniteNumber(flags.timeout, 'timeout', 0.001, 3600) : 30;
  const timeoutMs = timeoutSec * 1000;
  const start = Date.now();

  while (true) {
    const elapsed = Date.now() - start;
    if (elapsed >= timeoutMs) {
      const err = new Error(`wait timed out after ${timeoutSec}s before playback settled (WAIT_TIMEOUT)`);
      err.code = 'WAIT_TIMEOUT';
      throw err;
    }
    const remainingMs = timeoutMs - elapsed;
    const reqTimeout = Math.max(1, Math.min(10000, remainingMs));

    let snapshot;
    try {
      snapshot = await get('/api/state', {}, { timeoutMs: reqTimeout });
    } catch (err) {
      if (Date.now() - start >= timeoutMs) {
        const timeoutErr = new Error(`wait timed out after ${timeoutSec}s before playback settled (WAIT_TIMEOUT)`);
        timeoutErr.code = 'WAIT_TIMEOUT';
        throw timeoutErr;
      }
      throw err;
    }

    const status = snapshot.playback?.status ?? 'idle';
    if (status === 'idle' || status === 'paused') {
      if (flags.json) {
        console.log(JSON.stringify(snapshot, null, 2));
      } else {
        console.log(formatStatus(snapshot));
        if (snapshot.feedback?.length > 0) {
          console.log(formatFeedback(snapshot.feedback));
        }
      }
      return;
    }

    const sleepMs = Math.min(100, Math.max(1, timeoutMs - (Date.now() - start)));
    await new Promise((r) => setTimeout(r, sleepMs));
  }
}

export async function handleWatch(positionals, flags) {
  if (positionals.length > 0) {
    throw new Error('watch does not accept positional arguments');
  }
  const timeoutSec = flags.timeout !== undefined ? parseFiniteNumber(flags.timeout, 'timeout', 0.001, 3600) : 30;
  const intervalMs = flags.interval !== undefined ? parseFiniteNumber(flags.interval, 'interval', 50, 10000) : 400;
  const timeoutMs = timeoutSec * 1000;
  const start = Date.now();

  const initialReqTimeout = Math.max(1, Math.min(10000, timeoutMs));
  let snapshot = await get('/api/state', {}, { timeoutMs: initialReqTimeout });
  if (flags.json) {
    console.log(JSON.stringify(formatWatchEvent('initial', snapshot)));
  } else {
    console.log(`[initial] revision ${snapshot.revision} - ${snapshot.playback?.status ?? 'idle'} (${snapshot.playback?.remaining ?? 0} remaining)`);
    if (snapshot.feedback?.length > 0) {
      console.log(formatFeedback(snapshot.feedback));
    }
  }

  while (Date.now() - start < timeoutMs) {
    const elapsed = Date.now() - start;
    if (elapsed >= timeoutMs) break;
    const delay = Math.min(intervalMs, Math.max(10, timeoutMs - elapsed));
    await new Promise((r) => setTimeout(r, delay));
    if (Date.now() - start >= timeoutMs) break;

    const remainingMs = timeoutMs - (Date.now() - start);
    const reqTimeout = Math.max(1, Math.min(10000, remainingMs));

    let updated;
    try {
      updated = await get(
        '/api/state',
        { since: snapshot.revision, instanceId: snapshot.instanceId },
        { timeoutMs: reqTimeout }
      );
    } catch {
      if (Date.now() - start >= timeoutMs) break;
      continue;
    }

    if (updated?.unchanged) continue;

    snapshot = updated;
    if (flags.json) {
      console.log(JSON.stringify(formatWatchEvent('change', snapshot)));
    } else {
      console.log(`[change] revision ${snapshot.revision} - ${snapshot.playback?.status ?? 'idle'} (${snapshot.playback?.remaining ?? 0} remaining, cursor: ${snapshot.history?.cursor ?? 0})`);
      if (snapshot.feedback?.length > 0) {
        console.log(formatFeedback(snapshot.feedback));
      }
    }
  }
}
