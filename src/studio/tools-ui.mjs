// Tools sidebar controller for brush modes, sliders, colors, and background

const PALETTE = [
  '#253d38', '#4b6a5b', '#879d98', '#d96b27', '#f5dba0',
  '#3e5c76', '#6b705c', '#8d5b4c', '#1a1a1a', '#f7f3e8',
];

const BG_PRESETS = ['#f7f3e8', '#eee7d7', '#e2ded2', '#2b3d36'];

export class ToolsUI {
  constructor(state, api) {
    this.state = state;
    this.api = api;

    this.toolButtons = document.querySelectorAll('.tool-btn');
    this.sliderSize = document.getElementById('slider-size');
    this.labelSize = document.getElementById('label-size');
    this.sliderOpacity = document.getElementById('slider-opacity');
    this.labelOpacity = document.getElementById('label-opacity');
    this.paletteGrid = document.getElementById('palette-grid');
    this.inputColor = document.getElementById('input-color');
    this.previewCanvas = document.getElementById('color-preview-canvas');
    this.hexDisplay = document.getElementById('hex-display');
    this.bgSwatches = document.getElementById('bg-swatches');
    this.inputBgColor = document.getElementById('input-bg-color');
    this.btnApplyBg = document.getElementById('btn-apply-bg');

    this.initPalette();
    this.initBgSwatches();
    this.bindEvents();
    this.subscribeState();
    this.updateColorPreview(this.state.color);
  }

  initPalette() {
    this.paletteGrid.replaceChildren();
    for (const hex of PALETTE) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'palette-swatch-btn';
      btn.setAttribute('data-color', hex);
      btn.setAttribute('aria-label', `Color ${hex}`);

      const canvas = document.createElement('canvas');
      canvas.className = 'palette-swatch-canvas';
      canvas.width = 28;
      canvas.height = 28;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = hex;
      ctx.fillRect(0, 0, 28, 28);

      btn.appendChild(canvas);
      btn.addEventListener('click', () => this.state.setColor(hex));
      this.paletteGrid.appendChild(btn);
    }
  }

  initBgSwatches() {
    this.bgSwatches.replaceChildren();
    for (const hex of BG_PRESETS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bg-swatch-btn';
      btn.setAttribute('data-color', hex);
      btn.setAttribute('aria-label', `Background ${hex}`);

      const canvas = document.createElement('canvas');
      canvas.width = 24;
      canvas.height = 24;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = hex;
      ctx.fillRect(0, 0, 24, 24);

      btn.appendChild(canvas);
      btn.addEventListener('click', () => {
        this.inputBgColor.value = hex;
        this.state.setBgColor(hex);
      });
      this.bgSwatches.appendChild(btn);
    }
  }

  updateColorPreview(color) {
    if (this.previewCanvas) {
      const ctx = this.previewCanvas.getContext('2d');
      ctx.clearRect(0, 0, 28, 28);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 28, 28);
    }
    if (this.hexDisplay) {
      this.hexDisplay.textContent = color;
    }
    if (this.inputColor) {
      this.inputColor.value = color;
    }

    const swatches = this.paletteGrid.querySelectorAll('.palette-swatch-btn');
    for (const btn of swatches) {
      if (btn.getAttribute('data-color')?.toLowerCase() === color.toLowerCase()) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    }
  }

  bindEvents() {
    for (const btn of this.toolButtons) {
      btn.addEventListener('click', () => {
        const tool = btn.getAttribute('data-tool');
        if (tool) this.state.setTool(tool);
      });
    }

    this.sliderSize.addEventListener('input', (e) => {
      this.state.setSize(e.target.value);
    });

    this.sliderOpacity.addEventListener('input', (e) => {
      this.state.setOpacity(Number(e.target.value) / 100);
    });

    this.inputColor.addEventListener('input', (e) => {
      this.state.setColor(e.target.value);
    });

    this.inputBgColor.addEventListener('input', (e) => {
      this.state.setBgColor(e.target.value);
    });

    this.btnApplyBg.addEventListener('click', async () => {
      const color = this.state.bgColor;
      try {
        const snapshot = await this.api.sendCommands([{ type: 'fill', color }], {
          immediate: true,
          play: false,
        });
        this.state.setSnapshot(snapshot);
      } catch (err) {
        this.state.showNotification(`Background fill failed: ${err.message}`);
      }
    });
  }

  subscribeState() {
    this.state.on('tool', (tool) => {
      for (const btn of this.toolButtons) {
        if (btn.getAttribute('data-tool') === tool) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      }
    });

    this.state.on('size', (size) => {
      this.sliderSize.value = size;
      this.labelSize.textContent = `${size}px`;
    });

    this.state.on('opacity', (opacity) => {
      const pct = Math.round(opacity * 100);
      this.sliderOpacity.value = pct;
      this.labelOpacity.textContent = `${pct}%`;
    });

    this.state.on('color', (color) => {
      this.updateColorPreview(color);
    });
  }
}
