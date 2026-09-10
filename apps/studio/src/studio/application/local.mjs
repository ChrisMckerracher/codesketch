const DRAW_TOOLS = new Set(['brush', 'pencil', 'marker', 'eraser', 'rect', 'ellipse', 'hand']);
const TABS = new Set(['layers', 'feedback']);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function handleLocal(intent, { state, model }) {
  if (!intent || typeof intent !== 'object' || typeof intent.type !== 'string') {
    return false;
  }
  switch (intent.type) {
    case 'tool.select': {
      const { tool } = intent;
      if (!DRAW_TOOLS.has(tool)) return false;
      state.setTool(tool);
      model.patch({ tool, context: 'tool', drawers: withDrawer(model.get().drawers, 'right', true) });
      return true;
    }
    case 'tool.return': {
      state.setTool('brush');
      model.patch({ tool: 'brush', context: 'tool', drawers: withDrawer(model.get().drawers, 'right', true) });
      return true;
    }
    case 'tool.properties': {
      const fields = readProperties(intent);
      if (!fields) return false;
      if (fields.size !== undefined) state.setSize(fields.size);
      if (fields.opacity !== undefined) state.setOpacity(fields.opacity);
      if (fields.color !== undefined) state.setColor(fields.color);
      model.patch(fields);
      return true;
    }
    case 'layer.inspect': {
      const { id } = intent;
      if (typeof id !== 'string' || !hasLayer(state, id)) return false;
      state.setTargetLayer(id);
      model.patch({ targetLayer: id, context: 'layer', drawers: withDrawer(model.get().drawers, 'right', true) });
      return true;
    }
    case 'tab.select': {
      const { tab } = intent;
      if (!TABS.has(tab)) return false;
      model.patch({ tab, drawers: withDrawer(model.get().drawers, 'left', true) });
      return true;
    }
    case 'filename.set': {
      const value = typeof intent.value === 'string' ? intent.value.trim() : '';
      if (value.length === 0 || value.length > 120) return false;
      model.patch({ filename: value });
      return true;
    }
    case 'drawer.set': {
      const { side, open } = intent;
      if ((side !== 'left' && side !== 'right') || typeof open !== 'boolean') return false;
      model.patch({ drawers: withDrawer(model.get().drawers, side, open) });
      return true;
    }
    default:
      return false;
  }
}

function readProperties(intent) {
  const fields = {};
  const { size, opacity, color } = intent;
  if (size !== undefined) {
    if (!Number.isInteger(size) || size < 1 || size > 100) return null;
    fields.size = size;
  }
  if (opacity !== undefined) {
    if (typeof opacity !== 'number' || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
      return null;
    }
    fields.opacity = opacity;
  }
  if (color !== undefined) {
    if (typeof color !== 'string' || !HEX_COLOR.test(color)) return null;
    fields.color = color.toLowerCase();
  }
  if (Object.keys(fields).length === 0) return null;
  return fields;
}

function hasLayer(state, id) {
  const layers = state?.snapshot?.document?.layers;
  return Array.isArray(layers) && layers.some((layer) => layer?.id === id);
}

function withDrawer(drawers, side, open) {
  return { ...drawers, [side]: open };
}
