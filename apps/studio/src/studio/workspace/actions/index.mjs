import { createLayerActions } from "./layers.mjs";
import { createPaletteActions } from "./palette.mjs";
import { createReplyActions } from "./replies.mjs";

const LOCAL = new Set([
  "sidebar.collapse", "sidebar.expand", "comments.filter", "comments.select",
  "comments.scroll", "comments.thread.scroll", "layers.scroll", "feedback.toggle", "project.save",
]);

function error(message, outcome = "validation") {
  return Object.assign(new Error(message), { outcome });
}

export function createWorkspaceActions({ application, ui, changed } = {}) {
  const local = ui && typeof ui === "object" ? ui : {};
  const notify = typeof changed === "function" ? changed : () => {};
  const layers = createLayerActions({ application, ui: local, changed });
  const palette = createPaletteActions({ application, ui: local, changed });
  const replies = createReplyActions({ application, ui: local, changed });
  let destroyed = false;
  let lastDrawingTool = application?.model?.get?.()?.tool ?? "brush";
  let saveTimer = null;
  let togglePromise = null;

  function report(failure) {
    try { notify(failure); } catch {}
  }

  function app(intent) {
    try { return Promise.resolve(application.dispatch(intent)); }
    catch (failure) { return Promise.reject(failure); }
  }

  function routed(intent) {
    return app(intent).catch((failure) => { report(failure); throw failure; });
  }

  function property(payload = {}) {
    const propertyName = payload.property;
    const value = payload.value;
    if (propertyName === "opacity") return routed({ type: "tool.properties", opacity: Number(value) / 100 });
    return routed({ type: "tool.properties", [propertyName]: value });
  }

  function feedbackToggle() {
    if (togglePromise) return togglePromise;
    if (!local.feedbackOpen) {
      const tool = application?.model?.get?.()?.tool;
      if (tool && tool !== "comment") lastDrawingTool = tool;
      togglePromise = routed({ type: "review.begin", scope: "region" }).then((result) => {
        local.selection = null;
        local.selectedCommentId = null;
        local.feedbackOpen = true;
        notify();
        return result;
      });
      togglePromise = togglePromise.finally(() => { togglePromise = null; });
      return togglePromise;
    }
    togglePromise = routed({ type: "review.cancel" }).then((result) =>
      routed({ type: "tool.select", tool: lastDrawingTool }).then((selected) => {
        local.feedbackOpen = false;
        notify();
        return selected ?? result;
      }));
    togglePromise = togglePromise.finally(() => { togglePromise = null; });
    return togglePromise;
  }

  function reviewAction(action, payload = {}) {
    if (action === "review.text") return routed({ type: action, text: payload.value });
    if (action === "review.cancel") {
      return routed({ type: action, ...payload }).then((result) =>
        routed({ type: "tool.select", tool: lastDrawingTool }).then((selected) => {
          local.feedbackOpen = false;
          notify();
          return selected ?? result;
        }));
    }
    if (action !== "review.submit") return routed({ type: action, ...payload });
    const before = new Set((application?.model?.get?.()?.snapshot?.comments ?? []).map((item) => item?.id));
    return routed({ type: action, ...payload }).then((result) => {
      const comments = Array.isArray(result?.comments) ? result.comments : [];
      const added = comments.find((item) => item?.id && !before.has(item.id));
      if (added) {
        local.selectedCommentId = added.id;
        notify();
      }
      return result;
    });
  }

  function save() {
    const model = application?.model?.get?.() ?? {};
    if (model.pending?.length || model.draft || !model.snapshot || model.connection !== "online"
      || application?.requests?.synchronized !== true) {
      const failure = error("Project cannot be saved until the studio is synchronized");
      report(failure);
      return Promise.reject(failure);
    }
    return routed({ type: "project.save" }).then((result) => {
      if (destroyed) return result;
      if (result === false) return result;
      local.saved = true;
      notify();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        if (destroyed) return;
        local.saved = false;
        notify();
      }, 2500);
      return result;
    });
  }

  function localAction(action, payload = {}) {
    if (action === "sidebar.collapse") local.collapsed = true;
    else if (action === "sidebar.expand") local.collapsed = false;
    else if (action === "comments.filter") {
      local.commentFilter = payload.filter === "active" ? "active" : "all";
      local.commentScroll = 0;
    }
    else if (action === "comments.select") {
      local.selectedCommentId = payload.id ?? null;
      local.feedbackOpen = payload.id != null;
    }
    else if (action === "layers.scroll") {
      const layers = application?.model?.get?.()?.snapshot?.document?.layers ?? [];
      const target = application?.model?.get?.()?.targetLayer;
      const total = layers.reduce((height, layer) => height + (layer?.id === target ? 50 : 30), 0);
      const max = Math.max(0, total - 200);
      const next = payload.value === undefined
        ? (Number(local.layerScroll) || 0) + (Number(payload.deltaY) || 0) : Number(payload.value);
      local.layerScroll = Math.min(max, Math.max(0, Number.isFinite(next) ? next : 0));
    }
    else if (action === "comments.scroll") {
      const comments = application?.model?.get?.()?.snapshot?.comments ?? [];
      const active = local.commentFilter === "active" ? comments.filter((item) => item?.status !== "resolved") : comments;
      const max = Math.max(0, active.length * 38 - 140);
      const next = payload.value === undefined
        ? (Number(local.commentScroll) || 0) + (Number(payload.deltaY) || 0) : Number(payload.value);
      local.commentScroll = Math.min(max, Math.max(0, Number.isFinite(next) ? next : 0));
    }
    else if (action === "comments.thread.scroll") {
      const current = Number(local.threadScroll?.[payload.id]) || 0;
      const next = payload.value === undefined
        ? current + (Number(payload.deltaY) || 0) : Number(payload.value);
      const max = Number.isFinite(Number(payload.maxScroll))
        ? Math.max(0, Number(payload.maxScroll)) : Infinity;
      local.threadScroll = {
        ...(local.threadScroll ?? {}),
        [payload.id]: Math.min(max, Math.max(0, Number.isFinite(next) ? next : 0)),
      };
    }
    else return action === "feedback.toggle" ? feedbackToggle() : save();
    notify();
    return Promise.resolve();
  }

  function dispatch(action, payload = {}) {
    if (destroyed) return Promise.reject(error("Workspace actions were destroyed", "stale"));
    if (![...LOCAL].some((item) => item === action) && !String(action).startsWith("layer.")
      && !String(action).startsWith("pigment.") && !String(action).startsWith("comments.reply.")) {
      if (String(action).startsWith("review.")) return reviewAction(action, payload);
      if (action === "tool.select") {
        if (payload.tool && payload.tool !== "comment") lastDrawingTool = payload.tool;
        return routed({ type: action, ...payload });
      }
      if (action === "tool.properties") return property(payload);
      return false;
    }
    if (LOCAL.has(action)) return localAction(action, payload);
    let result;
    if (String(action).startsWith("layer.")) result = layers.handle(action, payload);
    else if (String(action).startsWith("pigment.")) result = palette.handle(action, payload);
    else result = replies.handle(action, payload);
    return result?.catch ? result.catch((failure) => { report(failure); throw failure; }) : result;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    clearTimeout(saveTimer);
    layers.destroy();
    palette.destroy();
    replies.destroy();
  }

  return { dispatch, destroy };
}
