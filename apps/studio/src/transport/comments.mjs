import { send } from './http.mjs';

export function createCommentHeartbeat() {
  return { lastSeenAt: null };
}

export function heartbeatOf(heartbeat) {
  return { heartbeat: { lastSeenAt: heartbeat.lastSeenAt } };
}

function markHeartbeat(heartbeat) {
  heartbeat.lastSeenAt = new Date().toISOString();
}

export function resetHeartbeat(heartbeat) {
  heartbeat.lastSeenAt = null;
}

function assertRequestId(value) {
  if (typeof value !== 'string' || !value || value.length > 80) {
    throw new Error('requestId must be a string of 1..80 characters');
  }
}

function assertGeneration(value) {
  if (typeof value !== 'string' || !value || value.length > 80) {
    throw new Error('expectedDocGeneration must be a string of 1..80 characters');
  }
}

function assertPollSince(since) {
  if (since !== null && since !== undefined && (typeof since !== 'string' || since.length > 256)) {
    throw new Error('since must be null or a cursor string of at most 256 characters');
  }
}

export async function createComment(response, { session, heartbeat, flush }, body) {
  assertRequestId(body.requestId);
  assertGeneration(body.expectedDocGeneration);
  session.addComment(body);
  await flush();
  send(response, 200, { ...session.snapshot(), ...heartbeatOf(heartbeat) });
}

export async function transitionComment(response, { session, heartbeat, flush }, action, body) {
  if (action === 'resolve' && body.reopen !== undefined && typeof body.reopen !== 'boolean') {
    throw new Error('reopen must be boolean');
  }
  assertGeneration(body.expectedDocGeneration);
  session.updateComment(action === 'resolve' && body.reopen === true ? 'reopen' : action, body);
  await flush();
  send(response, 200, { ...session.snapshot(), ...heartbeatOf(heartbeat) });
}

export function pollComments(response, { session, heartbeat }, since, { markSeen = false } = {}) {
  assertPollSince(since);
  const result = session.pollComments(since ?? null);
  if (markSeen) markHeartbeat(heartbeat);
  send(response, 200, { ...result, ...heartbeatOf(heartbeat) });
}
