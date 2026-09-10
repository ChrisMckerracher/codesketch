export const LIMITS = Object.freeze({ commands: 3000, points: 2000, totalPoints: 150000, layers: 24 });

export function number(value, name, min, max, fallback) {
  const result = value === undefined ? fallback : value;
  if (!Number.isFinite(result) || result < min || result > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return result;
}

export function label(value, name = 'name', max = 80) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`Invalid ${name}`);
  return value.trim();
}

export function color(value) {
  if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) throw new Error('Color must be #rrggbb');
  return value.toLowerCase();
}

export function identifier(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z][\w-]{0,39}$/.test(value)) throw new Error('Invalid layer ID');
  return value;
}

export function validateCommand(input, document) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a drawing command');
  const { type } = input;
  if (type === 'fill') return { type, color: color(input.color) };
  if (type === 'layer.add') {
    const id = identifier(input.id);
    if (document.layers.some(layer => layer.id === id)) throw new Error(`Layer ${id} already exists`);
    if (document.layers.length >= LIMITS.layers) throw new Error('Layer limit reached');
    return { type, id, name: label(input.name) };
  }
  if (type === 'layer.update') {
    const id = identifier(input.id);
    if (!document.layers.some(layer => layer.id === id)) throw new Error(`Unknown layer ${id}`);
    const update = { type, id };
    if (input.name !== undefined) update.name = label(input.name);
    if (input.opacity !== undefined) update.opacity = number(input.opacity, 'opacity', 0, 1);
    if (input.visible !== undefined) {
      if (typeof input.visible !== 'boolean') throw new Error('visible must be boolean');
      update.visible = input.visible;
    }
    return update;
  }
  if (!['stroke', 'rect', 'ellipse'].includes(type)) throw new Error(`Unknown command type ${String(type)}`);
  const layer = identifier(input.layer ?? 'paint');
  if (!document.layers.some(item => item.id === layer)) throw new Error(`Unknown layer ${layer}`);
  const result = { type, layer, color: color(input.color ?? '#253d38'), opacity: number(input.opacity, 'opacity', 0, 1, 1) };
  if (type === 'stroke') {
    if (!Array.isArray(input.points) || !input.points.length || input.points.length > LIMITS.points) throw new Error('Stroke needs 1–2000 points');
    result.points = input.points.map(point => {
      if (!Array.isArray(point) || point.length !== 2) throw new Error('Points must be [x,y] pairs');
      return [number(point[0], 'x', 0, document.width), number(point[1], 'y', 0, document.height)];
    });
    result.size = number(input.size, 'size', 1, 100, 8);
    result.brush = input.brush ?? 'brush';
    if (!['brush', 'pencil', 'marker', 'eraser'].includes(result.brush)) throw new Error('Unknown brush');
  } else {
    result.x = number(input.x, 'x', 0, document.width);
    result.y = number(input.y, 'y', 0, document.height);
    result.width = number(input.width, 'width', 1, document.width);
    result.height = number(input.height, 'height', 1, document.height);
    if (result.x + result.width > document.width || result.y + result.height > document.height) throw new Error('Shape exceeds canvas');
  }
  return result;
}
