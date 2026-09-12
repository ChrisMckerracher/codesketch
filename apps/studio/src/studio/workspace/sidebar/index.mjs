// Sidebar inspector: white 260px panel at x 740..1000 rendered with vector
// primitives. Pure render pass — draws the panel and returns control
// descriptors for the hit-target layer. No DOM, no dispatching.

import { createVector } from "../vector/index.mjs";
import { renderToolPanel } from "./tools.mjs";
import { renderLayersPanel } from "./layers.mjs";

const HEADER_BUTTON_Y = 11;
const HEADER_BUTTON_HEIGHT = 24;
const ACCENT = "#0284C7";
const SAVED_GREEN = "#10B981";

function control(kind, x, y, width, height, label, action, payload, extra = {}) {
  return {
    id: extra.id ?? action,
    kind,
    x,
    y,
    width,
    height,
    label,
    action,
    payload: payload ?? null,
    value: extra.value ?? null,
    min: extra.min ?? null,
    max: extra.max ?? null,
    step: extra.step ?? null,
    disabled: extra.disabled ?? false,
    ...(extra.axis === undefined ? {} : { axis: extra.axis }),
    ...(extra.track === undefined ? {} : { track: extra.track }),
  };
}

export function renderSidebar({ ctx, v, model, ui }) {
  const vector = v ?? createVector(ctx);
  const controls = [];
  if (ui?.collapsed) {
    renderExpandButton(vector, controls);
    return controls;
  }
  vector.rect(740, 0, 260, 700, "#FFFFFF");
  renderHeader(vector, model, ui, controls);
  renderToolPanel(vector, model, controls);
  renderLayersPanel(vector, ctx, model, ui, controls);
  return controls;
}

function renderHeader(v, model, ui, controls) {
  v.text("STUDIO", 756, 20, 0.95, "#0F172A", 1);

  if (ui?.feedbackOpen) {
    v.roundRect(820, HEADER_BUTTON_Y, 44, HEADER_BUTTON_HEIGHT, 3, ACCENT);
    v.text("FB", 834, 18, 0.85, "#FFFFFF", 1);
  } else {
    v.roundRect(820, HEADER_BUTTON_Y, 44, HEADER_BUTTON_HEIGHT, 3, "#F1F5F9");
    v.rect(820, HEADER_BUTTON_Y, 44, 1, "#CBD5E1");
    v.text("FB", 834, 18, 0.85, "#64748B", 1);
  }
  controls.push(control("button", 820, HEADER_BUTTON_Y, 44, HEADER_BUTTON_HEIGHT,
    "Feedback", "feedback.toggle", null, { id: "sidebar.feedback" }));

  const saved = Boolean(ui?.saved);
  const busy = Array.isArray(model?.pending) ? model.pending.length > 0 : Boolean(model?.pending);
  const saveDisabled = Boolean(model?.draft) || busy || !model?.snapshot || model?.connection !== "online";
  if (saved) {
    v.roundRect(872, HEADER_BUTTON_Y, 62, HEADER_BUTTON_HEIGHT, 3, SAVED_GREEN);
    v.text("SAVED", 884, 18, 0.85, "#FFFFFF", 1);
  } else {
    v.roundRect(872, HEADER_BUTTON_Y, 62, HEADER_BUTTON_HEIGHT, 3, ACCENT);
    v.text("SAVE", 888, 18, 0.85, "#FFFFFF", 1);
  }
  controls.push(control("button", 872, HEADER_BUTTON_Y, 62, HEADER_BUTTON_HEIGHT,
    "Save project", "project.save", null, { id: "sidebar.save", disabled: saveDisabled }));

  v.stroke([[968, 16], [974, 22], [968, 28]], "#64748B", 1.5);
  v.stroke([[978, 16], [978, 28]], "#64748B", 1.5);
  controls.push(control("button", 958, HEADER_BUTTON_Y, 30, HEADER_BUTTON_HEIGHT,
    "Collapse panel", "sidebar.collapse", null, { id: "sidebar.collapse" }));
}

function renderExpandButton(v, controls) {
  v.roundRect(896, 12, 94, 26, 3, "#F1F5F9");
  v.rect(896, 12, 94, 1, "#CBD5E1");
  v.stroke([[906, 19], [912, 25], [906, 31]], "#64748B", 1.5);
  v.stroke([[918, 19], [918, 31]], "#64748B", 1.5);
  v.text("PANEL", 926, 19, 0.75, "#64748B", 1);
  controls.push(control("button", 896, 12, 94, 26, "Expand panel", "sidebar.expand", null,
    { id: "sidebar.expand" }));
}
