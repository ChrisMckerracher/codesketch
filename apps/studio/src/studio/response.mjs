import { activeProblem, commandsProblem, documentProblem } from './response-artwork.mjs';

const PLAYBACK_STATUSES = new Set(['idle', 'playing', 'paused']);
const COMMENT_STATUSES = new Set(['open', 'acknowledged', 'addressed', 'resolved']);
const REPLY_AUTHORS = new Set(['human', 'agent']);
const REPLY_FIELDS = new Set(['id', 'requestId', 'author', 'text', 'at']);
const MAX_REPLIES = 32;
const STAMPS = ['acknowledgedAt', 'addressedAt', 'resolvedAt'];

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isNonemptyString = (value) => typeof value === 'string' && value.length > 0;
const isBoundedLabel = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const isNullableString = (value) => value === null || typeof value === 'string';
const isCount = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isUnitFraction = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

const expect = (condition, message) => (condition ? null : message);
const firstProblem = (...problems) => problems.find(Boolean) || null;

export function protocolError(message) {
  const error = new Error(message);
  error.name = 'ProtocolError';
  error.protocol = true;
  return error;
}

function grantProblem(activeGrant, snapshot) {
  if (activeGrant === null) return null;
  if (!isObject(activeGrant)) return 'activeGrant must be null or an object';
  return firstProblem(
    expect(activeGrant.docGeneration === snapshot.docGeneration, 'activeGrant.docGeneration must match docGeneration'),
    expect(activeGrant.controlEpoch === snapshot.controlEpoch, 'activeGrant.controlEpoch must match controlEpoch'),
    expect(isNonemptyString(activeGrant.grantToken), 'activeGrant.grantToken must be a nonempty string'),
  );
}

function playbackProblem(playback) {
  if (!isObject(playback)) return 'playback must be an object';
  return firstProblem(
    expect(PLAYBACK_STATUSES.has(playback.status), 'playback.status must be idle, playing, or paused'),
    expect(typeof playback.speed === 'number' && Number.isFinite(playback.speed) && playback.speed >= 0.25 && playback.speed <= 8, 'playback.speed must be a number from 0.25 to 8'),
    expect(isCount(playback.remaining), 'playback.remaining must be a nonnegative safe integer'),
    activeProblem(playback.active),
  );
}

function historyProblem(history) {
  if (!isObject(history)) return 'history must be an object';
  return firstProblem(
    expect(isCount(history.cursor), 'history.cursor must be a nonnegative safe integer'),
    expect(isCount(history.total), 'history.total must be a nonnegative safe integer'),
    expect(history.cursor <= history.total, 'history.cursor must not exceed history.total'),
  );
}

function rectProblem(rect, label) {
  if (rect === null) return null;
  if (!isObject(rect)) return `${label} must be null or an object`;
  return firstProblem(
    expect(isCount(rect.x), `${label}.x must be a nonnegative safe integer`),
    expect(isCount(rect.y), `${label}.y must be a nonnegative safe integer`),
    expect(isCount(rect.width) && rect.width > 0, `${label}.width must be a positive safe integer`),
    expect(isCount(rect.height) && rect.height > 0, `${label}.height must be a positive safe integer`),
  );
}

function visibleLayersProblem(visibleLayers, label) {
  if (!Array.isArray(visibleLayers)) return `${label} must be an array`;
  return firstProblem(...visibleLayers.map((entry, index) => {
    const name = `${label}[${index}]`;
    if (!isObject(entry)) return `${name} must be an object`;
    return firstProblem(
      expect(isNonemptyString(entry.id), `${name}.id must be a nonempty string`),
      expect(typeof entry.opacity === 'number' && Number.isFinite(entry.opacity) && entry.opacity > 0, `${name}.opacity must be a positive finite number`),
    );
  }));
}

function requestProblem(request, label) {
  if (request === null) return null;
  if (!isObject(request)) return `${label} must be null or an object`;
  return firstProblem(
    expect(isNonemptyString(request.id), `${label}.id must be a nonempty string`),
    expect(isNonemptyString(request.fingerprint), `${label}.fingerprint must be a nonempty string`),
  );
}

function commentProblem(comment, label) {
  if (!isObject(comment)) return `${label} must be an object`;
  return firstProblem(
    expect(isNonemptyString(comment.id), `${label}.id must be a nonempty string`),
    expect(isCount(comment.number) && comment.number > 0, `${label}.number must be a positive safe integer`),
    expect(isCount(comment.seq) && comment.seq > 0, `${label}.seq must be a positive safe integer`),
    expect(typeof comment.text === 'string', `${label}.text must be a string`),
    rectProblem(comment.rect, `${label}.rect`),
    expect(COMMENT_STATUSES.has(comment.status), `${label}.status must be open, acknowledged, addressed, or resolved`),
    expect(isCount(comment.cursor), `${label}.cursor must be a nonnegative safe integer`),
    expect(isCount(comment.artRevision), `${label}.artRevision must be a nonnegative safe integer`),
    expect(typeof comment.at === 'string', `${label}.at must be a string`),
    ...STAMPS.map((stamp) => expect(isNullableString(comment[stamp]), `${label}.${stamp} must be a string or null`)),
    visibleLayersProblem(comment.visibleLayers, `${label}.visibleLayers`),
    requestProblem(comment.request, `${label}.request`),
  );
}

