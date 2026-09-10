import { validateBatch, LIMITS } from '../painting/index.mjs';
import { History } from './history.mjs';
import { PROJECT_BUDGET_BYTES } from './project.mjs';
import { planControl } from './playback-control.mjs';

function assertBudget(candidate) {
  const size = Buffer.byteLength(JSON.stringify(candidate), 'utf8');
  if (size > PROJECT_BUDGET_BYTES) {
    throw new Error(`Project exceeds 7 MiB budget (${size} bytes)`);
  }
}

// Skip-to-end commits the active preview plus the whole queue atomically.
// Validation, limit checks, and the resulting history are built before any
// session mutation so a rejected finish preserves the complete snapshot.
export function finishPending(session, options = {}) {
  const plan = planControl(session.controlGrant, 'finish', options);
  const pending = session.pending();
  if (!pending.length) return false;
  if (session.history.cursor + pending.length > LIMITS.commands) {
    throw new Error('Session command limit reached');
  }
  const checked = validateBatch(session.document, pending).commands;
  const history = new History();
  history.restore(session.history.commands, session.history.cursor);
  for (const command of checked) history.commit(command);
  assertBudget({ format: 'codesketch', version: 2, commands: history.commands,
    cursor: history.cursor, queue: [], comments: session.comments });
  session.history = history;
  session.queue = [];
  session.active = null;
  session.status = 'paused';
  session.playbackError = null;
  if (plan.authorize) session.controlGrant.authorize();
  if (plan.invalidate) session.controlGrant.invalidate();
  session.changed(true);
  return true;
}
