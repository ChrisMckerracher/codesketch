import { PROJECT_BUDGET_BYTES } from './project.mjs';
import { prepareComment, transitionComment, commentPoll, prepareReply } from './feedback/index.mjs';

function conflict(reason) {
  const error = new Error(reason);
  error.statusCode = 409;
  return error;
}

function candidateProject(session, comments, queue = session.pending()) {
  return { format: 'codesketch', version: 2, commands: session.history.commands,
    cursor: session.history.cursor, queue, comments };
}

function assertBudget(candidate) {
  const size = Buffer.byteLength(JSON.stringify(candidate), 'utf8');
  if (size > PROJECT_BUDGET_BYTES) {
    throw new Error(`Project exceeds 7 MiB budget (${size} bytes)`);
  }
}

function commentContext(session) {
  return { ...session.controlGrant.snapshot(), artRevision: session.artRevision,
    cursor: session.history.cursor, document: session.document };
}

export function addComment(session, input) {
  const prepared = prepareComment(session.comments, input, commentContext(session));
  if (prepared.duplicate) return prepared.item;
  if (session.status === 'playing') throw conflict('Pause playback before commenting');
  const apply = input.continuePlayback === true;
  assertBudget(candidateProject(session, prepared.comments, apply ? [] : undefined));
  const priorActive = !!session.active;
  session.comments = prepared.comments;
  session.status = 'paused';
  if (apply) {
    session.queue = [];
    session.active = null;
    session.controlGrant.authorize();
    session.changed(!!priorActive);
  } else {
    session.controlGrant.invalidate();
    session.changed(false);
  }
  return prepared.item;
}

export function updateComment(session, action, input) {
  if (input?.expectedDocGeneration !== session.controlGrant.docGeneration) {
    throw conflict('Document generation moved on; refresh and resubmit');
  }
  const existing = session.comments.find(item => item.id === input?.id) ?? null;
  const transitioned = transitionComment(session.comments, { ...input, action });
  if (existing && transitioned.item.seq === existing.seq) return transitioned.item;
  assertBudget(candidateProject(session, transitioned.comments));
  session.comments = transitioned.comments;
  if (action === 'reopen') {
    session.status = 'paused';
    session.controlGrant.invalidate();
  }
  session.changed(false);
  return transitioned.item;
}

export function replyComment(session, input) {
  const prepared = prepareReply(session.comments, input, session.controlGrant.docGeneration);
  if (prepared.duplicate) return structuredClone(prepared.reply);
  assertBudget(candidateProject(session, prepared.comments));
  session.comments = prepared.comments;
  session.changed(false);
  return structuredClone(prepared.reply);
}

export function pollComments(session, since) {
  const poll = commentPoll(session.comments, since, session.instanceId, session.controlGrant.docGeneration);
  return { ...poll, ...session.controlGrant.snapshot() };
}