function replyProblem(reply, label, replyIds, requestIds) {
  if (!isObject(reply)) return `${label} must be an object`;
  const fields = Object.keys(reply);
  if (fields.length !== REPLY_FIELDS.size || fields.some((field) => !REPLY_FIELDS.has(field))) {
    return `${label} must contain exactly id, requestId, author, text, and at`;
  }
  const problem = firstProblem(
    expect(isBoundedLabel(reply.id, 80), `${label}.id must be a nonblank string of at most 80 characters`),
    expect(isBoundedLabel(reply.requestId, 80), `${label}.requestId must be a nonblank string of at most 80 characters`),
    expect(REPLY_AUTHORS.has(reply.author), `${label}.author must be human or agent`),
    expect(isBoundedLabel(reply.text, 2000), `${label}.text must be a nonblank string of at most 2000 characters`),
    expect(isBoundedLabel(reply.at, 40), `${label}.at must be a nonblank string of at most 40 characters`),
  );
  if (problem) return problem;
  if (replyIds.has(reply.id)) return `${label}.id must be globally unique`;
  if (requestIds.has(reply.requestId)) return `${label}.requestId must be globally unique`;
  replyIds.add(reply.id);
  requestIds.add(reply.requestId);
  return null;
}

function repliesProblem(replies, label, replyIds, requestIds) {
  if (replies === undefined) return null;
  if (!Array.isArray(replies)) return `${label} must be an array`;
  if (replies.length > MAX_REPLIES) return `${label} must contain at most ${MAX_REPLIES} replies`;
  return firstProblem(...replies.map((reply, index) => replyProblem(reply, `${label}[${index}]`, replyIds, requestIds)));
}

function commentsProblem(comments) {
  if (!Array.isArray(comments)) return 'comments must be an array';
  const replyIds = new Set();
  const requestIds = new Set();
  for (const [index, comment] of comments.entries()) {
    const label = `comments[${index}]`;
    const problem = firstProblem(
      commentProblem(comment, label),
      isObject(comment) ? repliesProblem(comment.replies, `${label}.replies`, replyIds, requestIds) : null,
    );
    if (problem) return problem;
  }
  return null;
}

function heartbeatProblem(heartbeat) {
  if (!isObject(heartbeat)) return 'heartbeat must be an object';
  return expect(isNullableString(heartbeat.lastSeenAt), 'heartbeat.lastSeenAt must be a string or null');
}

export function snapshotProblem(data) {
  if (!isObject(data)) return 'snapshot must be a JSON object';
  return firstProblem(
    expect(isNonemptyString(data.instanceId), 'instanceId must be a nonempty string'),
    expect(isNonemptyString(data.docGeneration), 'docGeneration must be a nonempty string'),
    expect(isCount(data.revision), 'revision must be a nonnegative safe integer'),
    expect(isCount(data.artRevision), 'artRevision must be a nonnegative safe integer'),
    expect(isCount(data.controlEpoch), 'controlEpoch must be a nonnegative safe integer'),
    expect(typeof data.requiresGrant === 'boolean', 'requiresGrant must be a boolean'),
    grantProblem(data.activeGrant, data),
    documentProblem(data.document),
    playbackProblem(data.playback),
    historyProblem(data.history),
    commentsProblem(data.comments),
    expect(isNullableString(data.storageError), 'storageError must be a string or null'),
    expect(isNullableString(data.playbackError), 'playbackError must be a string or null'),
    heartbeatProblem(data.heartbeat),
  );
}

export function unchangedProblem(data) {
  if (!isObject(data)) return 'unchanged envelope must be a JSON object';
  return firstProblem(
    expect(data.unchanged === true, 'unchanged must be true'),
    heartbeatProblem(data.heartbeat),
  );
}

export function projectProblem(data) {
  if (!isObject(data)) return 'project must be a JSON object';
  return firstProblem(
    expect(data.format === 'codesketch', 'project.format must be codesketch'),
    expect(data.version === 2, 'project.version must be 2'),
    expect(Array.isArray(data.commands), 'project.commands must be an array'),
    Array.isArray(data.commands) ? commandsProblem(data.commands, 'project.commands') : null,
    expect(isCount(data.cursor) && Array.isArray(data.commands) && data.cursor <= data.commands.length, 'project.cursor must not exceed project.commands'),
    expect(Array.isArray(data.queue), 'project.queue must be an array'),
    Array.isArray(data.queue) ? commandsProblem(data.queue, 'project.queue') : null,
    commentsProblem(data.comments),
  );
}

export function stateReadExpect(withContext) {
  return (data) => {
    if (isObject(data) && data.unchanged === true) {
      return withContext ? unchangedProblem(data) : 'unchanged envelope requires an instance and revision context';
    }
    return snapshotProblem(data);
  };
}
