import { createRenderer } from '../../painting/rendering/index.mjs';

function defaultCreateCanvas(width, height) {
  const canvas = globalThis.document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export async function renderCommittedPng(artwork, { createCanvas = defaultCreateCanvas, renderer = createRenderer } = {}) {
  const canvas = createCanvas(artwork.width, artwork.height);
  const render = renderer(canvas);
  render(artwork, null, null);
  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export produced no image'))), 'image/png');
  });
}
