function failure(message, outcome = "validation") {
  return Object.assign(new Error(message), { outcome });
}

function promiseFor() {
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

function layersOf(snapshot) { return snapshot?.document?.layers ?? []; }

export function createLayerActions({ application, ui, changed } = {}) {
  const local = ui && typeof ui === "object" ? ui : {};
  const rerender = typeof changed === "function" ? changed : () => {};
  let destroyed = false;
  let active = null;
  let queue = [];
  let known = contextOf(snapshotOf(application));
  let editToken = 0;
  const drafts = new Map();
  const pendingRenames = new Map();

  function dispatch(intent) {
    try { return Promise.resolve(application.dispatch(intent)); }
    catch (error) { return Promise.reject(error); }
  }

  function rejectEntry(entry, error) {
    if (entry.settled) return;
    entry.settled = true;
    entry.deferred.reject(error);
  }

  function finish(entry, error, value) {
    if (active === entry) active = null;
    if (error) rejectEntry(entry, error);
    else if (!entry.settled) {
      entry.settled = true;
      const edit = local.layerEdit;
      if (entry.kind === "rename" && edit?.id === entry.id && edit.token === entry.token
        && edit.revision === entry.revision && edit.text === entry.rawName) {
        drafts.delete(entry.id);
        local.layerEdit = null;
        try { rerender(); } catch {}
      }
      entry.deferred.resolve(value);
    }
    pump();
  }

  function renameKey(id, token, revision, rawName) {
    return JSON.stringify([id, token ?? null, revision ?? null, String(rawName ?? "")]);
  }

  function currentEditMatches(payload, rawName = payload.value) {
    const edit = local.layerEdit;
    return Boolean(edit && edit.id === payload.id && edit.token === payload.token
      && edit.revision === payload.revision && edit.text === rawName);
  }

  function currentEditHasText(payload) {
    const edit = local.layerEdit;
    return edit && edit.id === payload.id && edit.token === payload.token && edit.text === payload.value
      ? edit : null;
  }

  function addSelection(entry, acknowledgement) {
    const snapshot = snapshotOf(application);
    const layers = Array.isArray(acknowledgement?.document?.layers)
      ? acknowledgement.document.layers : layersOf(snapshot);
    const added = layers.find((layer) => layer?.id && !entry.before.has(layer.id));
    if (!added?.id) throw failure("Layer acknowledgement did not contain the new layer", "uncertain");
    if (!sameContext(entry.context, contextOf(snapshot))) {
      throw failure("The document changed before the new layer was selected", "stale");
    }
    return dispatch({ type: "layer.inspect", id: added.id }).then((value) => {
      if (!sameContext(entry.context, contextOf(snapshotOf(application)))) {
        throw failure("The document changed before the new layer was selected", "stale");
      }
      local.layerScroll = 0;
      try { rerender(); } catch {}
      return value;
    });
  }

  function run(entry) {
    if (!sameContext(entry.context, contextOf(snapshotOf(application)))) {
      finish(entry, failure("Layer change was superseded by a document change", "stale"));
      return;
    }
    if (entry.kind === "add") {
      const layers = layersOf(snapshotOf(application));
      entry.before = new Set(layers.map((layer) => layer?.id));
      entry.intent = { type: "layer.add", name: `Layer ${layers.length + 1}` };
    }
    dispatch(entry.intent).then((value) => {
      if (entry.invalid) { finish(entry, entry.invalid); return; }
      if (!sameContext(entry.context, contextOf(snapshotOf(application)))) {
        finish(entry, failure("Layer change was superseded by a document change", "stale"));
        return;
      }
      if (entry.kind === "add") {
        try {
          addSelection(entry, value).then((result) => finish(entry, null, result), (error) => finish(entry, error));
        } catch (error) {
          finish(entry, error);
        }
      } else finish(entry, null, value);
    }, (error) => finish(entry, error));
  }

  function pump() {
    if (destroyed || active || !queue.length) return;
    active = queue.shift();
    run(active);
  }

  function enqueue(entry) {
    if (entry.kind === "opacity") {
      const waiting = queue.at(-1);
      if (waiting?.kind === "opacity" && waiting.id === entry.id && !waiting.settled) {
        waiting.opacity = entry.opacity;
        waiting.intent.opacity = entry.opacity;
        return waiting.deferred.promise;
      }
    }
    queue.push(entry);
    pump();
    return entry.deferred.promise;
  }

  function mutation(kind, payload) {
    const snapshot = snapshotOf(application);
    const context = contextOf(snapshot);
    if (!context) return Promise.reject(failure("No current session; refresh required", "stale"));
    const id = payload?.id;
    if (typeof id !== "string" || !id) return Promise.reject(failure("Layer id is required"));
    if (!layersOf(snapshot).some((layer) => layer?.id === id)) {
      return Promise.reject(failure(`Unknown layer ${id}`));
    }
    const value = typeof payload.value === "string" ? payload.value.trim() : payload.value;
    const currentEdit = kind === "rename" ? currentEditHasText(payload) : null;
    const revision = currentEdit ? currentEdit.revision : payload.revision;
    if (kind === "rename") {
      if (typeof value !== "string" || !value || value.length > 80) {
        return Promise.reject(failure("Layer name must be a nonblank string of at most 80 characters"));
      }
      const layer = layersOf(snapshot).find((item) => item?.id === id);
      if (layer.name === value) {
        if (currentEdit || currentEditMatches(payload)) {
          drafts.delete(id);
          local.layerEdit = null;
        }
        try { rerender(); } catch {}
        return Promise.resolve({ unchanged: true });
      }
    }
    const key = kind === "rename" ? renameKey(id, payload.token, revision, payload.value) : null;
    if (key && pendingRenames.has(key)) return pendingRenames.get(key);
    const entry = { kind, id, context, deferred: promiseFor(), settled: false,
      token: payload.token, revision, rawName: payload.value };
    if (kind === "visibility") {
      if (typeof payload.visible !== "boolean") return Promise.reject(failure("Layer visibility must be boolean"));
      entry.intent = { type: "layer.update", id, visible: payload.visible, generation: context.generation };
    } else if (kind === "rename") {
      entry.intent = { type: "layer.update", id, name: value, generation: context.generation };
    } else {
      const percent = Number(payload.value);
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        return Promise.reject(failure("Layer opacity must be a percentage from 0 to 100"));
      }
      entry.opacity = percent / 100;
      entry.intent = { type: "layer.update", id, opacity: entry.opacity, generation: context.generation };
    }
    const result = enqueue(entry);
    if (key) {
      pendingRenames.set(key, result);
      result.then(() => {
        if (pendingRenames.get(key) === result) pendingRenames.delete(key);
      }, () => {
        if (pendingRenames.get(key) === result) pendingRenames.delete(key);
      });
    }
    return result;
  }

  function handle(action, payload = {}) {
    if (!["layer.select", "layer.visibility", "layer.opacity", "layer.rename", "layer.rename.text", "layer.rename.begin",
      "layer.rename.cancel", "layer.add"].includes(action)) return false;
    if (destroyed) return Promise.reject(failure("Layer actions were destroyed", "stale"));
    if (action === "layer.select") return dispatch({ type: "layer.inspect", id: payload.id });
    if (action === "layer.visibility") return mutation("visibility", payload);
    if (action === "layer.opacity") return mutation("opacity", payload);
    if (action === "layer.rename.text") {
      const edit = local.layerEdit;
      if (!edit || edit.id !== payload.id || edit.token !== payload.token) return Promise.resolve();
      const text = String(payload.value ?? "").replace(/[\r\n]/g, "");
      if (edit.text !== text) {
        edit.text = text;
        edit.revision += 1;
      }
      drafts.set(edit.id, { ...edit });
      return Promise.resolve();
    }
    if (action === "layer.rename") return mutation("rename", payload);
    if (action === "layer.rename.cancel") {
      if (!payload.token || local.layerEdit?.token === payload.token) {
        drafts.delete(payload.id);
        local.layerEdit = null;
      }
      try { rerender(); } catch {}
      return Promise.resolve();
    }
    if (action === "layer.rename.begin") {
      const previous = local.layerEdit;
      if (previous) drafts.set(previous.id, { ...previous });
      const pending = previous && pendingRenames.get(renameKey(
        previous.id, previous.token, previous.revision, previous.text));
      if (pending) {
        return pending.then(() => handle("layer.rename.begin", payload), (error) => {
          try { rerender(); } catch {}
          throw error;
        });
      }
      return beginEdit(payload);
    }
    const snapshot = snapshotOf(application);
    const context = contextOf(snapshot);
    if (!context) return Promise.reject(failure("No current session; refresh required", "stale"));
    return enqueue({ kind: "add", context, before: new Set(), deferred: promiseFor(), settled: false });
  }

  function beginEdit(payload) {
    const context = contextOf(snapshotOf(application));
    const layer = layersOf(snapshotOf(application)).find((item) => item?.id === payload.id);
    if (!context) return Promise.reject(failure("No current session; refresh required", "stale"));
    if (!layer) return Promise.reject(failure(`Unknown layer ${payload.id}`));
    return dispatch({ type: "layer.inspect", id: payload.id }).then((value) => {
      const snapshot = snapshotOf(application);
      if (!sameContext(context, contextOf(snapshot))) throw failure("Layer edit was superseded by a document change", "stale");
      const draft = drafts.get(payload.id);
      local.layerEdit = { id: payload.id, value: layer.name,
        text: draft?.text ?? layer.name, token: ++editToken, revision: draft?.revision ?? 0 };
      drafts.set(payload.id, { ...local.layerEdit });
      try { rerender(); } catch {}
      return value;
    });
  }

  const unsubscribe = application?.model?.subscribe?.((value) => {
    const next = contextOf(value?.snapshot);
    if (known && next && !sameContext(known, next)) {
      const error = failure("Queued layer changes were dropped because the document changed", "stale");
      for (const entry of queue.splice(0)) rejectEntry(entry, error);
      if (local.layerEdit) {
        local.layerEdit = null;
        try { rerender(); } catch {}
      }
      drafts.clear();
    }
    known = next;
    pump();
  });

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    const error = failure("Layer actions were destroyed", "stale");
    for (const entry of queue.splice(0)) rejectEntry(entry, error);
    if (active) { active.invalid = error; rejectEntry(active, error); }
    unsubscribe?.();
  }

  return { handle, destroy };
}
