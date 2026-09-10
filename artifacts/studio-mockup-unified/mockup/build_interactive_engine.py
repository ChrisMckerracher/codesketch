import json

with open('/private/tmp/codesketch-designer-20260910-fresh/artifacts/drawing/build_unified_mockup_v2.py') as f:
    py_code = f.read()

# Extract GLYPHS from build_unified_mockup_v2.py
start_idx = py_code.find("GLYPHS = {")
end_idx = py_code.find("def draw_text", start_idx)
glyphs_str = py_code[start_idx:end_idx].strip()

html_template = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Codesketch Studio — 100% Exact Native Mockup</title>
  <style>
    * {{
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }}
    body {{
      background: #0B0F19;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      user-select: none;
      padding: 20px;
    }}
    .studio-container {{
      position: relative;
      width: 1000px;
      height: 700px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px #1E293B;
      border-radius: 4px;
      overflow: hidden;
      background: #0F172A;
    }}
    #studioCanvas {{
      display: block;
      width: 1000px;
      height: 700px;
    }}
    /* Seamless Interactive Hotspots */
    .interactive-layer {{
      position: absolute;
      top: 0;
      left: 0;
      width: 1000px;
      height: 700px;
      pointer-events: none;
    }}
    .interactive-btn {{
      position: absolute;
      pointer-events: auto;
      cursor: pointer;
      background: transparent;
      border: none;
      outline: none;
    }}
    .interactive-btn:hover {{
      background: rgba(13, 153, 255, 0.08);
      border-radius: 3px;
    }}
    /* Native Reply Input Box Overlay */
    #replyInput {{
      position: absolute;
      top: 202px;
      left: 130px;
      width: 184px;
      height: 24px;
      background: transparent;
      border: none;
      outline: none;
      font-family: monospace;
      font-size: 11px;
      color: #0F172A;
      padding: 2px 8px;
      pointer-events: auto;
    }}
    /* Notification Toast */
    .toast {{
      position: absolute;
      bottom: 24px;
      left: 370px;
      background: #0F172A;
      color: #FFFFFF;
      border: 1px solid #334155;
      padding: 8px 16px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 11px;
      font-weight: 600;
      box-shadow: 0 10px 15px -3px rgba(0,0,0,0.5);
      opacity: 0;
      transform: translateY(20px);
      transition: all 0.2s ease;
      pointer-events: none;
      z-index: 100;
    }}
    .toast.show {{
      opacity: 1;
      transform: translateY(0);
    }}
  </style>
