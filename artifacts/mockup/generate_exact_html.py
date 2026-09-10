import json

with open('/private/tmp/codesketch-designer-20260910-fresh/artifacts/drawing/build_unified_mockup_v2.py') as f:
    code = f.read()

ns = {}
exec(code, ns)
glyphs = ns['GLYPHS']
glyphs_json = json.dumps(glyphs)

html_content = '''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Codesketch Studio — Interactive Native Mockup</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      background: #0B0F19;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      user-select: none;
      padding: 0;
    }
    .studio-container {
      position: relative;
      width: 1000px;
      height: 700px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px #1E293B;
      border-radius: 4px;
      overflow: hidden;
      background: #0F172A;
    }
    #studioCanvas {
      display: block;
      width: 1000px;
      height: 700px;
      cursor: crosshair;
    }
    .interactive-layer {
      position: absolute;
      top: 0;
      left: 0;
      width: 1000px;
      height: 700px;
      pointer-events: none;
    }
    .interactive-btn {
      position: absolute;
      pointer-events: auto;
      cursor: pointer;
      background: transparent;
      border: none;
      outline: none;
    }
    #replyInput {
      position: absolute;
      top: 202px;
      left: 130px;
      width: 184px;
      height: 24px;
      background: transparent;
      border: none;
      outline: none;
      color: transparent;
      caret-color: #0284C7;
      padding: 2px 8px;
      pointer-events: auto;
    }
    #pickerHexInput {
      position: absolute;
      top: 288px;
      left: 564px;
      width: 92px;
      height: 24px;
      background: transparent;
      border: none;
      outline: none;
      color: transparent;
      caret-color: #0284C7;
      padding: 2px 8px;
      pointer-events: auto;
      display: none;
    }
  </style>
</head>
<body>

  <div class="studio-container" id="studioContainer">
    <canvas id="studioCanvas" width="1000" height="700"></canvas>

    <div class="interactive-layer" id="interactiveLayer">
      <!-- Header Actions -->
      <button class="interactive-btn" id="btnHeaderFb" style="top: 11px; left: 818px; width: 36px; height: 24px;" title="Toggle Feedback"></button>
      <button class="interactive-btn primary-cta" id="btnHeaderSave" style="top: 11px; left: 872px; width: 62px; height: 24px;" title="Save Project"></button>
      <button class="interactive-btn" id="btnHeaderCollapse" style="top: 11px; left: 958px; width: 30px; height: 24px;" title="Collapse Panel"></button>
      <button class="interactive-btn" id="btnCollapsedStudio" style="display: none; top: 12px; left: 896px; width: 94px; height: 28px;" title="Expand Studio"></button>

      <!-- Tool Buttons (x: 760..985, y: 70..98) -->
      <button class="interactive-btn" id="btnToolInk" style="top: 70px; left: 760px; width: 50px; height: 28px;" title="Tool: Ink"></button>
      <button class="interactive-btn" id="btnToolPencil" style="top: 70px; left: 815px; width: 55px; height: 28px;" title="Tool: Pencil"></button>
      <button class="interactive-btn" id="btnToolMark" style="top: 70px; left: 875px; width: 50px; height: 28px;" title="Tool: Marker"></button>
      <button class="interactive-btn" id="btnToolErase" style="top: 70px; left: 930px; width: 55px; height: 28px;" title="Tool: Eraser"></button>

      <!-- Stroke Sliders Direct Touch Zones -->
      <button class="interactive-btn" id="sliderTrackSize" style="top: 132px; left: 750px; width: 240px; height: 26px; cursor: ew-resize;" title="Drag Brush Size (1-100px)"></button>
      <button class="interactive-btn" id="sliderTrackOpacity" style="top: 162px; left: 750px; width: 240px; height: 26px; cursor: ew-resize;" title="Drag Stroke Opacity (1-100%)"></button>
      <button class="interactive-btn" id="sliderTrackSmoothing" style="top: 192px; left: 750px; width: 240px; height: 26px; cursor: ew-resize;" title="Drag Smoothing (0-100%)"></button>

      <!-- Pigment Hex Trigger -->
      <button class="interactive-btn" id="btnTriggerColorPicker" style="top: 224px; left: 914px; width: 72px; height: 24px;" title="Open Color Picker / Customize Pigment"></button>

      <!-- Pigment Chips Touch Zone (x: 750..990, y: 242..272) -->
      <div id="pigmentChipsGroup">
        <button class="interactive-btn" id="chip0" style="top: 246px; left: 754px; width: 22px; height: 22px; border-radius: 50%;" title="Lamp Black"></button>
        <button class="interactive-btn" id="chip1" style="top: 246px; left: 784px; width: 22px; height: 22px; border-radius: 50%;" title="Graphite Slate"></button>
        <button class="interactive-btn" id="chip2" style="top: 244px; left: 812px; width: 24px; height: 24px; border-radius: 50%;" title="Cobalt Blue"></button>
        <button class="interactive-btn" id="chip3" style="top: 246px; left: 844px; width: 22px; height: 22px; border-radius: 50%;" title="Cerulean Cyan"></button>
        <button class="interactive-btn" id="chip4" style="top: 246px; left: 874px; width: 22px; height: 22px; border-radius: 50%;" title="Emerald Green"></button>
        <button class="interactive-btn" id="chip5" style="top: 246px; left: 904px; width: 22px; height: 22px; border-radius: 50%;" title="Yellow Ochre"></button>
        <button class="interactive-btn" id="chip6" style="top: 246px; left: 934px; width: 22px; height: 22px; border-radius: 50%;" title="Cadmium Red"></button>
        <button class="interactive-btn" id="chip7" style="top: 246px; left: 964px; width: 22px; height: 22px; border-radius: 50%;" title="Titanium White"></button>
      </div>

      <!-- Layers Header -->
      <button class="interactive-btn" id="btnNewLayer" style="top: 288px; left: 932px; width: 56px; height: 24px;" title="Add New Layer"></button>

      <!-- Dynamic Layer Touch Container -->
      <div id="layersTouchContainer"></div>

      <!-- Canvas Comment Pin -->
      <button class="interactive-btn" id="btnCommentPin" style="top: 215px; left: 478px; width: 34px; height: 34px; border-radius: 50%;" title="Toggle Feedback Pin"></button>

      <!-- Feedback Card -->
      <div id="cardInteractiveGroup">
        <button class="interactive-btn" id="btnCloseCard" style="top: 42px; left: 436px; width: 22px; height: 20px;" title="Close Feedback Card"></button>
        <input type="text" id="replyInput" value="" autocomplete="off" spellcheck="false" />
        <button class="interactive-btn" id="btnSubmitResume" style="top: 202px; left: 322px; width: 128px; height: 24px;" title="Submit & Resume"></button>
      </div>

      <!-- Color Customization Popover Group (x: 476..724, y: 168..384) -->
      <div id="colorPickerGroup" style="display: none;">
        <button class="interactive-btn" id="btnClosePicker" style="top: 170px; left: 704px; width: 20px; height: 20px;" title="Close Color Picker"></button>
        <button class="interactive-btn" id="pickerField2D" style="top: 202px; left: 486px; width: 228px; height: 62px; cursor: crosshair;" title="Pick Saturation & Value"></button>
        <button class="interactive-btn" id="pickerHueSlider" style="top: 268px; left: 486px; width: 228px; height: 14px; cursor: ew-resize;" title="Drag Hue Spectrum"></button>
        <button class="interactive-btn" id="btnPickerEyedropper" style="top: 288px; left: 486px; width: 72px; height: 24px;" title="Sample Color From Canvas"></button>
        <input type="text" id="pickerHexInput" value="" autocomplete="off" spellcheck="false" />
        <button class="interactive-btn" id="btnApplyPigment" style="top: 320px; left: 486px; width: 228px; height: 26px;" title="Apply Pigment to Palette"></button>
        
        <!-- Recent Swatches -->
        <button class="interactive-btn" id="recent0" style="top: 350px; left: 536px; width: 20px; height: 20px; border-radius: 50%;"></button>
        <button class="interactive-btn" id="recent1" style="top: 350px; left: 564px; width: 20px; height: 20px; border-radius: 50%;"></button>
        <button class="interactive-btn" id="recent2" style="top: 350px; left: 592px; width: 20px; height: 20px; border-radius: 50%;"></button>
        <button class="interactive-btn" id="recent3" style="top: 350px; left: 620px; width: 20px; height: 20px; border-radius: 50%;"></button>
        <button class="interactive-btn" id="recent4" style="top: 350px; left: 648px; width: 20px; height: 20px; border-radius: 50%;"></button>
        <button class="interactive-btn" id="recent5" style="top: 350px; left: 676px; width: 20px; height: 20px; border-radius: 50%;"></button>
      </div>

    </div>
  </div>

  <script>
    const canvas = document.getElementById('studioCanvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const GLYPHS = ''' + glyphs_json + ''';

    function draw_rect(x, y, w, h, color, opacity = 1.0) {
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.fillStyle = color;
      ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
      ctx.restore();
    }

    function draw_rounded_rect(x, y, w, h, r, color, opacity = 1.0) {
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h), r);
      ctx.fill();
      ctx.restore();
    }

    function draw_ellipse(cx, cy, rx, ry, color, opacity = 1.0) {
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(Math.floor(cx), Math.floor(cy), Math.floor(rx/2), Math.floor(ry/2), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function draw_stroke(points, color, size = 1, opacity = 1.0) {
      if (points.length < 2) return;
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      ctx.beginPath();
      ctx.moveTo(points[0][0] + 0.5, points[0][1] + 0.5);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i][0] + 0.5, points[i][1] + 0.5);
      }
      ctx.stroke();
      ctx.restore();
    }

    function draw_text(text, start_x, start_y, scale = 1.0, color = "#FFFFFF", size = 1, spacing = 2) {
      const char_w = 5 * scale;
      let cur_x = start_x;
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      ctx.globalAlpha = 1.0;

      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === ' ') {
          cur_x += 4 * scale;
          continue;
        }
        if (GLYPHS[ch]) {
          const paths = GLYPHS[ch];
          for (let p = 0; p < paths.length; p++) {
            const path = paths[p];
            const pts = [];
            for (let k = 0; k < path.length; k++) {
              pts.push([
                Math.floor(cur_x + path[k][0] * scale) + 0.5,
                Math.floor(start_y + path[k][1] * scale) + 0.5
              ]);
            }
            if (pts.length === 1) {
              ctx.fillStyle = color;
              ctx.fillRect(Math.floor(pts[0][0]), Math.floor(pts[0][1]), 1, 1);
            } else {
              ctx.beginPath();
              ctx.moveTo(pts[0][0], pts[0][1]);
              for (let j = 1; j < pts.length; j++) {
                ctx.lineTo(pts[j][0], pts[j][1]);
              }
              ctx.stroke();
            }
          }
        }
        cur_x += char_w + spacing;
      }
      ctx.globalAlpha = 1.0;
    }

    const PIGMENTS = [
      { id: 0, x: 764, col: "#0F172A", name: "LAMP BLACK" },
      { id: 1, x: 794, col: "#64748B", name: "GRAPHITE 2B" },
      { id: 2, x: 824, col: "#2563EB", name: "COBALT BLUE" },
      { id: 3, x: 854, col: "#0EA5E9", name: "CERULEAN CYAN" },
      { id: 4, x: 884, col: "#10B981", name: "EMERALD GREEN" },
      { id: 5, x: 914, col: "#F59E0B", name: "YELLOW OCHRE" },
      { id: 6, x: 944, col: "#EF4444", name: "CADMIUM RED" },
      { id: 7, x: 974, col: "#FFFFFF", name: "TITANIUM WHITE" }
    ];

    // State
    const state = {
      activeTool: 'INK',
      size: 14,
      opacity: 100,
      smoothing: 75,
      color: '#2563EB',
      colorPickerOpen: false,
      eyedropperActive: false,
      pickerColor: '#2563EB',
      pickerHue: 220,
      pickerSat: 84,
      pickerVal: 92,
      recentMixes: ["#1E40AF", "#3B82F6", "#0284C7", "#0EA5E9", "#38BDF8", "#7DD3FC"],
      loupePos: null,
      loupeColor: '#2563EB',
      activeLayer: '03',
      saved: false,
      feedbackOpen: true,
      statusBadge: 'ACKNOWLEDGED',
      collapsed: false,
      layers: [
        { num: "05", name: "HIGHLIGHTS", op: "100%", opacityNum: 100, vis: true },
        { num: "04", name: "BRUSH SHADING", op: "80%", opacityNum: 80, vis: true },
        { num: "03", name: "LINEART", op: "100%", opacityNum: 100, vis: true },
        { num: "02", name: "PENCIL ROUGHS", op: "60%", opacityNum: 60, vis: true },
        { num: "01", name: "BACKDROP WASH", op: "100%", opacityNum: 100, vis: true },
        { num: "00", name: "CANVAS FILL", op: "100%", opacityNum: 100, vis: true }
      ],
      thread: [
        { author: "DIRECTOR", time: "2M AGO", color: "#3B82F6", lines: ["CLEAN TOOL BOX, CLARIFY ACTIVE LAYER,", "AND SHOW IN-APP FEEDBACK FLOW."] },
        { author: "ARTIST AGENT", time: "JUST NOW", color: "#10B981", lines: ["APPLIED IN V2: REMOVED CLUTTER,", "EXPANDED WIDESCREEN, AND UNIFIED FLOW."] }
      ],
      userStrokes: []
    };

    window.state = state;

    function renderStudio() {
      const cw = state.collapsed ? 1000 : 740;

      // Base Fill
      draw_rect(0, 0, 1000, 700, "#0F172A");

      // 1. WIDESCREEN EXPANSIVE CANVAS
      // Sky Gradient Bands
      draw_rect(0, 0, cw, 120, "#DDD6FE");
      draw_rect(0, 120, cw, 80, "#FED7AA");
      draw_rect(0, 200, cw, 60, "#FECDD3");
      draw_rect(0, 260, cw, 55, "#FEF08A");

      // Distant Mountain Range
      const mtn_distant = [
        [0, 260], [60, 220], [130, 250], [210, 180], [300, 255],
        [390, 190], [480, 240], [560, 175], [640, 230], [710, 195], [cw, 210]
      ];
      draw_stroke(mtn_distant, "#93C5FD", 6);
      for (let y = 250; y < 315; y += 12) {
        draw_rect(0, y, cw, 14, "#BFDBFE", 0.7);
      }

      // Midground Ridge
      const mtn_mid = [
        [0, 320], [50, 285], [110, 310], [180, 240], [260, 310],
        [340, 230], [420, 290], [500, 220], [580, 280], [660, 240], [cw, 270]
      ];
      draw_stroke(mtn_mid, "#3B82F6", 8);
      for (let y = 300; y < 385; y += 12) {
        draw_rect(0, y, cw, 14, "#2563EB", 0.8);
      }

      // Crags
      const crags = [
        [[180, 240], [200, 320]],
        [[340, 230], [320, 320]],
        [[340, 230], [365, 325]],
        [[500, 220], [480, 320]],
        [[500, 220], [525, 315]]
      ];
      for (const c of crags) draw_stroke(c, "#1D4ED8", 4);

      // Foreground Green Hills
      draw_rect(0, 410, cw, 105, "#065F46");
      const hill_pts = [
        [0, 410], [80, 370], [170, 400], [270, 350], [380, 390],
        [480, 340], [580, 380], [670, 350], [cw, 370]
      ];
      draw_stroke(hill_pts, "#047857", 10);

      // Foliage trees
      for (let tx = 30; tx <= 710; tx += 45) {
        if (tx >= cw) break;
        draw_stroke([[tx, 408], [tx, 380]], "#022C22", 3);
        draw_stroke([[tx - 7, 396], [tx, 383], [tx + 7, 396]], "#064E3B", 4);
        draw_stroke([[tx - 11, 406], [tx, 390], [tx + 11, 406]], "#047857", 4);
      }

      // Water Deep Blue Base
      draw_rect(0, 510, cw, 190, "#0F172A");
      const reflections = [
        [40, 530, 140], [220, 545, 180], [450, 535, 160],
        [90, 570, 150], [310, 580, 200], [560, 565, 140],
        [50, 615, 170], [270, 630, 190], [510, 620, 180],
        [120, 665, 160], [380, 675, 210]
      ];
      for (const [rx, ry, rw] of reflections) {
        if (rx < cw) draw_rect(rx, ry, Math.min(rw, cw - rx), 3, "#38BDF8", 0.45);
      }

      // Active Live Stroke on Canvas (03 Lineart layer)
      const lLineart = state.layers.find(l => l.num === '03');
      if (lLineart && lLineart.vis) {
        const live_stroke = [
          [60, 330], [160, 310], [280, 260], [380, 290], [480, 240], [570, 275]
        ];
        draw_stroke(live_stroke, "#2563EB", 14, 0.95 * (lLineart.opacityNum / 100));

        // Tool cursor crosshair
        if (!state.eyedropperActive) {
          draw_ellipse(570, 275, 12, 12, "#FFFFFF", 0.6);
          draw_stroke([[570, 265], [570, 285]], "#FFFFFF", 1);
          draw_stroke([[560, 275], [580, 275]], "#FFFFFF", 1);
        }
      }

      // Render interactive user-painted strokes
      if (state.userStrokes && state.userStrokes.length > 0) {
        for (const strk of state.userStrokes) {
          const lObj = state.layers.find(l => l.num === strk.layer);
          if (lObj && !lObj.vis) continue;

          const layerOp = lObj ? (lObj.opacityNum / 100) : 1.0;
          ctx.save();
          ctx.beginPath();
          ctx.strokeStyle = strk.color;
          ctx.lineWidth = strk.size;
          ctx.globalAlpha = strk.opacity * layerOp;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          if (strk.points.length === 1) {
            ctx.fillStyle = strk.color;
            ctx.arc(strk.points[0][0], strk.points[0][1], strk.size / 2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.moveTo(strk.points[0][0], strk.points[0][1]);
            for (let i = 1; i < strk.points.length; i++) {
              ctx.lineTo(strk.points[i][0], strk.points[i][1]);
            }
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // 2. IN-APP FEEDBACK PIN & CARD
      if (state.feedbackOpen) {
        // Comment Pin at (486, 222)
        draw_ellipse(497, 233, 22, 22, "#0D99FF");
        draw_ellipse(497, 233, 18, 18, "#FFFFFF");
        draw_ellipse(497, 233, 12, 12, "#0D99FF");
        draw_stroke([[486, 238], [476, 248], [492, 242]], "#0D99FF", 2);

        // Feedback Card (x: 120, y: 38, w: 340, h: 228)
        draw_rounded_rect(123, 41, 340, 228, 6, "rgba(0,0,0,0.25)");
        draw_rounded_rect(120, 38, 340, 228, 6, "#FFFFFF");
        draw_rect(120, 38, 340, 1, "#CBD5E1");
        draw_rect(120, 38, 1, 228, "#CBD5E1");
        draw_rect(459, 38, 1, 228, "#CBD5E1");
        draw_rect(120, 265, 340, 1, "#CBD5E1");

        // Header
        draw_rounded_rect(121, 39, 338, 28, 5, "#F8FAFC");
        draw_rect(120, 66, 340, 1, "#E2E8F0");
        draw_rounded_rect(130, 44, 86, 18, 3, "#E0F2FE");
        draw_text("FEEDBACK #1", 136, 48, 0.75, "#0284C7", 1);

        const isApplied = state.statusBadge === 'APPLIED';
        draw_rounded_rect(222, 44, isApplied ? 62 : 94, 18, 3, "#DCFCE7");
        draw_text(state.statusBadge, 228, 48, 0.75, "#15803D", 1);

        // Close X
        draw_stroke([[442, 47], [446, 53]], "#94A3B8", 1);
        draw_stroke([[446, 47], [442, 53]], "#94A3B8", 1);

        // Thread entries
        let ty = 76;
        for (let i = 0; i < Math.min(2, state.thread.length); i++) {
          const t = state.thread[i];
          if (i > 0) draw_rect(132, ty - 8, 316, 1, "#F1F5F9");
          draw_ellipse(138, ty + 6, 12, 12, t.color);
          draw_text(t.author, 150, ty + 2, 0.8, "#0F172A", 1);
          draw_text(t.time, 236, ty + 3, 0.7, "#94A3B8", 1);
          draw_text(t.lines[0], 132, ty + 22, 0.75, "#334155", 1);
          if (t.lines[1]) draw_text(t.lines[1], 132, ty + 36, 0.75, "#334155", 1);
          ty += 62;
        }

        // Action Box
        draw_rect(120, 194, 340, 1, "#E2E8F0");
        draw_rounded_rect(130, 202, 184, 24, 3, "#F8FAFC");
        draw_rect(130, 202, 184, 1, "#CBD5E1");
        draw_text(state.replyText || "WRITE A REPLY...", 138, 209, 0.75, state.replyText ? "#0F172A" : "#94A3B8", 1);

        draw_rounded_rect(322, 202, 128, 24, 3, "#0284C7");
        draw_text("SUBMIT & RESUME", 330, 209, 0.75, "#FFFFFF", 1);

        // Leader line
        draw_stroke([[450, 230], [476, 248]], "#0D99FF", 2, 0.7);
      }

      // 3. UNIFIED STUDIO INSPECTOR (RIGHT PANEL: x: 740..1000)
      if (!state.collapsed) {
        draw_rect(740, 0, 260, 700, "#FFFFFF");

        // Header (y: 0..44)
        draw_text("STUDIO", 756, 20, 0.95, "#0F172A", 1);

        // Feedback Toggle [FB] (Pure typography, no box)
        draw_text("FB", 830, 20, 0.85, state.feedbackOpen ? "#0284C7" : "#64748B", 1);

        // Primary SAVE button [SAVE]
        if (state.saved) {
          draw_rounded_rect(872, 11, 62, 24, 3, "#10B981");
          draw_text("SAVED", 884, 18, 0.85, "#FFFFFF", 1);
        } else {
          draw_rounded_rect(872, 11, 62, 24, 3, "#0284C7");
          draw_text("SAVE", 888, 18, 0.85, "#FFFFFF", 1);
        }

        // Collapse toggle icon [>|]
        draw_stroke([[968, 16], [974, 22], [968, 28]], "#64748B", 1.5);
        draw_stroke([[978, 16], [978, 28]], "#64748B", 1.5);

        // Section 1: Tool Picker
        draw_text("TOOL", 756, 56, 0.85, "#64748B", 1);
        draw_text("INK", 772, 79, 0.85, state.activeTool === 'INK' ? "#0284C7" : "#94A3B8", 1);
        draw_text("PENCIL", 824, 79, 0.85, state.activeTool === 'PENCIL' ? "#0284C7" : "#94A3B8", 1);
        draw_text("MARK", 882, 79, 0.85, state.activeTool === 'MARK' ? "#0284C7" : "#94A3B8", 1);
        draw_text("ERASE", 936, 79, 0.85, state.activeTool === 'ERASE' ? "#0284C7" : "#94A3B8", 1);

        // Section 2: Stroke Properties & Sliders
        draw_text("STROKE PROPERTIES", 756, 116, 0.85, "#64748B", 1);

        // SIZE Slider (1..100 PX)
        draw_text("SIZE", 756, 136, 0.8, "#475569", 1);
        draw_text(`${state.size} PX`, 942, 136, 0.8, "#0F172A", 1);
        draw_rect(756, 150, 228, 2, "#E2E8F0");
        const sizeRatio = Math.max(0, Math.min(1, (state.size - 1) / 99));
        const sizeFillW = Math.round(sizeRatio * 228);
        draw_rect(756, 150, sizeFillW, 2, "#0284C7");
        const sizeThumbX = 756 + sizeFillW;
        draw_ellipse(sizeThumbX, 151, 8, 8, "#0284C7");
        draw_ellipse(sizeThumbX, 151, 2, 2, "#FFFFFF");

        // OPACITY Slider (1..100%)
        draw_text("OPACITY", 756, 166, 0.8, "#475569", 1);
        draw_text(`${state.opacity}%`, 948, 166, 0.8, "#0F172A", 1);
        draw_rect(756, 180, 228, 2, "#E2E8F0");
        const opRatio = Math.max(0, Math.min(1, state.opacity / 100));
        const opFillW = Math.round(opRatio * 228);
        draw_rect(756, 180, opFillW, 2, "#0284C7");
        const opThumbX = 756 + opFillW;
        draw_ellipse(opThumbX, 181, 8, 8, "#0284C7");
        draw_ellipse(opThumbX, 181, 2, 2, "#FFFFFF");

        // SMOOTHING Slider (0..100%)
        draw_text("SMOOTHING", 756, 196, 0.8, "#475569", 1);
        draw_text(`${state.smoothing}%`, 952, 196, 0.8, "#0F172A", 1);
        draw_rect(756, 210, 228, 2, "#E2E8F0");
        const smRatio = Math.max(0, Math.min(1, state.smoothing / 100));
        const smFillW = Math.round(smRatio * 228);
        draw_rect(756, 210, smFillW, 2, "#0284C7");
        const smThumbX = 756 + smFillW;
        draw_ellipse(smThumbX, 211, 8, 8, "#0284C7");
        draw_ellipse(smThumbX, 211, 2, 2, "#FFFFFF");

        // INK PIGMENT & PALETTE
        draw_text("INK PIGMENT", 756, 230, 0.8, state.colorPickerOpen ? "#0284C7" : "#64748B", 1);
        if (state.colorPickerOpen) {
          draw_rounded_rect(916, 226, 68, 18, 3, "#E0F2FE");
          draw_text(state.color.toUpperCase(), 924, 230, 0.8, "#0284C7", 1);
        } else {
          draw_text(state.color.toUpperCase(), 924, 230, 0.8, "#0F172A", 1);
        }

        for (const p of PIGMENTS) {
          const is_sel = state.color.toUpperCase() === p.col.toUpperCase();
          if (is_sel) {
            draw_ellipse(p.x, 256, 20, 20, "#0284C7");
            draw_ellipse(p.x, 256, 16, 16, "#FFFFFF");
            draw_ellipse(p.x, 256, 12, 12, p.col);
          } else if (p.col === '#FFFFFF') {
            draw_ellipse(p.x, 256, 14, 14, "#CBD5E1");
            draw_ellipse(p.x, 256, 12, 12, "#FFFFFF");
          } else {
            draw_ellipse(p.x, 256, 12, 12, p.col);
          }
        }

        // Divider
        draw_rect(756, 276, 228, 1, "#F1F5F9");

        // Section 3: Layers Stack
        draw_text("LAYERS", 756, 296, 0.9, "#0F172A", 1);
        draw_text("+ NEW", 938, 296, 0.8, "#0284C7", 1);

        let ly = 320;
        state.renderedLayerRows = [];

        for (const l of state.layers) {
          const is_active = state.activeLayer === l.num;
          const rowColor = is_active ? "#0284C7" : (l.vis ? "#475569" : "#CBD5E1");
          const eyeColor = is_active ? "#0284C7" : (l.vis ? "#94A3B8" : "#CBD5E1");
          const rowHeight = is_active ? 48 : 30;

          state.renderedLayerRows.push({
            num: l.num,
            top: ly,
            height: rowHeight,
            isActive: is_active,
            layer: l
          });

          if (is_active) {
            draw_rect(740, ly - 2, 3, 44, "#0284C7");
            draw_rect(743, ly - 2, 257, 44, "#F0F9FF");
            draw_text(`${l.num} ${l.name}`, 756, ly + 4, 0.85, "#0284C7", 1);
            draw_text(l.op, 934, ly + 4, 0.8, "#0284C7", 1);

            // Eye Icon
            const ex = 972, ey = ly + 4;
            draw_stroke([[ex, ey+2], [ex+3, ey], [ex+7, ey], [ex+10, ey+2]], eyeColor, 1);
            draw_stroke([[ex, ey+2], [ex+3, ey+4], [ex+7, ey+4], [ex+10, ey+2]], eyeColor, 1);
            if (l.vis) {
              draw_stroke([[ex+5, ey+2], [ex+5.1, ey+2.1]], eyeColor, 1.5);
            } else {
              draw_stroke([[ex+1, ey-1], [ex+9, ey+5]], "#EF4444", 1.2);
            }

            // Inline Micro-slider for Layer Opacity
            draw_text("OPACITY", 756, ly + 24, 0.65, "#0369A1", 1);
            draw_rect(810, ly + 26, 124, 2, "#BAE6FD");
            const layerOpVal = l.opacityNum;
            const layerOpRatio = Math.max(0, Math.min(1, layerOpVal / 100));
            const layerFillW = Math.round(layerOpRatio * 124);
            draw_rect(810, ly + 26, layerFillW, 2, "#0284C7");
            const layerThumbX = 810 + layerFillW;
            draw_ellipse(layerThumbX, ly + 27, 6, 6, "#0284C7");
            draw_ellipse(layerThumbX, ly + 27, 2, 2, "#FFFFFF");
            draw_text(`${layerOpVal}%`, 944, ly + 24, 0.65, "#0284C7", 1);

            ly += 48;
          } else {
            draw_text(`${l.num} ${l.name}`, 756, ly + 4, 0.85, rowColor, 1);
            draw_text(l.op, 934, ly + 4, 0.8, l.vis ? "#64748B" : "#CBD5E1", 1);

            // Eye Icon
            const ex = 972, ey = ly + 4;
            draw_stroke([[ex, ey+2], [ex+3, ey], [ex+7, ey], [ex+10, ey+2]], eyeColor, 1);
            draw_stroke([[ex, ey+2], [ex+3, ey+4], [ex+7, ey+4], [ex+10, ey+2]], eyeColor, 1);
            if (l.vis) {
              draw_stroke([[ex+5, ey+2], [ex+5.1, ey+2.1]], eyeColor, 1.5);
            } else {
              draw_stroke([[ex+1, ey-1], [ex+9, ey+5]], "#EF4444", 1.2);
            }

            ly += 30;
          }
        }

        // Update layer touch hotspots in HTML overlay
        updateLayerTouchZones();

        // Footer
        draw_text("CODESKETCH ENGINE V2", 756, 668, 0.8, "#94A3B8", 1);
      } else {
        // Collapsed floating button
        draw_rounded_rect(896, 12, 94, 28, 4, "#FFFFFF");
        draw_rect(896, 12, 94, 1, "#CBD5E1");
        draw_text("STUDIO <", 908, 18, 0.85, "#0284C7", 1);
      }

      // 4. COLOR CUSTOMIZATION POPOVER FLYOUT CARD (x: 476..724, y: 168..384)
      if (state.colorPickerOpen && !state.collapsed) {
        // Soft Shadow
        draw_rounded_rect(479, 171, 248, 218, 6, "rgba(0,0,0,0.22)");
        // Card Body
        draw_rounded_rect(476, 168, 248, 218, 6, "#FFFFFF");
        draw_rect(476, 168, 248, 1, "#CBD5E1");
        draw_rect(476, 168, 1, 218, "#CBD5E1");
        draw_rect(723, 168, 1, 218, "#CBD5E1");
        draw_rect(476, 385, 248, 1, "#CBD5E1");

        // Pointer arrow to #2563EB
        draw_stroke([[724, 230], [736, 235], [724, 240]], "#CBD5E1", 1);
        draw_stroke([[724, 231], [734, 235], [724, 239]], "#FFFFFF", 2);

        // Header
        draw_rounded_rect(477, 169, 246, 26, 5, "#F8FAFC");
        draw_rect(476, 195, 248, 1, "#E2E8F0");
        draw_rounded_rect(486, 173, 98, 18, 3, "#E0F2FE");
        draw_text("COLOR PICKER", 492, 177, 0.7, "#0284C7", 1);
        draw_stroke([[710, 176], [716, 182]], "#94A3B8", 1);
        draw_stroke([[716, 176], [710, 182]], "#94A3B8", 1);

        // 2D Saturation / Value Gradient Field
        ctx.save();
        const hGrad = ctx.createLinearGradient(486, 202, 714, 202);
        hGrad.addColorStop(0, '#FFFFFF');
        hGrad.addColorStop(1, `hsl(${state.pickerHue}, 100%, 50%)`);
        ctx.fillStyle = hGrad;
        ctx.fillRect(486, 202, 228, 62);

        const vGrad = ctx.createLinearGradient(486, 202, 486, 264);
        vGrad.addColorStop(0, 'rgba(0,0,0,0)');
        vGrad.addColorStop(1, '#000000');
        ctx.fillStyle = vGrad;
        ctx.fillRect(486, 202, 228, 62);
        ctx.restore();

        draw_rect(486, 202, 228, 1, "#94A3B8", 0.5);
        draw_rect(486, 263, 228, 1, "#94A3B8", 0.5);
        draw_rect(486, 202, 1, 62, "#94A3B8", 0.5);
        draw_rect(713, 202, 1, 62, "#94A3B8", 0.5);

        // Crosshair thumb in 2D field
        const satX = 486 + Math.round((state.pickerSat / 100) * 228);
        const valY = 202 + Math.round((1 - state.pickerVal / 100) * 62);
        draw_ellipse(satX, valY, 12, 12, "#FFFFFF");
        draw_ellipse(satX, valY, 8, 8, state.pickerColor);
        draw_stroke([[satX, valY - 9], [satX, valY + 9]], "#FFFFFF", 1);
        draw_stroke([[satX - 9, valY], [satX + 9, valY]], "#FFFFFF", 1);

        // 1D Hue Spectrum Slider Bar
        ctx.save();
        const hueGrad = ctx.createLinearGradient(486, 270, 714, 270);
        hueGrad.addColorStop(0, '#FF0000');
        hueGrad.addColorStop(0.17, '#FFFF00');
        hueGrad.addColorStop(0.33, '#00FF00');
        hueGrad.addColorStop(0.5, '#00FFFF');
        hueGrad.addColorStop(0.67, '#0000FF');
        hueGrad.addColorStop(0.83, '#FF00FF');
        hueGrad.addColorStop(1, '#FF0000');
        ctx.fillStyle = hueGrad;
        ctx.fillRect(486, 270, 228, 8);
        ctx.restore();

        const hueThumbX = 486 + Math.round((state.pickerHue / 360) * 228);
        draw_ellipse(hueThumbX, 274, 14, 14, "#FFFFFF");
        draw_ellipse(hueThumbX, 274, 10, 10, `hsl(${state.pickerHue}, 100%, 50%)`);

        // Action Row: Eyedropper + Hex + Swatch
        const isEye = state.eyedropperActive;
        draw_rounded_rect(486, 288, 72, 24, 3, isEye ? "#0284C7" : "#E0F2FE");
        draw_stroke([[495, 300], [501, 300]], isEye ? "#FFFFFF" : "#0284C7", 1);
        draw_stroke([[498, 297], [498, 303]], isEye ? "#FFFFFF" : "#0284C7", 1);
        draw_text(isEye ? "ACTIVE" : "PICK", 506, 294, 0.75, isEye ? "#FFFFFF" : "#0284C7", 1);

        // Hex Input Field
        draw_rounded_rect(564, 288, 92, 24, 3, "#F8FAFC");
        draw_rect(564, 288, 92, 1, "#CBD5E1");
        draw_text(state.pickerColor.toUpperCase(), 572, 294, 0.8, "#0F172A", 1);
        draw_stroke([[636, 292], [636, 306]], "#0284C7", 1.5); // blinking caret

        // Swatch Preview
        draw_rounded_rect(662, 288, 52, 24, 3, state.pickerColor);
        draw_text("NEW", 674, 295, 0.7, "#FFFFFF", 1);

        // Primary Button: [ APPLY PIGMENT ]
        draw_rounded_rect(486, 320, 228, 26, 4, "#0284C7");
        draw_text("APPLY PIGMENT", 538, 327, 0.85, "#FFFFFF", 1);

        // Recent Swatches
        draw_text("RECENT", 486, 356, 0.65, "#94A3B8", 1);
        let rx = 540;
        for (const rc of state.recentMixes) {
          draw_ellipse(rx + 6, 360, 14, 14, rc);
          rx += 28;
        }
      }

      // 5. LIVE CANVAS EYEDROPPER LOUPE (When active or hovered)
      if (state.eyedropperActive && state.loupePos) {
        const lx = state.loupePos.x;
        const ly = state.loupePos.y;
        const col = state.loupeColor || state.pickerColor;

        draw_ellipse(lx, ly, 28, 28, "#FFFFFF", 0.95);
        draw_ellipse(lx, ly, 24, 24, col);
        draw_stroke([[lx, ly - 14], [lx, ly - 4]], "#FFFFFF", 1.5);
        draw_stroke([[lx, ly + 4], [lx, ly + 14]], "#FFFFFF", 1.5);
        draw_stroke([[lx - 14, ly], [lx - 4, ly]], "#FFFFFF", 1.5);
        draw_stroke([[lx + 4, ly], [lx + 14, ly]], "#FFFFFF", 1.5);

        // Badge
        draw_rounded_rect(lx - 24, ly + 18, 48, 14, 2, "#0F172A", 0.85);
        draw_text(col.toUpperCase(), lx - 21, ly + 20, 0.55, "#FFFFFF", 1);

        // Leader line to pick button if popover is open
        if (state.colorPickerOpen) {
          draw_stroke([[lx + 16, ly], [486, 300]], "#0284C7", 1, 0.6);
        }
      }
    }

    window.renderStudio = renderStudio;

    function updateLayerTouchZones() {
      const container = document.getElementById('layersTouchContainer');
      if (!container) return;
      container.innerHTML = '';
      if (state.collapsed) return;

      state.renderedLayerRows.forEach(row => {
        // Row selection button
        const btnRow = document.createElement('button');
        btnRow.className = 'interactive-btn';
        btnRow.style.top = (row.top - 2) + 'px';
        btnRow.style.left = '740px';
        btnRow.style.width = '218px';
        btnRow.style.height = (row.isActive ? 24 : 28) + 'px';
        btnRow.title = 'Select ' + row.layer.num + ' ' + row.layer.name;
        btnRow.onclick = (e) => {
          e.stopPropagation();
          state.activeLayer = row.layer.num;
          renderStudio();
        };
        container.appendChild(btnRow);

        // Eye visibility button
        const btnEye = document.createElement('button');
        btnEye.className = 'interactive-btn';
        btnEye.style.top = (row.top - 2) + 'px';
        btnEye.style.left = '960px';
        btnEye.style.width = '30px';
        btnEye.style.height = '24px';
        btnEye.title = 'Toggle ' + row.layer.name + ' Visibility';
        btnEye.onclick = (e) => {
          e.stopPropagation();
          row.layer.vis = !row.layer.vis;
          renderStudio();
        };
        container.appendChild(btnEye);

        // Active layer micro-slider touch zone
        if (row.isActive) {
          const btnSlider = document.createElement('button');
          btnSlider.className = 'interactive-btn';
          btnSlider.style.top = (row.top + 20) + 'px';
          btnSlider.style.left = '800px';
          btnSlider.style.width = '180px';
          btnSlider.style.height = '22px';
          btnSlider.style.cursor = 'ew-resize';
          btnSlider.title = 'Drag Layer Opacity (0-100%)';
          
          btnSlider.onpointerdown = (e) => {
            e.stopPropagation();
            const setLayerOp = (clientX) => {
              const rect = canvas.getBoundingClientRect();
              const cx = clientX - rect.left;
              const ratio = Math.max(0, Math.min(1, (cx - 810) / 124));
              const val = Math.round(ratio * 100);
              row.layer.opacityNum = val;
              row.layer.op = val + '%';
              renderStudio();
            };
            setLayerOp(e.clientX);
            const moveHandler = (moveEvent) => setLayerOp(moveEvent.clientX);
            const upHandler = () => {
              window.removeEventListener('pointermove', moveHandler);
              window.removeEventListener('pointerup', upHandler);
            };
            window.addEventListener('pointermove', moveHandler);
            window.addEventListener('pointerup', upHandler);
          };
          container.appendChild(btnSlider);
        }
      });
    }

    renderStudio();

    // 4. INTERACTION EVENT LISTENERS

    // Primary SAVE Action
    document.getElementById('btnHeaderSave').onclick = () => {
      state.saved = true;
      renderStudio();
      setTimeout(() => {
        state.saved = false;
        renderStudio();
      }, 1500);
    };

    // Tool switching
    document.getElementById('btnToolInk').onclick = () => { state.activeTool = 'INK'; renderStudio(); };
    document.getElementById('btnToolPencil').onclick = () => { state.activeTool = 'PENCIL'; renderStudio(); };
    document.getElementById('btnToolMark').onclick = () => { state.activeTool = 'MARK'; renderStudio(); };
    document.getElementById('btnToolErase').onclick = () => { state.activeTool = 'ERASE'; renderStudio(); };

    // Continuous Slider Dragging Implementations
    function setupSlider(elemId, getVal, setVal) {
      const el = document.getElementById(elemId);
      if (!el) return;
      el.onpointerdown = (e) => {
        e.stopPropagation();
        const update = (clientX) => {
          const rect = canvas.getBoundingClientRect();
          const cx = clientX - rect.left;
          const ratio = Math.max(0, Math.min(1, (cx - 756) / 228));
          setVal(ratio);
          renderStudio();
        };
        update(e.clientX);
        const moveHandler = (moveEvent) => update(moveEvent.clientX);
        const upHandler = () => {
          window.removeEventListener('pointermove', moveHandler);
          window.removeEventListener('pointerup', upHandler);
        };
        window.addEventListener('pointermove', moveHandler);
        window.addEventListener('pointerup', upHandler);
      };
    }

    setupSlider('sliderTrackSize', null, (ratio) => {
      state.size = Math.max(1, Math.min(100, Math.round(1 + ratio * 99)));
    });

    setupSlider('sliderTrackOpacity', null, (ratio) => {
      state.opacity = Math.max(1, Math.min(100, Math.round(1 + ratio * 99)));
    });

    setupSlider('sliderTrackSmoothing', null, (ratio) => {
      state.smoothing = Math.max(0, Math.min(100, Math.round(ratio * 100)));
    });

    // Pigment Chips Selection & Double-Click to edit
    PIGMENTS.forEach((p, idx) => {
      const chip = document.getElementById('chip' + idx);
      if (chip) {
        chip.onclick = (e) => {
          e.stopPropagation();
          state.color = p.col;
          state.pickerColor = p.col;
          renderStudio();
        };
        chip.ondblclick = (e) => {
          e.stopPropagation();
          state.color = p.col;
          state.pickerColor = p.col;
          toggleColorPicker(true);
        };
      }
    });

    // Color Picker Popover Toggle
    function toggleColorPicker(open) {
      state.colorPickerOpen = (open !== undefined) ? open : !state.colorPickerOpen;
      const grp = document.getElementById('colorPickerGroup');
      grp.style.display = state.colorPickerOpen ? 'block' : 'none';
      const hexInp = document.getElementById('pickerHexInput');
      hexInp.style.display = state.colorPickerOpen ? 'block' : 'none';
      if (state.colorPickerOpen) {
        hexInp.value = state.pickerColor.toUpperCase();
      } else {
        state.eyedropperActive = false;
        state.loupePos = null;
      }
      renderStudio();
    }

    document.getElementById('btnTriggerColorPicker').onclick = () => toggleColorPicker();
    document.getElementById('btnClosePicker').onclick = () => toggleColorPicker(false);

    // Color Picker 2D Field Drag
    const field2D = document.getElementById('pickerField2D');
    field2D.onpointerdown = (e) => {
      e.stopPropagation();
      const update = (clientX, clientY) => {
        const rect = canvas.getBoundingClientRect();
        const cx = clientX - rect.left;
        const cy = clientY - rect.top;
        state.pickerSat = Math.max(0, Math.min(100, Math.round(((cx - 486) / 228) * 100)));
        state.pickerVal = Math.max(0, Math.min(100, Math.round((1 - (cy - 202) / 62) * 100)));
        state.pickerColor = hsvToHex(state.pickerHue, state.pickerSat, state.pickerVal);
        document.getElementById('pickerHexInput').value = state.pickerColor.toUpperCase();
        renderStudio();
      };
      update(e.clientX, e.clientY);
      const moveHandler = (moveEvent) => update(moveEvent.clientX, moveEvent.clientY);
      const upHandler = () => {
        window.removeEventListener('pointermove', moveHandler);
        window.removeEventListener('pointerup', upHandler);
      };
      window.addEventListener('pointermove', moveHandler);
      window.addEventListener('pointerup', upHandler);
    };

    // Color Picker Hue Slider Drag
    const hueSlider = document.getElementById('pickerHueSlider');
    hueSlider.onpointerdown = (e) => {
      e.stopPropagation();
      const update = (clientX) => {
        const rect = canvas.getBoundingClientRect();
        const cx = clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, (cx - 486) / 228));
        state.pickerHue = Math.round(ratio * 360);
        state.pickerColor = hsvToHex(state.pickerHue, state.pickerSat, state.pickerVal);
        document.getElementById('pickerHexInput').value = state.pickerColor.toUpperCase();
        renderStudio();
      };
      update(e.clientX);
      const moveHandler = (moveEvent) => update(moveEvent.clientX);
      const upHandler = () => {
        window.removeEventListener('pointermove', moveHandler);
        window.removeEventListener('pointerup', upHandler);
      };
      window.addEventListener('pointermove', moveHandler);
      window.addEventListener('pointerup', upHandler);
    };

    // Eyedropper Button
    document.getElementById('btnPickerEyedropper').onclick = (e) => {
      e.stopPropagation();
      state.eyedropperActive = !state.eyedropperActive;
      renderStudio();
    };

    // Hex input typing
    const hexInput = document.getElementById('pickerHexInput');
    hexInput.addEventListener('input', (e) => {
      let val = e.target.value.trim().toUpperCase();
      if (!val.startsWith('#')) val = '#' + val;
      if (/^#[0-9A-F]{6}$/i.test(val)) {
        state.pickerColor = val;
      }
      renderStudio();
    });

    // Apply Pigment
    document.getElementById('btnApplyPigment').onclick = (e) => {
      e.stopPropagation();
      state.color = state.pickerColor;
      if (!state.recentMixes.includes(state.pickerColor)) {
        state.recentMixes.unshift(state.pickerColor);
        state.recentMixes.pop();
      }
      toggleColorPicker(false);
    };

    // Recent Swatches Clicks
    for (let r = 0; r < 6; r++) {
      const btnR = document.getElementById('recent' + r);
      if (btnR) {
        btnR.onclick = (e) => {
          e.stopPropagation();
          state.pickerColor = state.recentMixes[r];
          document.getElementById('pickerHexInput').value = state.pickerColor.toUpperCase();
          renderStudio();
        };
      }
    }

    // Color conversion helper
    function hsvToHex(h, s, v) {
      s /= 100;
      v /= 100;
      const i = Math.floor((h / 60) % 6);
      const f = (h / 60) - i;
      const p = v * (1 - s);
      const q = v * (1 - f * s);
      const t = v * (1 - (1 - f) * s);
      let r = 0, g = 0, b = 0;
      if (i === 0) { r = v; g = t; b = p; }
      else if (i === 1) { r = q; g = v; b = p; }
      else if (i === 2) { r = p; g = v; b = t; }
      else if (i === 3) { r = p; g = q; b = v; }
      else if (i === 4) { r = t; g = p; b = v; }
      else if (i === 5) { r = v; g = p; b = q; }
      const toHex = x => Math.round(x * 255).toString(16).padStart(2, '0');
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
    }

    // New Layer
    document.getElementById('btnNewLayer').onclick = () => {
      const nextNum = String(state.layers.length).padStart(2, '0');
      state.layers.unshift({ num: nextNum, name: "DETAIL PASS", op: "100%", opacityNum: 100, vis: true });
      state.activeLayer = nextNum;
      renderStudio();
    };

    // Feedback Toggle & Submit
    function toggleFeedback(open) {
      state.feedbackOpen = (open !== undefined) ? open : !state.feedbackOpen;
      document.getElementById('cardInteractiveGroup').style.display = state.feedbackOpen ? 'block' : 'none';
      renderStudio();
    }

    document.getElementById('btnHeaderFb').onclick = () => toggleFeedback();
    document.getElementById('btnCommentPin').onclick = () => toggleFeedback();
    document.getElementById('btnCloseCard').onclick = () => toggleFeedback(false);

    function submitFeedback() {
      const inp = document.getElementById('replyInput');
      const val = inp.value.trim().toUpperCase();
      if (!val) return;
      state.thread.push({
        author: "YOU",
        time: "JUST NOW",
        color: "#0284C7",
        lines: [val.slice(0, 36), val.slice(36, 72)]
      });
      state.statusBadge = 'APPLIED';
      state.replyText = '';
      inp.value = '';
      renderStudio();
    }

    document.getElementById('btnSubmitResume').onclick = submitFeedback;
    document.getElementById('replyInput').addEventListener('input', (e) => {
      state.replyText = e.target.value.toUpperCase();
      renderStudio();
    });
    document.getElementById('replyInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitFeedback();
      }
    });

    // Panel Collapse & Expand
    function setCollapsed(c) {
      state.collapsed = c;
      const sidebarElements = [
        'btnHeaderFb', 'btnHeaderSave', 'btnHeaderCollapse',
        'btnToolInk', 'btnToolPencil', 'btnToolMark', 'btnToolErase',
        'sliderTrackSize', 'sliderTrackOpacity', 'sliderTrackSmoothing',
        'btnTriggerColorPicker', 'pigmentChipsGroup', 'btnNewLayer', 'layersTouchContainer'
      ];
      sidebarElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = c ? 'none' : 'block';
      });
      if (c) toggleColorPicker(false);
      document.getElementById('btnCollapsedStudio').style.display = c ? 'block' : 'none';
      renderStudio();
    }

    document.getElementById('btnHeaderCollapse').onclick = () => setCollapsed(true);
    document.getElementById('btnCollapsedStudio').onclick = () => setCollapsed(false);

    // 5. LIVE CANVAS DRAWING & EYEDROPPER SAMPLING (Pointer events)
    let isDrawing = false;
    let currentStroke = null;

    canvas.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (state.eyedropperActive) {
        if (x < 740) {
          state.loupePos = { x, y };
          try {
            const pixel = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
            const toHex = n => n.toString(16).padStart(2, '0');
            state.loupeColor = `#${toHex(pixel[0])}${toHex(pixel[1])}${toHex(pixel[2])}`.toUpperCase();
          } catch(err) {}
          renderStudio();
        }
        return;
      }

      if (!isDrawing || !currentStroke) return;
      const maxW = state.collapsed ? 1000 : 740;
      if (x > maxW) return;

      currentStroke.points.push([x, y]);
      renderStudio();
    });

    canvas.addEventListener('pointerdown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const maxW = state.collapsed ? 1000 : 740;
      if (x >= maxW) return;
      if (state.feedbackOpen && x >= 120 && x <= 460 && y >= 38 && y <= 266) return;
      if (state.colorPickerOpen && x >= 476 && x <= 724 && y >= 168 && y <= 384) return;

      // Eyedropper Sample Commit
      if (state.eyedropperActive) {
        try {
          const pixel = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
          const toHex = n => n.toString(16).padStart(2, '0');
          const sampledHex = `#${toHex(pixel[0])}${toHex(pixel[1])}${toHex(pixel[2])}`.toUpperCase();
          state.pickerColor = sampledHex;
          state.color = sampledHex;
          document.getElementById('pickerHexInput').value = sampledHex;
        } catch(err) {}
        state.eyedropperActive = false;
        state.loupePos = null;
        renderStudio();
        return;
      }

      // Drawing
      isDrawing = true;
      let strokeColor = state.color;
      if (state.activeTool === 'PENCIL') strokeColor = '#475569';
      else if (state.activeTool === 'ERASE') strokeColor = '#0F172A';

      const strokeSize = state.activeTool === 'MARK' ? state.size * 1.6 : (state.activeTool === 'PENCIL' ? Math.max(2, Math.round(state.size / 3)) : state.size);
      const strokeOpacity = state.activeTool === 'MARK' ? 0.4 : (state.opacity / 100);

      currentStroke = {
        tool: state.activeTool,
        color: strokeColor,
        size: strokeSize,
        opacity: strokeOpacity,
        layer: state.activeLayer,
        points: [[x, y]]
      };
      state.userStrokes.push(currentStroke);
      renderStudio();
    });

    window.addEventListener('pointerup', () => {
      isDrawing = false;
      currentStroke = null;
    });

  </script>
</body>
</html>
'''

with open('/private/tmp/codesketch-designer-20260910-fresh/artifacts/mockup/index.html', 'w') as f:
    f.write(html_content)

print("Generated exact interactive mockup with Color Picker and Eyedropper at /private/tmp/codesketch-designer-20260910-fresh/artifacts/mockup/index.html")
