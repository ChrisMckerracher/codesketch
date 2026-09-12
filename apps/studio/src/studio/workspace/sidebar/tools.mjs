// Tool panel: header chrome row, tool selector, stroke property sliders, and
// the pigment row. Geometry derives from docs/reference-mockup/index.html.

const TOOL_ROW = { y: 70, height: 28, slotWidth: 57, labelY: 79 };
const ACTIVE_TOOL_COLOR = "#0284C7";
const IDLE_TOOL_COLOR = "#94A3B8";
const SLIDER_TRACK = { x: 756, width: 228 };

// Payload ids use the app's named brush modes; labels match the mockup.
const TOOLS = [
  { id: "brush", label: "INK", textX: 772, hitX: 756 },
  { id: "pencil", label: "PENCIL", textX: 824, hitX: 813 },
  { id: "marker", label: "MARK", textX: 882, hitX: 870 },
  { id: "eraser", label: "ERASE", textX: 936, hitX: 927 },
];

const PIGMENTS = [
  { color: "#000000", name: "Lamp Black" },
  { color: "#475569", name: "Graphite Slate" },
  { color: "#2563EB", name: "Cobalt Blue" },
  { color: "#0284C7", name: "Cerulean Cyan" },
  { color: "#059669", name: "Emerald Green" },
  { color: "#D97706", name: "Yellow Ochre" },
  { color: "#DC2626", name: "Cadmium Red" },
  { color: "#FFFFFF", name: "Titanium White" },
];

const CHIP_ROW_Y = 233;

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

function clampRound(value, min, max) {
  const n = Math.round(Number(value) || 0);
  return Math.min(max, Math.max(min, n));
}

export function renderToolPanel(v, model, controls) {
  renderToolRow(v, model, controls);
  renderStrokeProperties(v, model, controls);
  renderPigment(v, model, controls);
}

function renderToolRow(v, model, controls) {
  v.text("TOOLS", 756, 56, 0.8, "#64748B", 1);
  const activeTool = String(model?.tool ?? "");
  for (const tool of TOOLS) {
    const active = activeTool === tool.id;
    v.text(tool.label, tool.textX, TOOL_ROW.labelY, 0.85, active ? ACTIVE_TOOL_COLOR : IDLE_TOOL_COLOR, 1);
    controls.push(control("button", tool.hitX, TOOL_ROW.y, TOOL_ROW.slotWidth, TOOL_ROW.height,
      tool.label, "tool.select", { tool: tool.id }, { id: `tool.${tool.id}` }));
  }
}

function renderStrokeProperties(v, model, controls) {
  v.text("STROKE PROPERTIES", 756, 112, 0.8, "#64748B", 1);
  renderSlider(v, controls, {
    label: "SIZE", property: "size", labelY: 130, trackY: 142, valueX: 942,
    value: clampRound(model?.size, 1, 100), min: 1, max: 100, format: (n) => `${n} PX`,
  });
  renderSlider(v, controls, {
    label: "OPACITY", property: "opacity", labelY: 156, trackY: 168, valueX: 948,
    value: clampRound((Number(model?.opacity) || 0) * 100, 1, 100), min: 1, max: 100, format: (n) => `${n}%`,
  });
  renderSlider(v, controls, {
    label: "SMOOTHING", property: "smoothing", labelY: 182, trackY: 194, valueX: 948,
    value: clampRound(model?.smoothing, 0, 100), min: 0, max: 100, format: (n) => `${n}%`,
  });
}

function renderSlider(v, controls, { label, property, labelY, trackY, valueX, value, min, max, format }) {
  v.text(label, 756, labelY, 0.75, "#64748B", 1);
  v.text(format(value), valueX, labelY, 0.75, "#64748B", 1);
  v.rect(SLIDER_TRACK.x, trackY, SLIDER_TRACK.width, 2, "#E2E8F0");
  const fillWidth = Math.round(((value - min) / (max - min)) * SLIDER_TRACK.width);
  v.rect(SLIDER_TRACK.x, trackY, fillWidth, 2, "#94A3B8");
  v.ellipse(SLIDER_TRACK.x + fillWidth, trackY + 1, 8, 8, "#94A3B8");
  controls.push(control("range", 750, labelY, 240, 26, label, "tool.properties", { property }, {
    id: `tool.${property}`, value, min, max, step: 1, track: SLIDER_TRACK,
  }));
}

function renderPigment(v, model, controls) {
  v.text("INK PIGMENT", 756, 208, 0.75, "#64748B", 1);
  const hex = String(model?.color ?? "#000000").toUpperCase();
  v.roundRect(914, 204, 70, 18, 3, "#E0F2FE");
  v.text(hex, 922, 208, 0.7, "#0284C7", 1);
  controls.push(control("button", 914, 204, 70, 18, hex, "pigment.open", null, { id: "pigment.current" }));

  const selected = hex;
  for (let i = 0; i < PIGMENTS.length; i++) {
    const chip = PIGMENTS[i];
    const cx = 765 + i * 30;
    const isSelected = chip.color === selected;
    if (isSelected) {
      v.ellipse(cx, CHIP_ROW_Y, 24, 24, ACTIVE_TOOL_COLOR);
      v.ellipse(cx, CHIP_ROW_Y, 20, 20, "#FFFFFF");
    }
    v.ellipse(cx, CHIP_ROW_Y, 16, 16, chip.color);
    if (chip.color === "#FFFFFF") {
      v.stroke([[cx - 8, CHIP_ROW_Y], [cx + 8, CHIP_ROW_Y]], "#E2E8F0", 1);
    }
    controls.push(control("button", cx - 16, CHIP_ROW_Y - 16, 32, 32,
      chip.name, "pigment.select", { color: chip.color }, { id: `pigment.chip.${i}` }));
  }
}