</head>
<body>

  <div class="studio-container" id="studioContainer">
    <canvas id="studioCanvas" width="1000" height="700"></canvas>

    <div class="interactive-layer" id="interactiveLayer">
      <!-- Tool Buttons (x: 754..986, y: 70..98) -->
      <button class="interactive-btn" id="btnToolInk" style="top: 70px; left: 754px; width: 58px; height: 28px;" title="Tool: Ink"></button>
      <button class="interactive-btn" id="btnToolPencil" style="top: 70px; left: 814px; width: 58px; height: 28px;" title="Tool: Pencil"></button>
      <button class="interactive-btn" id="btnToolMark" style="top: 70px; left: 874px; width: 58px; height: 28px;" title="Tool: Marker"></button>
      <button class="interactive-btn" id="btnToolErase" style="top: 70px; left: 932px; width: 54px; height: 28px;" title="Tool: Eraser"></button>

      <!-- Sliders Hotspots -->
      <button class="interactive-btn" id="sliderSizeLess" style="top: 150px; left: 756px; width: 80px; height: 20px;" title="Decrease Size"></button>
      <button class="interactive-btn" id="sliderSizeMore" style="top: 150px; left: 836px; width: 84px; height: 20px;" title="Increase Size"></button>

      <button class="interactive-btn" id="sliderOpLess" style="top: 186px; left: 756px; width: 80px; height: 20px;" title="Decrease Opacity"></button>
      <button class="interactive-btn" id="sliderOpMore" style="top: 186px; left: 836px; width: 84px; height: 20px;" title="Increase Opacity"></button>

      <button class="interactive-btn" id="sliderSmLess" style="top: 222px; left: 756px; width: 80px; height: 20px;" title="Decrease Smoothing"></button>
      <button class="interactive-btn" id="sliderSmMore" style="top: 222px; left: 836px; width: 84px; height: 20px;" title="Increase Smoothing"></button>

      <!-- Layers (ly starts at 328, step 32) -->
      <button class="interactive-btn" id="layer05" style="top: 324px; left: 752px; width: 236px; height: 28px;" title="Layer 05"></button>
      <button class="interactive-btn" id="layer04" style="top: 356px; left: 752px; width: 236px; height: 28px;" title="Layer 04"></button>
      <button class="interactive-btn" id="layer03" style="top: 388px; left: 752px; width: 236px; height: 28px;" title="Layer 03"></button>
      <button class="interactive-btn" id="layer02" style="top: 420px; left: 752px; width: 236px; height: 28px;" title="Layer 02"></button>
      <button class="interactive-btn" id="layer01" style="top: 452px; left: 752px; width: 236px; height: 28px;" title="Layer 01"></button>
      <button class="interactive-btn" id="layer00" style="top: 484px; left: 752px; width: 236px; height: 28px;" title="Layer 00"></button>

      <!-- Header actions -->
      <button class="interactive-btn" id="btnHeaderFb" style="top: 11px; left: 826px; width: 48px; height: 26px;" title="Toggle Feedback"></button>
      <button class="interactive-btn" id="btnHeaderExport" style="top: 11px; left: 880px; width: 72px; height: 26px;" title="Export PNG"></button>
      <button class="interactive-btn" id="btnHeaderCollapse" style="top: 11px; left: 958px; width: 28px; height: 26px;" title="Collapse/Expand Panel"></button>

      <!-- Canvas Comment Pin -->
      <button class="interactive-btn" id="btnCommentPin" style="top: 215px; left: 478px; width: 34px; height: 34px; border-radius: 50%;" title="Toggle Feedback Pin"></button>

      <!-- Feedback Card Close & Submit -->
      <div id="cardInteractiveGroup">
        <button class="interactive-btn" id="btnCloseCard" style="top: 42px; left: 436px; width: 22px; height: 20px;" title="Close Feedback Card"></button>
        <input type="text" id="replyInput" placeholder="WRITE A REPLY..." value="" />
        <button class="interactive-btn" id="btnSubmitResume" style="top: 202px; left: 322px; width: 128px; height: 24px;" title="Submit & Resume"></button>
      </div>

    </div>

    <div class="toast" id="toast">Artwork exported!</div>
  </div>

  <script>
    // 1. EXACT VECTOR GLYPH ENGINE
    const GLYPHS = {
    'A': [[[0,7], [0,2], [2,0], [3,0], [5,2], [5,7]], [[0,4], [5,4]]],
    'B': [[[0,7], [0,0], [4,0], [5,1.5], [4,3.5], [0,3.5], [4,3.5], [5,5], [4,7], [0,7]]],
    'C': [[[5,1], [3,0], [2,0], [0,2], [0,5], [2,7], [3,7], [5,6]]],
    'D': [[[0,7], [0,0], [3,0], [5,2], [5,5], [3,7], [0,7]]],
    'E': [[[5,0], [0,0], [0,7], [5,7]], [[0,3.5], [4,3.5]]],
    'F': [[[0,7], [0,0], [5,0]], [[0,3.5], [3.5,3.5]]],
    'G': [[[5,1], [3,0], [2,0], [0,2], [0,5], [2,7], [4,7], [5,6], [5,3.5], [3,3.5]]],
    'H': [[[0,0], [0,7]], [[5,0], [5,7]], [[0,3.5], [5,3.5]]],
    'I': [[[0,0], [4,0]], [[2,0], [2,7]], [[0,7], [4,7]]],
    'J': [[[4,0], [4,5], [3,7], [1,7], [0,5]]],
    'K': [[[0,0], [0,7]], [[5,0], [0,4], [5,7]]],
    'L': [[[0,0], [0,7], [5,7]]],
    'M': [[[0,7], [0,0], [2.5,4], [5,0], [5,7]]],
    'N': [[[0,7], [0,0], [5,7], [5,0]]],
    'O': [[[2,0], [3,0], [5,2], [5,5], [3,7], [2,7], [0,5], [0,2], [2,0]]],
    'P': [[[0,7], [0,0], [4,0], [5,1.5], [4,3.5], [0,3.5]]],
    'Q': [[[2,0], [3,0], [5,2], [5,5], [3,7], [2,7], [0,5], [0,2], [2,0]], [[3,5], [5,7]]],
    'R': [[[0,7], [0,0], [4,0], [5,1.5], [4,3.5], [0,3.5]], [[3,3.5], [5,7]]],
    'S': [[[5,1], [3,0], [1,0], [0,1.5], [1,3.5], [4,3.5], [5,5.5], [4,7], [2,7], [0,6]]],
    'T': [[[0,0], [5,0]], [[2.5,0], [2.5,7]]],
    'U': [[[0,0], [0,5], [2,7], [3,7], [5,5], [5,0]]],
    'V': [[[0,0], [2.5,7], [5,0]]],
    'W': [[[0,0], [1.5,7], [2.5,3], [3.5,7], [5,0]]],
    'X': [[[0,0], [5,7]], [[5,0], [0,7]]],
    'Y': [[[0,0], [2.5,3.5], [5,0]], [[2.5,3.5], [2.5,7]]],
    'Z': [[[0,0], [5,0], [0,7], [5,7]]],
    '0': [[[2,0], [3,0], [5,2], [5,5], [3,7], [2,7], [0,5], [0,2], [2,0]], [[4,1], [1,6]]],
    '1': [[[1,2], [2.5,0], [2.5,7]], [[1,7], [4,7]]],
    '2': [[[0,2], [1,0], [4,0], [5,2], [0,7], [5,7]]],
    '3': [[[0,1], [1,0], [4,0], [5,2], [3,3.5], [5,5], [4,7], [1,7], [0,6]]],
    '4': [[[4,7], [4,0], [0,5], [5,5]]],
    '5': [[[5,0], [0,0], [0,3.5], [4,3.5], [5,5], [4,7], [1,7], [0,6]]],
    '6': [[[4,0], [2,0], [0,3], [0,5], [2,7], [4,7], [5,5], [4,3.5], [0,3.5]]],
    '7': [[[0,0], [5,0], [2,7]]],
    '8': [[[2,0], [3,0], [5,1.5], [3,3.5], [2,3.5], [0,1.5], [2,0]], [[2,3.5], [3,3.5], [5,5.5], [3,7], [2,7], [0,5.5], [2,3.5]]],
    '9': [[[5,3.5], [1,3.5], [0,2], [1,0], [4,0], [5,3], [5,5], [3,7], [1,7]]],
    ':': [[[2.5,2], [2.5,2.5]], [[2.5,5], [2.5,5.5]]],
    '-': [[[0,3.5], [5,3.5]]],
    '/': [[[0,7], [5,0]]],
    '+': [[[2.5,1], [2.5,6]], [[0,3.5], [5,3.5]]],
    '#': [[[1.5,0], [1.5,7]], [[3.5,0], [3.5,7]], [[0,2.5], [5,2.5]], [[0,4.5], [5,4.5]]],
    '[': [[[3,0], [1,0], [1,7], [3,7]]],
    ']': [[[1,0], [3,0], [3,7], [1,7]]],
    '[': [[[3,0], [1,2], [1,5], [3,7]]],
    ']': [[[1,0], [3,2], [3,5], [1,7]]],
    '%': [[[0,1], [1,1]], [[4,6], [5,6]], [[0,7], [5,0]]],
    '.': [[[2,6.5], [3,6.5]]],
    ',': [[[2,6], [3,6], [1,8]]],
    '=': [[[0,2.5], [5,2.5]], [[0,4.5], [5,4.5]]],
    '>': [[[0,1], [4,3.5], [0,6]]],
    '<': [[[4,1], [0,3.5], [4,6]]],
    '|': [[[2.5,0], [2.5,7]]],
    '&': [[[4,0], [2,0], [0,2], [0,3.5], [4,5], [4,7], [2,7], [0,5]], [[2,3.5], [5,7]]],
    '!': [[[2.5,0], [2.5,4.5]], [[2.5,6.5], [2.5,7]]],
    ' ': []
}

    const canvas = document.getElementById('studioCanvas');
    const ctx = canvas.getContext('2d');

    // Drawing Primitives exactly matching Codesketch Engine
    function draw_rect(x, y, w, h, color, opacity = 1.0) {{
      x = Math.max(0, Math.min(1000 - w, x));
      y = Math.max(0, Math.min(700 - h, y));
      w = Math.max(1, Math.min(1000 - x, w));
      h = Math.max(1, Math.min(700 - y, h));
      ctx.fillStyle = color;
      ctx.globalAlpha = opacity;
      ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
      ctx.globalAlpha = 1.0;
    }}

    function draw_ellipse(x, y, w, h, color, opacity = 1.0) {{
      x = Math.max(0, Math.min(1000 - w, x));
      y = Math.max(0, Math.min(700 - h, y));
      w = Math.max(1, Math.min(1000 - x, w));
      h = Math.max(1, Math.min(700 - y, h));
      ctx.fillStyle = color;
      ctx.globalAlpha = opacity;
      ctx.beginPath();
      ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    }}

    function draw_rounded_rect(x, y, w, h, r, color, opacity = 1.0) {{
      r = Math.min(r, Math.floor(w / 2), Math.floor(h / 2));
      if (r <= 0) {{
        draw_rect(x, y, w, h, color, opacity);
        return;
      }}
      draw_rect(x + r, y, w - 2*r, h, color, opacity);
      draw_rect(x, y + r, r, h - 2*r, color, opacity);
      draw_rect(x + w - r, y + r, r, h - 2*r, color, opacity);
      draw_ellipse(x, y, 2*r, 2*r, color, opacity);
      draw_ellipse(x + w - 2*r, y, 2*r, 2*r, color, opacity);
      draw_ellipse(x, y + h - 2*r, 2*r, 2*r, color, opacity);
      draw_ellipse(x + w - 2*r, y + h - 2*r, 2*r, 2*r, color, opacity);
    }}

    function draw_stroke(pts, color = "#1E293B", size = 2, opacity = 1.0) {{
      if (!pts || pts.length === 0) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.globalAlpha = opacity;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {{
        ctx.lineTo(pts[i][0], pts[i][1]);
      }}
      if (pts.length === 1) {{
        ctx.lineTo(pts[0][0] + 0.1, pts[0][1] + 0.1);
      }}
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }}

    function draw_text(text, x, y, scale = 1.0, color = "#1E293B", size = 1, opacity = 1.0) {{
      let cur_x = x;
      const char_w = 6 * scale;
      const spacing = 2 * scale;
      const upper = text.toUpperCase();
      for (let i = 0; i < upper.length; i++) {{
        const ch = upper[i];
        if (GLYPHS[ch]) {{
          const paths = GLYPHS[ch];
          for (const path of paths) {{
            const pts = path.map(p => [Math.round(cur_x + p[0] * scale), Math.round(y + p[1] * scale)]);
            draw_stroke(pts, color, size, opacity);
          }}
        }}
        cur_x += char_w + spacing;
      }}
    }}

    // State
    const state = {{
      activeTool: 'INK',
      size: 14,
      opacity: 100,
      smoothing: 75,
      activeLayer: '03',
      feedbackOpen: true,
      statusBadge: 'ACKNOWLEDGED',
      collapsed: false
    }};

    function renderStudio() {{
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
      for (let y = 250; y < 315; y += 12) {{
        draw_rect(0, y, cw, 14, "#BFDBFE", 0.7);
      }}

      // Midground Ridge
      const mtn_mid = [
        [0, 320], [50, 285], [110, 310], [180, 240], [260, 310],
        [340, 230], [420, 290], [500, 220], [580, 280], [660, 240], [cw, 270]
      ];
      draw_stroke(mtn_mid, "#3B82F6", 8);
      for (let y = 300; y < 385; y += 12) {{
        draw_rect(0, y, cw, 14, "#2563EB", 0.8);
      }}

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

      // Pine Trees
      const pines = [30, 70, 120, 170, 220, 270, 320, 370, 420, 470, 520, 570, 620, 670, 710];
      for (const px of pines) {{
        if (px > cw - 10) continue;
        const py = px < 400 ? 380 : 360;
        draw_stroke([[px, py+28], [px, py]], "#022C22", 3);
        draw_stroke([[px-7, py+16], [px, py+3], [px+7, py+16]], "#064E3B", 4);
        draw_stroke([[px-11, py+26], [px, py+10], [px+11, py+26]], "#047857", 4);
      }}

      // Deep Reflective Lake
      draw_rect(0, 510, cw, 190, "#0F172A");
      const ripples = [
        [40, 530, 140], [220, 545, 180], [450, 535, 160],
        [90, 570, 150], [310, 580, 200], [560, 565, 140],
        [50, 615, 170], [270, 630, 190], [510, 620, 180],
        [120, 665, 160], [380, 675, 210]
      ];
      for (const r of ripples) draw_rect(r[0], r[1], r[2], 3, "#38BDF8", 0.45);

      // Live Brush Stroke
      const brush_pts = [
        [60, 330], [160, 310], [280, 260], [380, 290], [480, 240], [570, 275]
      ];
      draw_stroke(brush_pts, "#2563EB", state.size, state.opacity / 100);

      // Cursor crosshair
      draw_ellipse(564, 269, 12, 12, "#FFFFFF", 0.6);
      draw_stroke([[570, 265], [570, 285]], "#FFFFFF", 1);
      draw_stroke([[560, 275], [580, 275]], "#FFFFFF", 1);

      // 2. IN-APP FEEDBACK FLOW
      if (state.feedbackOpen) {{
        // Pin
        draw_ellipse(486, 222, 22, 22, "#0D99FF");
        draw_ellipse(488, 224, 18, 18, "#FFFFFF");
        draw_ellipse(491, 227, 12, 12, "#0D99FF");
        draw_stroke([[486, 238], [476, 248], [492, 242]], "#0D99FF", 2);

        // Feedback Card
        draw_rounded_rect(123, 41, 340, 228, 6, "#000000", 0.25);
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

        const badgeBg = state.statusBadge === 'COMMITTED' ? '#DCFCE7' : (state.statusBadge === 'EXECUTING...' ? '#DBEAFE' : '#DCFCE7');
        const badgeColor = state.statusBadge === 'EXECUTING...' ? '#1D4ED8' : '#15803D';
        draw_rounded_rect(222, 44, 98, 18, 3, badgeBg);
        draw_text(state.statusBadge, 228, 48, 0.7, badgeColor, 1);
        draw_text("X", 442, 47, 0.8, "#94A3B8", 1);

        // Thread Entry 1: Director
        draw_ellipse(132, 76, 12, 12, "#3B82F6");
        draw_text("DIRECTOR", 150, 78, 0.8, "#0F172A", 2);
        draw_text("2M AGO", 216, 79, 0.7, "#94A3B8", 1);
        draw_text("CLEAN TOOL BOX, CLARIFY ACTIVE LAYER,", 132, 98, 0.75, "#334155", 1);
        draw_text("AND SHOW IN-APP FEEDBACK FLOW.", 132, 112, 0.75, "#334155", 1);

        // Thread Entry 2: Artist Agent
        draw_rect(132, 130, 316, 1, "#F1F5F9");
        draw_ellipse(132, 138, 12, 12, "#10B981");
        draw_text("ARTIST AGENT", 150, 140, 0.8, "#047857", 2);
        draw_text("JUST NOW", 236, 141, 0.7, "#94A3B8", 1);
        draw_text("APPLIED IN V2: REMOVED CLUTTER,", 132, 160, 0.75, "#065F46", 1);
        draw_text("EXPANDED WIDESCREEN, AND UNIFIED FLOW.", 132, 174, 0.75, "#065F46", 1);

        // Action Box
        draw_rect(120, 194, 340, 1, "#E2E8F0");
        draw_rounded_rect(130, 202, 184, 24, 3, "#F8FAFC");
        draw_rect(130, 202, 184, 1, "#CBD5E1");

        draw_rounded_rect(322, 202, 128, 24, 3, "#0D99FF");
        draw_text("SUBMIT & RESUME", 330, 209, 0.75, "#FFFFFF", 1);

        // Leader line
        draw_stroke([[450, 230], [476, 248]], "#0D99FF", 2, 0.7);
      }}

      // 3. UNIFIED STUDIO INSPECTOR (RIGHT PANEL: x: 740..1000)
      if (!state.collapsed) {{
        draw_rect(740, 0, 260, 700, "#FFFFFF");
        draw_rect(740, 0, 1, 700, "#E2E8F0");

        // Header
        draw_text("STUDIO", 754, 17, 0.95, "#0F172A", 2);

        // FB button [FB 1]
        draw_rounded_rect(826, 11, 48, 26, 4, "#EFF6FF");
        draw_rect(826, 11, 48, 1, "#BFDBFE");
        draw_text("FB", 834, 18, 0.8, "#1D4ED8", 1);
        draw_ellipse(858, 15, 10, 10, "#EF4444");
        draw_text("1", 861, 16, 0.65, "#FFFFFF", 1);

        // Single EXPORT button
        draw_rounded_rect(880, 11, 72, 26, 4, "#0D99FF");
        draw_text("EXPORT", 894, 18, 0.85, "#FFFFFF", 2);

        // Collapse toggle [|>]
        draw_rounded_rect(958, 11, 28, 26, 4, "#F8FAFC");
        draw_rect(958, 11, 28, 1, "#E2E8F0");
        draw_stroke([[968, 18], [974, 24], [968, 30]], "#64748B", 2);
        draw_stroke([[978, 18], [978, 30]], "#64748B", 2);
        draw_rect(740, 46, 260, 1, "#E2E8F0");

        // Section 1: Tool Picker
        draw_text("TOOL", 756, 56, 0.85, "#94A3B8", 1);
        draw_rounded_rect(754, 70, 232, 28, 4, "#F1F5F9");
        draw_rect(754, 70, 232, 1, "#E2E8F0");

        // Active pill & text
        const toolPositions = {{
          'INK': {{ x: 756, w: 56, tx: 772 }},
          'PENCIL': {{ x: 814, w: 56, tx: 824 }},
          'MARK': {{ x: 872, w: 56, tx: 882 }},
          'ERASE': {{ x: 928, w: 56, tx: 936 }}
        }};
        const pos = toolPositions[state.activeTool];
        draw_rounded_rect(pos.x, 72, pos.w, 24, 3, "#0D99FF");

        draw_text("INK", 772, 79, 0.85, state.activeTool === 'INK' ? "#FFFFFF" : "#64748B", state.activeTool === 'INK' ? 2 : 1);
        draw_text("PENCIL", 824, 79, 0.85, state.activeTool === 'PENCIL' ? "#FFFFFF" : "#64748B", state.activeTool === 'PENCIL' ? 2 : 1);
        draw_text("MARK", 882, 79, 0.85, state.activeTool === 'MARK' ? "#FFFFFF" : "#64748B", state.activeTool === 'MARK' ? 2 : 1);
        draw_text("ERASE", 936, 79, 0.85, state.activeTool === 'ERASE' ? "#FFFFFF" : "#64748B", state.activeTool === 'ERASE' ? 2 : 1);
        draw_rect(754, 108, 232, 1, "#F1F5F9");

        // Section 2: Stroke Properties
        draw_text("STROKE PROPERTIES", 756, 120, 0.85, "#94A3B8", 1);

        // Size
        draw_text("SIZE", 756, 138, 0.9, "#475569", 1);
        draw_rounded_rect(934, 132, 52, 20, 3, "#F1F5F9");
        draw_rect(934, 132, 52, 1, "#CBD5E1");
        draw_text(`${{state.size}} PX`, 942, 138, 0.9, "#0F172A", 1);

        const sizeFillW = Math.round((state.size / 50) * 164);
        draw_rounded_rect(756, 156, 164, 6, 3, "#E2E8F0");
        draw_rounded_rect(756, 156, sizeFillW, 6, 3, "#0D99FF");
        draw_ellipse(756 + sizeFillW - 4, 152, 14, 14, "#FFFFFF");
        draw_ellipse(756 + sizeFillW - 2, 154, 10, 10, "#0D99FF");

        // Opacity
        draw_text("OPACITY", 756, 174, 0.9, "#475569", 1);
        draw_rounded_rect(934, 168, 52, 20, 3, "#F1F5F9");
        draw_rect(934, 168, 52, 1, "#CBD5E1");
        draw_text(`${{state.opacity}}%`, 942, 174, 0.9, "#0F172A", 1);

        const opFillW = Math.round((state.opacity / 100) * 164);
        draw_rounded_rect(756, 192, 164, 6, 3, "#E2E8F0");
        draw_rounded_rect(756, 192, opFillW, 6, 3, "#0D99FF");
        draw_ellipse(756 + opFillW - 4, 188, 14, 14, "#FFFFFF");
        draw_ellipse(756 + opFillW - 2, 190, 10, 10, "#0D99FF");

        // Smoothing
        draw_text("SMOOTHING", 756, 210, 0.9, "#475569", 1);
        draw_rounded_rect(934, 204, 52, 20, 3, "#F1F5F9");
        draw_rect(934, 204, 52, 1, "#CBD5E1");
        draw_text(`${{state.smoothing}}%`, 944, 210, 0.9, "#0F172A", 1);

        const smFillW = Math.round((state.smoothing / 100) * 164);
        draw_rounded_rect(756, 228, 164, 6, 3, "#E2E8F0");
        draw_rounded_rect(756, 228, smFillW, 6, 3, "#0D99FF");
        draw_ellipse(756 + smFillW - 4, 224, 14, 14, "#FFFFFF");
        draw_ellipse(756 + smFillW - 2, 226, 10, 10, "#0D99FF");

        // Swatch
        draw_rounded_rect(756, 248, 28, 28, 4, "#2563EB");
        draw_rounded_rect(792, 248, 94, 28, 4, "#F8FAFC");
        draw_rect(792, 248, 94, 1, "#E2E8F0");
        draw_text("#2563EB", 802, 256, 0.95, "#0F172A", 1);
        draw_rounded_rect(894, 248, 92, 28, 4, "#F8FAFC");
        draw_rect(894, 248, 92, 1, "#E2E8F0");
        draw_text("INK PIGMENT", 902, 256, 0.75, "#64748B", 1);
        draw_rect(754, 288, 232, 1, "#F1F5F9");

        // Section 3: Native Layers Stack
        draw_text("LAYERS", 756, 302, 0.95, "#0F172A", 2);
        draw_rounded_rect(930, 298, 56, 20, 3, "#F1F5F9");
        draw_rect(930, 298, 56, 1, "#E2E8F0");
        draw_text("+ NEW", 938, 302, 0.8, "#0D99FF", 1);

        const layers = [
          {{ num: "05", name: "HIGHLIGHTS", op: "100%" }},
          {{ num: "04", name: "BRUSH SHADING", op: "80%" }},
          {{ num: "03", name: "LINEART", op: "100%" }},
          {{ num: "02", name: "PENCIL ROUGHS", op: "60%" }},
          {{ num: "01", name: "BACKDROP WASH", op: "100%" }},
          {{ num: "00", name: "CANVAS FILL", op: "100%" }}
        ];

        let ly = 328;
        for (const l of layers) {{
          const is_active = state.activeLayer === l.num;
          if (is_active) {{
            draw_rounded_rect(752, ly - 4, 236, 28, 4, "#EFF6FF");
            draw_rect(752, ly - 4, 3, 28, "#0284C7");
            draw_ellipse(762, ly + 6, 8, 8, "#0284C7");
            draw_text(`${{l.num}} ${{l.name}}`, 776, ly + 4, 0.85, "#0369A1", 2);
            draw_text(l.op, 950, ly + 4, 0.8, "#0369A1", 1);
          }} else {{
            draw_ellipse(762, ly + 6, 8, 8, "#CBD5E1");
            draw_text(`${{l.num}} ${{l.name}}`, 776, ly + 4, 0.85, "#475569", 1);
            draw_text(l.op, 950, ly + 4, 0.8, "#94A3B8", 1);
          }}
          ly += 32;
        }}
        draw_rect(754, ly + 4, 232, 1, "#F1F5F9");

        // Section 4: Layer Settings
        draw_text("LAYER SETTINGS", 756, ly + 14, 0.85, "#94A3B8", 1);
        draw_text("BLEND MODE", 756, ly + 32, 0.85, "#475569", 1);
        draw_rounded_rect(874, ly + 26, 112, 22, 3, "#F8FAFC");
        draw_rect(874, ly + 26, 112, 1, "#CBD5E1");
        draw_text("NORMAL", 884, ly + 32, 0.8, "#0F172A", 1);
        draw_stroke([[972, ly + 34], [976, ly + 38], [980, ly + 34]], "#64748B", 1);

        draw_text("VISIBILITY", 756, ly + 56, 0.85, "#475569", 1);
        draw_rounded_rect(914, ly + 52, 72, 20, 3, "#ECFDF5");
        draw_rect(914, ly + 52, 72, 1, "#A7F3D0");
        draw_text("VISIBLE", 926, ly + 56, 0.75, "#047857", 1);

        // Footer
        draw_text("CODESKETCH ENGINE V2", 756, 668, 0.8, "#94A3B8", 1);
      }} else {{
        // Show collapse tab
        draw_rounded_rect(910, 12, 80, 26, 4, "#FFFFFF");
        draw_rect(910, 12, 80, 1, "#CBD5E1");
        draw_text("STUDIO <", 918, 18, 0.8, "#0D99FF", 2);
      }}
    }}

    // Initial render
    renderStudio();

    // Event Wire-up
    const toast = document.getElementById('toast');
    function showToast(msg) {{
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 1800);
    }}

    // Tools
    document.getElementById('btnToolInk').onclick = () => {{ state.activeTool = 'INK'; renderStudio(); showToast('Tool: Ink Active'); }};
    document.getElementById('btnToolPencil').onclick = () => {{ state.activeTool = 'PENCIL'; renderStudio(); showToast('Tool: Pencil Active'); }};
    document.getElementById('btnToolMark').onclick = () => {{ state.activeTool = 'MARK'; renderStudio(); showToast('Tool: Marker Active'); }};
    document.getElementById('btnToolErase').onclick = () => {{ state.activeTool = 'ERASE'; renderStudio(); showToast('Tool: Eraser Active'); }};

    // Sliders
    document.getElementById('sliderSizeLess').onclick = () => {{ state.size = Math.max(2, state.size - 2); renderStudio(); }};
    document.getElementById('sliderSizeMore').onclick = () => {{ state.size = Math.min(50, state.size + 2); renderStudio(); }};

    document.getElementById('sliderOpLess').onclick = () => {{ state.opacity = Math.max(10, state.opacity - 10); renderStudio(); }};
    document.getElementById('sliderOpMore').onclick = () => {{ state.opacity = Math.min(100, state.opacity + 10); renderStudio(); }};

    document.getElementById('sliderSmLess').onclick = () => {{ state.smoothing = Math.max(0, state.smoothing - 10); renderStudio(); }};
    document.getElementById('sliderSmMore').onclick = () => {{ state.smoothing = Math.min(100, state.smoothing + 10); renderStudio(); }};

    // Layers
    document.getElementById('layer05').onclick = () => {{ state.activeLayer = '05'; renderStudio(); showToast('Active: 05 Highlights'); }};
    document.getElementById('layer04').onclick = () => {{ state.activeLayer = '04'; renderStudio(); showToast('Active: 04 Brush Shading'); }};
    document.getElementById('layer03').onclick = () => {{ state.activeLayer = '03'; renderStudio(); showToast('Active: 03 Lineart'); }};
    document.getElementById('layer02').onclick = () => {{ state.activeLayer = '02'; renderStudio(); showToast('Active: 02 Pencil Roughs'); }};
    document.getElementById('layer01').onclick = () => {{ state.activeLayer = '01'; renderStudio(); showToast('Active: 01 Backdrop Wash'); }};
    document.getElementById('layer00').onclick = () => {{ state.activeLayer = '00'; renderStudio(); showToast('Active: 00 Canvas Fill'); }};

    // Header buttons
    document.getElementById('btnHeaderExport').onclick = () => showToast('1000x700 PNG Rasterized & Saved!');
    document.getElementById('btnHeaderCollapse').onclick = () => {{
      state.collapsed = !state.collapsed;
      renderStudio();
    }};

    // Feedback toggling
    document.getElementById('btnHeaderFb').onclick = () => {{
      state.feedbackOpen = !state.feedbackOpen;
      document.getElementById('cardInteractiveGroup').style.display = state.feedbackOpen ? 'block' : 'none';
      renderStudio();
    }};
    document.getElementById('btnCommentPin').onclick = () => {{
      state.feedbackOpen = !state.feedbackOpen;
      document.getElementById('cardInteractiveGroup').style.display = state.feedbackOpen ? 'block' : 'none';
      renderStudio();
    }};
    document.getElementById('btnCloseCard').onclick = () => {{
      state.feedbackOpen = false;
      document.getElementById('cardInteractiveGroup').style.display = 'none';
      renderStudio();
    }};

    // Submit & Resume
    document.getElementById('btnSubmitResume').onclick = () => {{
      const inp = document.getElementById('replyInput');
      const val = inp.value.trim();
      if (!val) return;
      state.statusBadge = 'EXECUTING...';
      renderStudio();
      showToast('Submitted: Executing & resuming playback...');
      inp.value = '';
      setTimeout(() => {{
        state.statusBadge = 'COMMITTED';
        renderStudio();
        showToast('Committed live to Codesketch canvas!');
      }}, 900);
    }};
  </script>
</body>
</html>
"""

with open('/private/tmp/codesketch-designer-20260910-fresh/artifacts/mockup/index.html', 'w') as f:
    f.write(html_template)
print("Built 100% exact interactive engine at artifacts/mockup/index.html")
