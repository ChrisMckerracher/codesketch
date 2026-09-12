import { createGesture } from "../gesture/index.mjs";
import { feedbackRegions } from "./feedback/index.mjs";
import { clampWorkspacePoint, designPoint } from "./geometry/index.mjs";
import { createWorkspaceInput } from "./input/index.mjs";
import { hexToHsv, hsvToHex } from "./palette/index.mjs";
import { createControls } from "./controls/index.mjs";
import { createVector } from "./vector/index.mjs";
import { createWorkspaceActions } from "./actions/index.mjs";
import { artworkSignature, feedbackModel, renderWorkspace } from "./render.mjs";

const WIDTH = 1000;
const HEIGHT = 700;
const PALETTE_RECT = { x: 476, y: 168, width: 248, height: 216 };

export function createWorkspace({
  root, canvas, uiCanvas, controlsRoot, renderer, application, viewport,
} = {}) {
  if (!root || !canvas || !uiCanvas || !controlsRoot || !renderer || !application?.model) {
    throw new TypeError("Workspace needs its canvases, control host, renderer, and application");
  }
  const model = application.model;
  const ui = createUi(model.get());
  const uiContext = uiCanvas.getContext("2d");
  if (!uiContext) throw new Error("Workspace UI canvas needs a 2D context");
  const vector = createVector(uiContext);
  const view = root.ownerDocument?.defaultView ?? globalThis.window;
  const container = viewport ?? root.parentElement ?? root;
  let descriptors = [];
  let lastArtSignature = null;
  let destroyed = false;
  let ready = false;
  let resizeObserver = null;

  const rawPoint = (event) => designPoint(event, root);
  const visiblePoint = (event) => clampWorkspacePoint(rawPoint(event), ui.collapsed);
  const feedbackValue = () => feedbackModel(model.get(), ui);
  const getBlockedRects = () => {
    const regions = feedbackRegions({ model: feedbackValue(), ui, v: vector });
    const blocked = [regions.composer, regions.thread].filter(Boolean);
    if (ui.picker?.open) blocked.push(PALETTE_RECT);
    return blocked;
  };
  const getThreadViewport = () => feedbackRegions({ model: feedbackValue(), ui, v: vector }).thread ?? null;

  function reportError(error) {
    const message = error?.message ? String(error.message) : String(error ?? "Action failed");
    try { model.patch({ notice: { message, tone: "error" } }); } catch {}
  }

  function changed(error) {
    if (error) reportError(error);
    render();
  }

  const redraw = () => changed();
  const actions = createWorkspaceActions({ application, ui, changed });
  const controls = createControls({ root: controlsRoot, dispatch: actions.dispatch, changed: redraw, point: rawPoint, vector });
  const input = createWorkspaceInput({
    root, canvas, model, dispatch: actions.dispatch, ui, changed: redraw,
    point: rawPoint, artwork: canvas, getControls: () => descriptors, getBlockedRects, getThreadViewport,
  });
  const gesture = createGesture({
    model, dispatch: application.dispatch, requests: application.requests, canvas, point: visiblePoint,
  });

  function resize() {
    const rect = container.getBoundingClientRect?.();
    const availableWidth = Number(container.clientWidth) || Number(rect?.width) || Number(view?.innerWidth) || WIDTH;
    const availableHeight = Number(container.clientHeight) || Number(rect?.height) || Number(view?.innerHeight) || HEIGHT;
    const scale = Math.max(0.01, Math.min(availableWidth / WIDTH, availableHeight / HEIGHT));
    root.style.transform = `scale(${scale})`;
    configureUiCanvas(uiCanvas, uiContext, view);
    if (ready) render();
  }

  function render(value = model.get()) {
    if (destroyed) return;
    const signature = artworkSignature(value);
    if (signature !== lastArtSignature) {
      const snapshot = value.snapshot;
      if (snapshot) renderer.render(snapshot.document, snapshot.playback?.active ?? null, value.draft);
      lastArtSignature = signature;
    }
    descriptors = renderWorkspace({ ctx: uiContext, v: vector, model: value, ui, controls, artwork: canvas });
  }

  resize();
  ready = true;
  render();
  const unsubscribe = model.subscribe((value) => render(value));
  const ResizeObserverCtor = view?.ResizeObserver ?? globalThis.ResizeObserver;
  if (typeof ResizeObserverCtor === "function") {
    resizeObserver = new ResizeObserverCtor(resize);
    resizeObserver.observe(container);
  } else {
    view?.addEventListener?.("resize", resize);
  }

  return {
    ui,
    update(value = model.get()) { render(value); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      input.destroy();
      gesture.destroy();
      controls.destroy();
      actions.destroy();
      resizeObserver?.disconnect();
      view?.removeEventListener?.("resize", resize);
      root.style.transform = "";
    },
  };
}

function createUi(value = {}) {
  const hsv = hexToHsv(value.color ?? "#2563eb");
  return {
    collapsed: false,
    feedbackOpen: false,
    layerScroll: 0,
    commentScroll: 0,
    commentFilter: "all",
    selectedCommentId: null,
    saved: false,
    picker: { open: false, ...hsv, recent: [], picking: false, point: null, color: hsvToHex(hsv.hue, hsv.saturation, hsv.value) },
    replyDrafts: {},
    replyPending: {},
    threadScroll: {},
    selection: null,
  };
}

function configureUiCanvas(canvas, ctx, view) {
  const dpr = Math.max(1, Number(view?.devicePixelRatio) || 1);
  const width = Math.round(WIDTH * dpr);
  const height = Math.round(HEIGHT * dpr);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  ctx.setTransform?.(dpr, 0, 0, dpr, 0, 0);
}
