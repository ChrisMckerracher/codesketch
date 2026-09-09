import { drawStroke } from './stroke.mjs';

function drawMark(context, mark, progress = 1) {
  context.save();
  if (mark.type === 'stroke') drawStroke(context, mark, progress);
  else {
    context.globalAlpha = mark.opacity;
    context.fillStyle = mark.color;
    if (mark.type === 'rect') context.fillRect(mark.x, mark.y, mark.width, mark.height);
    if (mark.type === 'ellipse') {
      context.beginPath();
      context.ellipse(mark.x + mark.width / 2, mark.y + mark.height / 2, mark.width / 2, mark.height / 2, 0, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const buffers = new Map();
  let lastMarks = null;
  return function render(document, active = null, draft = null) {
    if (canvas.width !== document.width || canvas.height !== document.height) {
      canvas.width = document.width; canvas.height = document.height;
    }
    const signature = JSON.stringify(document.marks);
    if (signature !== lastMarks) {
      buffers.clear();
      for (const layer of document.layers) {
        const buffer = globalThis.document.createElement('canvas');
        buffer.width = document.width; buffer.height = document.height;
        const layerContext = buffer.getContext('2d');
        document.marks.filter(mark => mark.layer === layer.id).forEach(mark => drawMark(layerContext, mark));
        buffers.set(layer.id, buffer);
      }
      lastMarks = signature;
    }
    context.globalAlpha = 1;
    context.fillStyle = document.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    for (const layer of document.layers) {
      if (!layer.visible) continue;
      let buffer = buffers.get(layer.id);
      const transient = [active && { ...active.command, progress: active.progress }, draft].filter(mark => mark?.layer === layer.id);
      if (transient.length) {
        const composite = globalThis.document.createElement('canvas');
        composite.width = canvas.width; composite.height = canvas.height;
        const target = composite.getContext('2d');
        if (buffer) target.drawImage(buffer, 0, 0);
        transient.forEach(mark => drawMark(target, mark, mark.progress ?? 1));
        buffer = composite;
      }
      context.globalAlpha = layer.opacity;
      if (buffer) context.drawImage(buffer, 0, 0);
    }
    context.globalAlpha = 1;
  };
}
