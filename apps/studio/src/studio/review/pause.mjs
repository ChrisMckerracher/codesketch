import { PauseHandshake } from '../comments/index.mjs';

function stale(message) {
  return Object.assign(new Error(message), { outcome: 'stale' });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function createPauseFlow({ model, requests, dispatch, internal, onClose }) {
  const review = () => model.get().review;
  const currentSnapshot = () => model.get().snapshot;

  const confirmed = (ack) => {
    const latest = currentSnapshot();
    return Boolean(latest && internal.captured &&
      latest.instanceId === internal.captured.instanceId &&
      latest.docGeneration === internal.captured.generation &&
      latest.playback && latest.playback.status === 'paused' &&
      latest.controlEpoch === ack.controlEpoch);
  };

  const handshake = new PauseHandshake({
    sendPause: () => dispatch({
      type: 'playback.control', action: 'pause', generation: internal.captured?.generation,
    }),
    acceptSnapshot: (ack) => confirmed(ack),
  });

  const rejectPending = (error) => {
    const pending = internal.pendingBegin;
    internal.pendingBegin = null;
    if (pending) pending.deferred.reject(error);
  };

  const valid = (pending) => !internal.destroyed &&
    internal.operation === pending.operation && internal.pendingBegin === pending;

  const start = ({ scope, text, keepPaused, origin }) => {
    const current = currentSnapshot();
    if (!current || !current.instanceId || typeof current.docGeneration !== 'string') {
      throw Object.assign(new Error('Review needs a synchronized session snapshot'), { outcome: 'validation' });
    }
    handshake.expire();
    rejectPending(stale('Review was replaced before the pause was confirmed'));
    internal.operation += 1;
    internal.captured = { instanceId: current.instanceId, generation: current.docGeneration };
    internal.scope = scope;
    internal.artRevision = null;
    internal.rect = null;
    internal.requestId = null;
    internal.payload = null;
    internal.origin = origin;
    model.patch({
      review: { ...review(), phase: 'pausing', scope, rect: null, text, keepPaused,
        requestId: null, generation: internal.captured.generation, artRevision: null },
    });
    model.patch({ tool: 'comment', tab: 'feedback', drawers: { left: true, right: false } });
    const pending = { operation: internal.operation, deferred: deferred() };
    internal.pendingBegin = pending;
    handshake.begin({
      activate: (ack) => {
        if (!valid(pending)) return;
        internal.pendingBegin = null;
        const latest = currentSnapshot();
        internal.artRevision = latest.artRevision;
        model.patch({ review: { ...review(),
          phase: internal.scope === 'whole' ? 'composing' : 'selecting',
          rect: null, artRevision: latest.artRevision } });
        pending.deferred.resolve(ack);
      },
      onStale: (error) => {
        if (!valid(pending)) return;
        internal.pendingBegin = null;
        if (origin === 'reselect') model.patch({ review: { ...review(), phase: 'stale' } });
        else onClose();
        pending.deferred.reject(error ?? stale('The pause acknowledgement was not confirmed'));
      },
    });
    return pending.deferred.promise;
  };

  return {
    start,
    expire: () => handshake.expire(),
    rejectPending,
    rotatedDuringPause: (snap) => Boolean(internal.captured &&
      (snap.instanceId !== internal.captured.instanceId ||
        snap.docGeneration !== internal.captured.generation)),
  };
}
