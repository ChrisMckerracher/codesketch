function failure(message, outcome = "validation") {
  return Object.assign(new Error(message), { outcome });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function snapshotOf(application) { return application?.model?.get?.()?.snapshot ?? null; }

function contextOf(snapshot) {
  if (!snapshot?.instanceId || !snapshot?.docGeneration) return null;
  return { instanceId: snapshot.instanceId, generation: snapshot.docGeneration };
}

function sameContext(a, b) {
  return Boolean(a && b && a.instanceId === b.instanceId && a.generation === b.generation);
}

function commentOf(snapshot, id) {
  return snapshot?.comments?.find((comment) => comment?.id === id) ?? null;
}

function definitive(error) {
  return error?.outcome === "stale" || error?.outcome === "validation";
}

export function createReplyActions({ application, ui, changed } = {}) {
  const local = ui && typeof ui === "object" ? ui : {};
  const rerender = typeof changed === "function" ? changed : () => {};
  let destroyed = false;
  let active = null;
  const retry = new Map();

  function redraw() { try { rerender(); } catch {} }

  function report(error) { try { rerender(error); } catch {} }

  function setPending(id, value) {
    if (destroyed) return;
    local.replyPending ??= {};
    if (value) local.replyPending[id] = true;
    else delete local.replyPending[id];
    redraw();
  }

  function finish(entry, error, value) {
    if (active === entry) active = null;
    if (entry.settled) return;
    entry.settled = true;
    setPending(entry.id, false);
    if (error) entry.deferred.reject(error);
    else entry.deferred.resolve(value);
  }

  function retire(entry, error) {
    if (retry.get(entry.id) === entry) retry.delete(entry.id);
    if (error) report(error);
    return error;
  }

  function recovered(entry, snapshot) {
    if (local.replyDrafts?.[entry.id] === entry.text) delete local.replyDrafts[entry.id];
    retry.delete(entry.id);
    redraw();
    return snapshot;
  }

  function hasReply(snapshot, entry) {
    const comment = commentOf(snapshot, entry.id);
    return comment?.replies?.some((reply) => reply?.requestId === entry.requestId
      && reply?.author === "human" && reply?.text === entry.text) === true;
  }

  function requestPayload(entry) {
    return {
      id: entry.id,
      requestId: entry.requestId,
      text: entry.text,
      source: "human",
      expectedDocGeneration: entry.context.generation,
      expectedSeq: entry.seq,
    };
  }

  function run(entry) {
    if (!sameContext(entry.context, contextOf(snapshotOf(application)))) {
      finish(entry, failure("Reply was superseded by a document change", "stale"));
      return;
    }
    let request;
    try {
      request = application.requests.mutate({
        expectedDocGeneration: entry.context.generation,
        run: (api) => api.replyComment(requestPayload(entry)),
      });
    } catch (error) {
      if (entry.retrying && definitive(error)) retire(entry, error);
      finish(entry, error);
      return;
    }
    Promise.resolve(request).then((snapshot) => {
      if (entry.settled) return;
      if (!sameContext(entry.context, contextOf(snapshotOf(application))) ||
        !sameContext(entry.context, contextOf(snapshot))) {
        const stale = failure("Reply acknowledgement was superseded", "stale");
        if (entry.retrying) retire(entry, stale);
        finish(entry, stale);
        return;
      }
      if (local.replyDrafts?.[entry.id] === entry.text) {
        delete local.replyDrafts[entry.id];
        redraw();
      }
      retry.delete(entry.id);
      finish(entry, null, snapshot);
    }, (error) => {
      if (entry.settled) return;
      if (error?.outcome === "uncertain") retry.set(entry.id, entry);
      else if (entry.retrying && definitive(error)) retire(entry, error);
      finish(entry, error);
    });
  }

  function submit(id, text, context, seq, requestId = null, retrying = false) {
    if (active) return Promise.reject(failure("A reply is already pending", "validation"));
    const entry = { id, text, seq, context, requestId: requestId ?? globalThis.crypto?.randomUUID?.(),
      retrying, deferred: deferred(), settled: false };
    if (!entry.requestId) return Promise.reject(failure("Secure request IDs are unavailable", "validation"));
    active = entry;
    setPending(id, true);
    run(entry);
    return entry.deferred.promise;
  }

  function submitCurrent(id, text) {
    const snapshot = snapshotOf(application);
    const context = contextOf(snapshot);
    const uncertain = retry.get(id);
    const comment = commentOf(snapshot, id);
    if (!context) return Promise.reject(failure("No current session; refresh required", "stale"));
    if (uncertain) return retryReply(uncertain);
    if (retry.size) return Promise.reject(failure("Resolve the uncertain reply before sending another comment"));
    if (!comment) return Promise.reject(failure(`Unknown comment ${id}`));
    if (typeof text !== "string" || !text.trim()) return Promise.reject(failure("Reply text is required"));
    if (text.length > 2000) return Promise.reject(failure("Reply text must be at most 2000 characters"));
    return submit(id, text, context, comment.seq);
  }

  function retryReply(entry) {
    if (active) return Promise.reject(failure("A reply is already pending"));
    let refreshed;
    try {
      refreshed = application.requests.readState();
    } catch (error) {
      if (!sameContext(entry.context, contextOf(snapshotOf(application)))) retire(entry, error);
      return Promise.reject(error);
    }
    return Promise.resolve(refreshed).then(() => {
      if (destroyed) throw failure("Reply actions were destroyed", "stale");
      const snapshot = snapshotOf(application);
      if (!sameContext(entry.context, contextOf(snapshot))) {
        throw failure("Reply retry was superseded by a document change", "stale");
      }
      if (hasReply(snapshot, entry)) return recovered(entry, snapshot);
      const current = commentOf(snapshot, entry.id);
      if (!current) throw failure(`Unknown comment ${entry.id}`, "stale");
      return submit(entry.id, entry.text, entry.context, entry.seq, entry.requestId, true);
    }, (error) => {
      if (!sameContext(entry.context, contextOf(snapshotOf(application)))) retire(entry, error);
      throw error;
    }).then((result) => result, (error) => {
      if (definitive(error)) retire(entry, error);
      throw error;
    });
  }

  function handle(action, payload = {}) {
    if (action !== "comments.reply.text" && action !== "comments.reply.submit") return false;
    if (destroyed) return Promise.reject(failure("Reply actions were destroyed", "stale"));
    const id = payload?.id;
    if (typeof id !== "string" || !id) return Promise.reject(failure("Comment id is required"));
    if (action === "comments.reply.text") {
      local.replyDrafts ??= {};
      local.replyDrafts[id] = payload.value;
      redraw();
      return Promise.resolve();
    }
    return submitCurrent(id, local.replyDrafts?.[id]);
  }

  const unsubscribe = application?.model?.subscribe?.((value) => {
    const next = contextOf(value?.snapshot);
    for (const [id, entry] of retry) {
      if (!sameContext(entry.context, next)) {
        retry.delete(id);
        report(failure("The uncertain reply was retired after the document changed", "stale"));
      }
    }
    if (active && !sameContext(active.context, next)) {
      const stale = failure("Reply was superseded by a document change", "stale");
      if (active.retrying) retire(active, stale);
      finish(active, stale);
    }
  });

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    const error = failure("Reply actions were destroyed", "stale");
    if (active) finish(active, error);
    unsubscribe?.();
  }

  return { handle, destroy };
}
