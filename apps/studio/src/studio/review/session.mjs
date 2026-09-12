import { createPauseFlow } from './pause.mjs';

const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 700;
const TEXT_MAX = 2000;
const REOPEN_FROM = new Set(['acknowledged', 'addressed', 'resolved']);

function validateReviewText(value) {
  if (typeof value !== 'string' || value.length > TEXT_MAX || !value.trim()) {
    throw new Error('Invalid review text');
  }
  return value;
}

function stale(message) {
  return Object.assign(new Error(message), { outcome: 'stale' });
}

function validation(message) {
  return Object.assign(new Error(message), { outcome: 'validation' });
}

export function createReviewSession({ model, requests, dispatch }) {
  const internal = {
    destroyed: false, operation: 0, captured: null, scope: null, artRevision: null,
    rect: null, requestId: null, payload: null, pendingBegin: null, pendingContext: null, origin: null,
  };

  const review = () => model.get().review;
  const currentSnapshot = () => model.get().snapshot;
  const patchReview = (changes) => {
    model.patch({ review: { ...review(), ...changes } });
  };

  const closeReview = (changes = {}) => {
    internal.operation += 1;
    internal.captured = null;
    internal.pendingContext = null;
    internal.scope = null;
    internal.artRevision = null;
    internal.rect = null;
    internal.requestId = null;
    internal.payload = null;
    internal.origin = null;
    pauseFlow.rejectPending(stale('Review was cancelled'));
    patchReview({
      phase: 'closed', rect: null, requestId: null, generation: null, artRevision: null,
      controlEpoch: null, ...changes,
    });
  };

  const pauseFlow = createPauseFlow({ model, requests, dispatch, internal, onClose: () => closeReview() });

  const goStale = () => {
    pauseFlow.expire();
    patchReview({ phase: 'stale' });
  };

  const requirePhase = (phase, message) => {
    if (review().phase !== phase) throw validation(message);
  };

  const begin = (intent) => {
    if (intent.scope !== 'region' && intent.scope !== 'whole') {
      throw validation('review.begin needs scope region or whole');
    }
    return pauseFlow.start({
      scope: intent.scope, text: review().text ?? '', keepPaused: false, origin: 'begin',
    });
  };

  const reselect = () => {
    const phase = review().phase;
    if (phase !== 'composing' && phase !== 'stale') {
      throw validation('Reselect applies to an active or stale review');
    }
    if (!internal.scope) throw validation('The review context is gone; start a new review');
    return pauseFlow.start({
      scope: internal.scope, text: review().text, keepPaused: review().keepPaused, origin: 'reselect',
    });
  };

  const setRect = (intent) => {
    const phase = review().phase;
    if (phase !== 'selecting' && phase !== 'composing') {
      throw validation('Region selection is not active');
    }
    const rect = intent.rect;
    const valid = rect && typeof rect === 'object' &&
      Number.isSafeInteger(rect.x) && rect.x >= 0 &&
      Number.isSafeInteger(rect.y) && rect.y >= 0 &&
      Number.isSafeInteger(rect.width) && rect.width >= 1 &&
      Number.isSafeInteger(rect.height) && rect.height >= 1 &&
      rect.x + rect.width <= CANVAS_WIDTH && rect.y + rect.height <= CANVAS_HEIGHT;
    if (!valid) throw validation('Review region must be a bounded area inside the 1000x700 canvas');
    internal.rect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    internal.scope = 'region';
    patchReview({ phase: 'composing', scope: 'region', rect: internal.rect });
  };

  const setText = (intent) => {
    requirePhase('composing', 'Review composition is not active');
    patchReview({ text: typeof intent.text === 'string' ? intent.text : '' });
  };

  const setHold = (intent) => {
    requirePhase('composing', 'Review composition is not active');
    patchReview({ keepPaused: intent.value === true });
  };

  const cancel = () => {
    closeReview();
  };

  const sendPayload = async (operation, payload) => {
    try {
      const ack = await requests.mutate({
        expectedDocGeneration: payload.expectedDocGeneration,
        run: (api) => api.createComment(payload),
      });
      if (internal.destroyed || operation !== internal.operation) return undefined;
      closeReview({ text: '' });
      return ack;
    } catch (error) {
      if (internal.destroyed || operation !== internal.operation) return undefined;
      const outcome = error && error.outcome;
      if (outcome === 'uncertain') patchReview({ phase: 'uncertain' });
      else if (outcome === 'stale') patchReview({ phase: 'stale' });
      else patchReview({ phase: 'composing' });
      throw error;
    }
  };

  const submit = async () => {
    requirePhase('composing', 'Review composition is not active');
    let text;
    try {
      text = validateReviewText(review().text);
    } catch {
      throw validation('Review text must be 1-2000 characters');
    }
    if (!internal.captured || internal.artRevision === null) {
      throw validation('The review context is gone; start a new review');
    }
    const operation = ++internal.operation;
    internal.requestId = globalThis.crypto.randomUUID();
    const payload = {
      requestId: internal.requestId,
      text,
      rect: internal.scope === 'whole' ? null : internal.rect,
      continuePlayback: review().keepPaused !== true,
      expectedDocGeneration: internal.captured.generation,
      expectedArtRevision: internal.artRevision,
      expectedControlEpoch: internal.captured.controlEpoch,
    };
    internal.payload = payload;
    patchReview({ phase: 'submitting', requestId: payload.requestId });
    return await sendPayload(operation, payload);
  };

  const retry = async () => {
    requirePhase('uncertain', 'No uncertain review submission to retry');
    const payload = internal.payload;
    if (!payload) throw validation('The uncertain submission context is gone; start a new review');
    const operation = ++internal.operation;
    await requests.readState();
    if (internal.destroyed || operation !== internal.operation) return undefined;
    const current = currentSnapshot();
    if (!current || !internal.captured ||
        current.instanceId !== internal.captured.instanceId ||
        current.docGeneration !== payload.expectedDocGeneration) {
      patchReview({ phase: 'stale' });
      throw stale('The document changed before the retry was sent');
    }
    patchReview({ phase: 'submitting' });
    return await sendPayload(operation, payload);
  };

  const transition = (intent) => {
    const current = currentSnapshot();
    if (!current || !Array.isArray(current.comments)) {
      throw validation('Review transitions need the current session');
    }
    const item = current.comments.find((comment) => comment.id === intent.id);
    if (!item) throw validation('Unknown comment for review transition');
    const reopen = intent.reopen === true;
    const allowed = reopen ? REOPEN_FROM.has(item.status) : item.status === 'addressed';
    if (!allowed) {
      throw validation(`Cannot ${reopen ? 'reopen' : 'resolve'} a comment in ${item.status} state`);
    }
    const generation = current.docGeneration;
    return requests.mutate({
      expectedDocGeneration: generation,
      run: (api) => api.resolveComment({
        id: item.id, reopen, expectedDocGeneration: generation, expectedSeq: item.seq, source: 'human',
      }),
    });
  };

  const handlers = {
    'review.begin': begin,
    'review.rect': setRect,
    'review.text': setText,
    'review.hold': setHold,
    'review.reselect': reselect,
    'review.cancel': cancel,
    'review.submit': submit,
    'review.retry': retry,
    'review.transition': transition,
  };

  return {
    handle(intent) {
      const handler = handlers[intent.type];
      if (!handler) return false;
      return (async () => handler(intent))();
    },
    observeModel(value) {
      if (internal.destroyed) return;
      const snap = value.snapshot;
      const current = value.review;
      if (!snap || !current) return;
      if (current.phase === 'pausing' && pauseFlow.rotatedDuringPause(snap)) {
        pauseFlow.expire();
        pauseFlow.rejectPending(stale('The document rotated before the pause was confirmed'));
        closeReview();
        return;
      }
      if ((current.phase === 'selecting' || current.phase === 'composing') && internal.captured) {
        if (snap.instanceId !== internal.captured.instanceId ||
            snap.docGeneration !== internal.captured.generation) {
          goStale();
          return;
        }
        if (internal.artRevision !== null && snap.artRevision !== internal.artRevision) {
          goStale();
          return;
        }
        if (snap.controlEpoch !== internal.captured.controlEpoch) goStale();
      }
    },
    destroy() {
      internal.destroyed = true;
      pauseFlow.expire();
      closeReview();
    },
  };
}
