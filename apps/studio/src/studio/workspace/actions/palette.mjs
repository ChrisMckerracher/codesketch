import { hexToHsv, hsvToHex } from "../palette/index.mjs";

const HEX = /^#[\da-f]{6}$/i;
const ACTIONS = new Set([
  "pigment.select", "pigment.open", "pigment.close", "pigment.sv",
  "pigment.hue", "pigment.pick", "pigment.recent", "pigment.apply",
]);

function failure(message, outcome = "validation") {
  return Object.assign(new Error(message), { outcome });
}

function validHex(value) { return typeof value === "string" && HEX.test(value); }

function number(value, name, min, max) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max) {
    throw failure(`${name} must be between ${min} and ${max}`);
  }
  return result;
}

function dispatch(application, intent) {
  try { return Promise.resolve(application.dispatch(intent)); }
  catch (error) { return Promise.reject(error); }
}

export function createPaletteActions({ application, ui, changed } = {}) {
  const picker = ui?.picker;
  const rerender = typeof changed === "function" ? changed : () => {};
  let destroyed = false;

  function emit() {
    try { rerender(); } catch {}
  }

  function previewColor(color) {
    const hsv = hexToHsv(color);
    Object.assign(picker, hsv, { color: color.toLowerCase(), picking: false, point: null });
  }

  function modelColor() {
    const color = application?.model?.get?.()?.color;
    if (!validHex(color)) throw failure("The current model color is invalid", "stale");
    return color.toLowerCase();
  }

  function select(payload) {
    const color = payload?.color;
    if (!validHex(color)) return Promise.reject(failure("Pigment color must be #rrggbb"));
    const value = color.toLowerCase();
    return dispatch(application, { type: "tool.properties", color: value }).then((result) => {
      if (destroyed) throw failure("Palette actions were destroyed", "stale");
      previewColor(value);
      emit();
      return result;
    });
  }

  function open() {
    previewColor(modelColor());
    Object.assign(picker, { open: true });
    emit();
  }

  function close() {
    Object.assign(picker, { open: false, picking: false, point: null });
    emit();
  }

  function saturationValue(payload) {
    const value = payload?.value;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw failure("Pigment saturation/value needs x and y");
    }
    const saturation = number(value.x, "saturation", 0, 1);
    const brightness = 1 - number(value.y, "value", 0, 1);
    Object.assign(picker, { saturation, value: brightness, color: hsvToHex(picker.hue, saturation, brightness) });
    emit();
  }

  function hue(payload) {
    const value = number(payload?.value, "hue", 0, 360);
    Object.assign(picker, { hue: value, color: hsvToHex(value, picker.saturation, picker.value) });
    emit();
  }

  function pick() {
    Object.assign(picker, { open: true, picking: true, point: null });
    emit();
  }

  function recent(payload) {
    const color = payload?.color;
    if (!validHex(color)) throw failure("Recent pigment must be #rrggbb");
    previewColor(color.toLowerCase());
    emit();
  }

  function apply() {
    if (!Array.isArray(picker.recent)) throw failure("Picker recent colors must be an array");
    const color = hsvToHex(picker.hue, picker.saturation, picker.value);
    const recents = [color, ...picker.recent];
    const unique = recents.filter((candidate, index) => recents.indexOf(candidate) === index).slice(0, 6);
    return dispatch(application, { type: "tool.properties", color }).then((result) => {
      if (destroyed) throw failure("Palette actions were destroyed", "stale");
      Object.assign(picker, { color, recent: unique, open: false, picking: false, point: null });
      emit();
      return result;
    });
  }

  function handle(action, payload = {}) {
    if (!ACTIONS.has(action)) return false;
    if (destroyed) return Promise.reject(failure("Palette actions were destroyed", "stale"));
    if (!picker || typeof picker !== "object" || Array.isArray(picker)) {
      return Promise.reject(failure("Palette actions need the canonical picker state"));
    }
    try {
      switch (action) {
        case "pigment.select": return select(payload);
        case "pigment.open": open(); break;
        case "pigment.close": close(); break;
        case "pigment.sv": saturationValue(payload); break;
        case "pigment.hue": hue(payload); break;
        case "pigment.pick": pick(); break;
        case "pigment.recent": recent(payload); break;
        case "pigment.apply": return apply();
      }
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function destroy() { destroyed = true; }

  return { handle, destroy };
}
