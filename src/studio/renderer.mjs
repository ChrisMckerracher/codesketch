// Canvas rendering coordinator integrating domain createRenderer

import { createRenderer } from '../painting/rendering/index.mjs';

export class StudioRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderFn = createRenderer(canvas);
  }

  render(document, active = null, draft = null) {
    if (!document) return;
    this.renderFn(document, active, draft);
  }

  async exportPngBlob() {
    return new Promise((resolve, reject) => {
      this.canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas export failed to generate image data'));
        }
      }, 'image/png');
    });
  }
}
