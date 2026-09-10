// artifacts/tumblr-art-v2.mjs
// Enhanced, hand-drawn Tumblr reaction doodle artwork for Codesketch.
// Eliminates primitive bounding-box color washes; uses organic, contour-following marker & pencil strokes.

import { writeFileSync } from 'node:fs';

function makeStroke(layer, points, { color = '#241b17', size = 3.5, opacity = 1.0, brush = 'pencil' } = {}) {
  return {
    type: 'stroke',
    layer,
    brush,
    color,
    size,
    opacity,
    points: points.map(([x, y]) => [
      Math.max(0, Math.min(1000, Math.round(x * 10) / 10)),
      Math.max(0, Math.min(700, Math.round(y * 10) / 10))
    ]),
  };
}

function smoothCurve(ctrlPoints, stepsPerSegment = 4) {
  if (ctrlPoints.length <= 2) return ctrlPoints;
  const pts = [];
  const p = [ctrlPoints[0], ...ctrlPoints, ctrlPoints[ctrlPoints.length - 1]];
  for (let i = 1; i < p.length - 2; i++) {
    const p0 = p[i - 1], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2];
    for (let t = 0; t <= stepsPerSegment; t++) {
      if (i > 1 && t === 0) continue;
      const t1 = t / stepsPerSegment;
      const t2 = t1 * t1;
      const t3 = t2 * t1;
      const x = 0.5 * ((2 * p1[0]) +
        (-p0[0] + p2[0]) * t1 +
        (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
        (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y = 0.5 * ((2 * p1[1]) +
        (-p0[1] + p2[1]) * t1 +
        (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
        (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      pts.push([x, y]);
    }
  }
  return pts;
}

// Hand-drawn marker wash generator (flowing strokes across a polygon or along a direction)
function markerWash(layer, strokeLines, { color = '#475569', size = 18, opacity = 0.35 } = {}) {
  const commands = [];
  for (const line of strokeLines) {
    commands.push(makeStroke(layer, smoothCurve(line), { color, size, opacity, brush: 'marker' }));
  }
  return commands;
}

// Diagonal shadow hatching
function hatch(layer, x1, y1, x2, y2, angleDeg = 45, spacing = 4.5, length = 12, { color = '#241b17', size = 1.8, opacity = 0.45 } = {}) {
  const commands = [];
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad) * length;
  const dy = Math.sin(rad) * length;
  const stepCount = Math.floor(Math.hypot(x2 - x1, y2 - y1) / spacing);
  for (let i = 0; i <= stepCount; i++) {
    const t = i / (stepCount || 1);
    const sx = x1 + (x2 - x1) * t;
    const sy = y1 + (y2 - y1) * t;
    commands.push(makeStroke(layer, [[sx, sy], [sx + dx, sy + dy]], { color, size, opacity, brush: 'pencil' }));
  }
  return commands;
}

// Comic font glyph definition
const GLYPHS = {
  ' ': { width: 4.5, strokes: [] },
  'I': { width: 4.5, strokes: [[[2.2, 0], [2.2, 8]], [[0.8, 0], [3.6, 0]], [[0.8, 8], [3.6, 8]]] },
  'S': { width: 6.2, strokes: [[[5.2, 1.2], [3.5, 0], [1.5, 1.2], [2.2, 3.8], [5.0, 5.2], [4.8, 8], [1.2, 7.5]]] },
  'E': { width: 5.5, strokes: [[[1.2, 0], [1.2, 8]], [[1.2, 0], [5.0, 0]], [[1.2, 4], [4.0, 4]], [[1.2, 8], [5.0, 8]]] },
  'c': { width: 5.2, strokes: [[[4.8, 4.2], [3.0, 3.5], [1.2, 5.5], [3.0, 8], [4.8, 7.5]]] },
  'a': { width: 5.5, strokes: [[[4.8, 4.2], [2.8, 3.5], [1.2, 5.5], [3.0, 8], [4.8, 7.5]], [[4.8, 3.6], [4.8, 8]]] },
  'n': { width: 5.5, strokes: [[[1.2, 3.5], [1.2, 8]], [[1.2, 4.8], [3.0, 3.5], [4.8, 4.5], [4.8, 8]]] },
  't': { width: 4.2, strokes: [[[2.2, 1.0], [2.2, 7.2], [3.8, 8.0]], [[0.8, 3.5], [3.8, 3.5]]] },
  'h': { width: 5.5, strokes: [[[1.2, 0.0], [1.2, 8.0]], [[1.2, 4.8], [3.0, 3.5], [4.8, 4.5], [4.8, 8.0]]] },
  'e': { width: 5.5, strokes: [[[1.2, 5.5], [4.8, 5.5], [4.2, 3.5], [2.8, 3.5], [1.2, 5.5], [2.8, 8.0], [4.8, 7.5]]] },
  's': { width: 4.8, strokes: [[[4.2, 4.2], [2.8, 3.5], [1.2, 4.5], [3.8, 5.8], [4.2, 7.2], [2.5, 8.0], [1.0, 7.2]]] },
  'w': { width: 7.5, strokes: [[[1.0, 3.5], [2.2, 8.0], [3.8, 5.0], [5.2, 8.0], [6.8, 3.5]]] },
  'p': { width: 5.5, strokes: [[[1.2, 3.5], [1.2, 11.0]], [[1.2, 4.0], [3.2, 3.5], [4.8, 5.0], [3.5, 7.5], [1.2, 7.0]]] },
  'o': { width: 5.5, strokes: [[[3.0, 3.5], [1.2, 5.5], [3.0, 8.0], [4.8, 5.5], [3.0, 3.5]]] },
  'u': { width: 5.5, strokes: [[[1.2, 3.5], [1.2, 7.0], [3.0, 8.0], [4.8, 7.0], [4.8, 3.5]], [[4.8, 4.5], [4.8, 8.0]]] },
  'r': { width: 4.5, strokes: [[[1.2, 3.5], [1.2, 8.0]], [[1.2, 4.8], [2.8, 3.5], [4.2, 4.2]]] },
  'i': { width: 2.8, strokes: [[[1.4, 3.5], [1.4, 8.0]], [[1.4, 1.2], [1.4, 1.8]]] },
  'g': { width: 5.5, strokes: [[[4.8, 4.2], [2.8, 3.5], [1.2, 5.5], [3.0, 7.5], [4.8, 7.0]], [[4.8, 3.5], [4.8, 9.5], [3.0, 11.0], [1.5, 10.0]]] },
  'f': { width: 4.5, strokes: [[[4.0, 0.5], [2.8, 0.0], [1.8, 1.5], [1.8, 8.0]], [[0.8, 3.5], [3.8, 3.5]]] },
  'y': { width: 5.2, strokes: [[[1.2, 3.5], [3.0, 7.5]], [[4.5, 3.5], [3.0, 7.5], [1.8, 11.0]]] },
  'k': { width: 5.5, strokes: [[[1.2, 0.0], [1.2, 8.0]], [[4.5, 3.5], [1.2, 5.5]], [[2.5, 5.0], [4.8, 8.0]]] },
  'b': { width: 5.5, strokes: [[[1.2, 0.0], [1.2, 8.0]], [[1.2, 4.5], [3.2, 3.5], [4.8, 5.5], [3.2, 7.8], [1.2, 8.0]]] },
  'l': { width: 3.2, strokes: [[[1.6, 0.0], [1.6, 7.5], [2.8, 8.0]]] },
};

function renderTextStrokes(text, startX, startY, scale = 1.35, layer = 'bubble', strokeOpts = {}) {
  const commands = [];
  let curX = startX;
  for (const char of text) {
    const glyph = GLYPHS[char] || { width: 4.5, strokes: [] };
    for (const strokePts of glyph.strokes) {
      const smoothed = smoothCurve(strokePts.map(([gx, gy]) => [curX + gx * scale, startY + gy * scale]), 2);
      commands.push(makeStroke(layer, smoothed, {
        brush: 'pencil',
        size: strokeOpts.size || 3.4,
        color: strokeOpts.color || '#09090b',
        opacity: 1.0,
      }));
    }
    curX += (glyph.width + 1.2) * scale;
  }
  return { commands, width: curX - startX };
}

function measureTextWidth(text, scale = 1.35) {
  let width = 0;
  for (const char of text) {
    const glyph = GLYPHS[char] || { width: 4.5 };
    width += (glyph.width + 1.2) * scale;
  }
  return width;
}

// ====================================================
// PASS 1: Arena & Architecture
// ====================================================
function buildPass1Arena() {
  const commands = [
    { type: 'fill', color: '#f6f1e7' }, // warm sketchbook paper
    { type: 'layer.add', id: 'arena', name: 'Arena Architecture' },
    { type: 'layer.add', id: 'trainers', name: 'Trainers' },
    { type: 'layer.add', id: 'monferno', name: 'Knocked Out Monferno' },
    { type: 'layer.add', id: 'bubble', name: 'Speech Bubble' },
  ];

  // Subtle stone washes on steps & arch using marker
  commands.push(
    ...markerWash('arena', [
      [[0, 250], [1000, 250]],
      [[0, 280], [1000, 280]],
      [[470, 140], [540, 140], [540, 185], [470, 185]],
    ], { color: '#e5dcce', size: 22, opacity: 0.35 })
  );

  // Arena horizontal steps
  commands.push(
    makeStroke('arena', [[0, 240], [1000, 240]], { color: '#4a4038', size: 3.5, opacity: 0.85 }),
    makeStroke('arena', [[0, 268], [1000, 268]], { color: '#4a4038', size: 3.5, opacity: 0.85 }),
    makeStroke('arena', [[0, 298], [1000, 298]], { color: '#4a4038', size: 3.5, opacity: 0.85 }),
    makeStroke('arena', smoothCurve([[0, 315], [250, 332], [500, 338], [750, 332], [1000, 315]]), { color: '#4a4038', size: 3.5, opacity: 0.85 }),
    makeStroke('arena', smoothCurve([[0, 380], [250, 400], [500, 408], [750, 400], [1000, 380]]), { color: '#4a4038', size: 3.5, opacity: 0.85 }),
    makeStroke('arena', smoothCurve([[0, 452], [250, 476], [500, 485], [750, 476], [1000, 452]]), { color: '#4a4038', size: 3.5, opacity: 0.85 }),
    makeStroke('arena', smoothCurve([[0, 630], [250, 665], [500, 678], [750, 665], [1000, 630]]), { color: '#4a4038', size: 3.5, opacity: 0.85 })
  );

  // Central battle ring
  const cx = 506, cy = 526, rx = 88, ry = 23, orx = 188, ory = 44;
  const centerOval = [], outerOval = [];
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    centerOval.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    outerOval.push([cx + Math.cos(a) * orx, cy + Math.sin(a) * ory]);
  }
  commands.push(
    makeStroke('arena', centerOval, { color: '#544940', size: 3.2, opacity: 0.85 }),
    makeStroke('arena', outerOval, { color: '#685c52', size: 2.5, opacity: 0.6 })
  );

  // Central Hexagon Doorway Portal
  const hexOuter = [[506, 92], [565, 126], [565, 192], [506, 226], [447, 192], [447, 126], [506, 92]];
  const hexInner = [[506, 122], [543, 143], [543, 175], [506, 196], [469, 175], [469, 143], [506, 122]];
  commands.push(
    makeStroke('arena', hexOuter, { color: '#3d342d', size: 4.2, opacity: 0.95 }),
    makeStroke('arena', hexInner, { color: '#4d4239', size: 3.5, opacity: 0.9 })
  );
  for (let i = 0; i < 6; i++) {
    commands.push(makeStroke('arena', [hexOuter[i], hexInner[i]], { color: '#594d42', size: 2.5, opacity: 0.75 }));
  }
  commands.push(
    makeStroke('arena', [[447, 192], [440, 240], [468, 240], [478, 226], [534, 226], [544, 240], [572, 240], [565, 192]], { color: '#453b33', size: 3.5, opacity: 0.9 })
  );

  // Struts / Pillars
  commands.push(
    makeStroke('arena', [[282, 78], [280, 195]], { color: '#4d4239', size: 3.5, opacity: 0.85 }),
    makeStroke('arena', [[280, 125], [315, 78]], { color: '#4d4239', size: 3.5, opacity: 0.85 }),
    makeStroke('arena', [[626, 78], [662, 195]], { color: '#4d4239', size: 3.5, opacity: 0.85 }),
    makeStroke('arena', [[655, 125], [620, 78]], { color: '#4d4239', size: 3.5, opacity: 0.85 })
  );

  // Pedestals & faceted crystals
  commands.push(
    makeStroke('arena', [[0, 205], [125, 205], [125, 295], [0, 295]], { color: '#453a32', size: 3.2, opacity: 0.85 }),
    makeStroke('arena', [[60, 108], [24, 155], [62, 205], [95, 150], [60, 108]], { color: '#453a32', size: 3.2, opacity: 0.85 }),
    makeStroke('arena', [[24, 155], [60, 165], [95, 150]], { color: '#453a32', size: 2.8, opacity: 0.85 }),
    makeStroke('arena', [[60, 165], [62, 205]], { color: '#453a32', size: 2.8, opacity: 0.85 }),
    makeStroke('arena', [[875, 205], [1000, 205], [1000, 295], [875, 295]], { color: '#453a32', size: 3.2, opacity: 0.85 }),
    makeStroke('arena', [[940, 108], [904, 155], [942, 205], [975, 150], [940, 108]], { color: '#453a32', size: 3.2, opacity: 0.85 }),
    makeStroke('arena', [[904, 155], [940, 165], [975, 150]], { color: '#453a32', size: 2.8, opacity: 0.85 }),
    makeStroke('arena', [[940, 165], [942, 205]], { color: '#453a32', size: 2.8, opacity: 0.85 })
  );

  return commands;
}

// ====================================================
// PASS 2: Trainers (Hand-Drawn Lineart & Muted Marker Accents)
// ====================================================
function buildPass2Trainers() {
  const commands = [];

  // 1. ORGANIC COLOR ACCENTS (Soft marker washes that hug the drawings)
  // Lucas Hoodie: muted slate-navy marker wash flowing through the torso & sleeves
  commands.push(
    ...markerWash('trainers', [
      [[190, 310], [215, 370], [220, 435]],
      [[160, 330], [175, 385], [185, 435]],
      [[250, 330], [245, 385], [245, 435]],
      [[145, 335], [130, 375], [128, 415]], // left arm
      [[285, 335], [308, 375], [320, 415]], // right arm
    ], { color: '#4a5568', size: 24, opacity: 0.32 }),
    // Lucas Pants: muted warm khaki wash flowing down the legs
    ...markerWash('trainers', [
      [[180, 455], [155, 520], [125, 580], [115, 625]],
      [[200, 465], [180, 530], [145, 590], [130, 625]],
      [[245, 465], [265, 525], [290, 585], [305, 615]],
      [[265, 455], [290, 520], [320, 580], [340, 615]],
    ], { color: '#c5b8a5', size: 24, opacity: 0.35 }),
    // Lucas Backpack Pokeball: curved red marker wash on upper dome
    ...markerWash('trainers', [
      [[155, 355], [182, 345], [210, 355]],
      [[150, 368], [182, 362], [214, 368]],
    ], { color: '#dc2626', size: 14, opacity: 0.45 }),
    // Lucas Hair: dark charcoal pencil shading
    ...markerWash('trainers', [
      [[220, 165], [240, 195], [250, 225]],
      [[250, 160], [265, 185], [270, 215]],
      [[205, 190], [225, 215], [240, 235]],
    ], { color: '#1e293b', size: 20, opacity: 0.45 }),

    // Roark T-shirt: soft heather gray wash
    ...markerWash('trainers', [
      [[735, 245], [740, 290], [745, 345]],
      [[715, 255], [720, 300], [730, 345]],
      [[770, 250], [770, 295], [775, 345]],
    ], { color: '#94a3b8', size: 22, opacity: 0.3 }),
    // Roark Pants: dusty slate denim wash
    ...markerWash('trainers', [
      [[735, 365], [720, 420], [705, 480], [695, 525]],
      [[750, 375], [735, 435], [715, 485], [710, 525]],
      [[775, 375], [790, 430], [820, 480], [845, 515]],
      [[790, 365], [815, 420], [840, 475], [860, 515]],
    ], { color: '#64748b', size: 22, opacity: 0.35 }),
    // Roark Helmet: warm ochre wash
    ...markerWash('trainers', [
      [[695, 135], [730, 115], [770, 130]],
      [[705, 145], [735, 130], [765, 142]],
    ], { color: '#d97706', size: 18, opacity: 0.4 }),
    // Roark Headlamp bright yellow
    ...markerWash('trainers', [
      [[704, 126], [708, 126]],
    ], { color: '#facc15', size: 12, opacity: 0.6 }),
    // Roark Skin: warm peach on gesturing hand, neck, face
    ...markerWash('trainers', [
      [[635, 248], [650, 252]],
      [[675, 275], [660, 265]],
      [[725, 175], [745, 175]],
      [[735, 195], [745, 215]],
    ], { color: '#fdba74', size: 14, opacity: 0.4 }),

    // Ground contact shadows under shoes
    makeStroke('trainers', [[65, 655], [150, 655]], { color: '#54463a', size: 5, opacity: 0.45, brush: 'marker' }),
    makeStroke('trainers', [[270, 652], [385, 652]], { color: '#54463a', size: 5, opacity: 0.45, brush: 'marker' }),
    makeStroke('trainers', [[668, 550], [745, 550]], { color: '#54463a', size: 5, opacity: 0.45, brush: 'marker' }),
    makeStroke('trainers', [[828, 542], [902, 542]], { color: '#54463a', size: 5, opacity: 0.45, brush: 'marker' })
  );

  // 2. LUCAS LINEART (Lively, expressive pencil/ink contours)
  // Boots
  commands.push(
    makeStroke('trainers', smoothCurve([[72, 646], [68, 654], [78, 660], [138, 660], [146, 654], [144, 644]]), { color: '#241b17', size: 3.8 }),
    makeStroke('trainers', smoothCurve([[72, 646], [74, 638], [88, 626], [105, 624]]), { color: '#241b17', size: 3.8 }),
    makeStroke('trainers', smoothCurve([[105, 624], [120, 624], [132, 632], [144, 644]]), { color: '#241b17', size: 3.8 }),
    makeStroke('trainers', [[70, 652], [145, 652]], { color: '#241b17', size: 3.8 }),

    makeStroke('trainers', smoothCurve([[272, 644], [268, 652], [278, 658], [372, 658], [386, 650], [382, 638]]), { color: '#241b17', size: 3.8 }),
    makeStroke('trainers', smoothCurve([[272, 644], [275, 634], [288, 622], [315, 616]]), { color: '#241b17', size: 3.8 }),
    makeStroke('trainers', smoothCurve([[315, 616], [342, 616], [365, 626], [382, 638]]), { color: '#241b17', size: 3.8 }),
    makeStroke('trainers', [[270, 650], [384, 646]], { color: '#241b17', size: 3.8 })
  );

  // Pants (wide stance, anime folds)
  commands.push(
    makeStroke('trainers', smoothCurve([[165, 442], [145, 490], [122, 550], [105, 624]]), { color: '#28201a', size: 3.5 }),
    makeStroke('trainers', smoothCurve([[226, 482], [195, 535], [165, 580], [136, 625]]), { color: '#28201a', size: 3.5 }),
    makeStroke('trainers', smoothCurve([[226, 482], [252, 530], [278, 575], [292, 616]]), { color: '#28201a', size: 3.5 }),
    makeStroke('trainers', smoothCurve([[278, 440], [305, 490], [332, 550], [354, 616]]), { color: '#28201a', size: 3.5 }),
    makeStroke('trainers', [[226, 482], [228, 452]], { color: '#28201a', size: 3.0 }),
    makeStroke('trainers', smoothCurve([[125, 545], [140, 552], [152, 546]]), { color: '#28201a', size: 2.8 }),
    makeStroke('trainers', smoothCurve([[305, 542], [320, 548], [330, 542]]), { color: '#28201a', size: 2.8 }),
    makeStroke('trainers', smoothCurve([[110, 618], [125, 624], [136, 618]]), { color: '#28201a', size: 2.6 }),
    makeStroke('trainers', smoothCurve([[300, 612], [325, 618], [350, 612]]), { color: '#28201a', size: 2.6 })
  );

  // Hoodie Torso & bunched hood
  commands.push(
    makeStroke('trainers', smoothCurve([[164, 442], [220, 446], [278, 440]]), { color: '#241b17', size: 3.6 }),
    makeStroke('trainers', smoothCurve([[166, 432], [220, 435], [276, 430]]), { color: '#241b17', size: 3.4 }),
    makeStroke('trainers', smoothCurve([[152, 325], [158, 380], [165, 432]]), { color: '#241b17', size: 3.6 }),
    makeStroke('trainers', smoothCurve([[278, 325], [274, 380], [276, 430]]), { color: '#241b17', size: 3.6 }),
    // Bunched hood folds around neck
    makeStroke('trainers', smoothCurve([[188, 292], [205, 305], [235, 308], [266, 296]]), { color: '#241b17', size: 3.6 }),
    makeStroke('trainers', smoothCurve([[192, 280], [225, 290], [262, 282]]), { color: '#241b17', size: 3.6 }),
    makeStroke('trainers', smoothCurve([[208, 305], [215, 318], [232, 316], [236, 308]]), { color: '#241b17', size: 3.2 }),
    makeStroke('trainers', smoothCurve([[180, 315], [195, 335]]), { color: '#241b17', size: 3.0 }),
    makeStroke('trainers', smoothCurve([[250, 315], [240, 335]]), { color: '#241b17', size: 3.0 })
  );

  // Backpack with Pokeball design
  const bpCx = 182, bpCy = 376, bpR = 44;
  const bpOutline = [];
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    bpOutline.push([bpCx + Math.cos(a) * bpR, bpCy + Math.sin(a) * bpR]);
  }
  commands.push(
    makeStroke('trainers', bpOutline, { color: '#201612', size: 4.0 }),
    makeStroke('trainers', [[bpCx - bpR + 2, bpCy - 4], [bpCx + bpR - 2, bpCy - 4]], { color: '#201612', size: 3.8 }),
    makeStroke('trainers', [[bpCx - bpR + 2, bpCy + 4], [bpCx + bpR - 2, bpCy + 4]], { color: '#201612', size: 3.8 })
  );
  const btnOuter = [], btnInner = [];
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    btnOuter.push([bpCx + Math.cos(a) * 14, bpCy + Math.sin(a) * 14]);
    btnInner.push([bpCx + Math.cos(a) * 7, bpCy + Math.sin(a) * 7]);
  }
  commands.push(
    makeStroke('trainers', btnOuter, { color: '#201612', size: 3.5 }),
    makeStroke('trainers', btnInner, { color: '#201612', size: 3.0 }),
    makeStroke('trainers', smoothCurve([[160, 315], [162, 345], [168, 375]]), { color: '#241b17', size: 3.5 }),
    makeStroke('trainers', smoothCurve([[210, 315], [205, 345], [202, 375]]), { color: '#241b17', size: 3.2 }),
    makeStroke('trainers', [[155, 412], [148, 426], [165, 420]], { color: '#241b17', size: 3.0 }),
    makeStroke('trainers', [[210, 410], [218, 424], [202, 418]], { color: '#241b17', size: 3.0 })
  );

  // Arms & Tense Clenched Fists
  commands.push(
    // Left arm
    makeStroke('trainers', smoothCurve([[152, 325], [125, 365], [115, 395], [118, 424]]), { color: '#241b17', size: 3.5 }),
    makeStroke('trainers', smoothCurve([[162, 375], [148, 400], [135, 425]]), { color: '#241b17', size: 3.5 }),
    makeStroke('trainers', smoothCurve([[118, 424], [128, 426], [136, 424]]), { color: '#241b17', size: 3.2 }),
    makeStroke('trainers', smoothCurve([[118, 426], [112, 436], [116, 448], [128, 452], [138, 448], [140, 436], [135, 425]]), { color: '#241b17', size: 3.6 }),
    makeStroke('trainers', smoothCurve([[130, 430], [136, 436], [134, 446], [124, 446]]), { color: '#241b17', size: 3.2 }),
    makeStroke('trainers', [[116, 442], [124, 440]], { color: '#241b17', size: 2.5 }),
    makeStroke('trainers', [[125, 442], [132, 441]], { color: '#241b17', size: 2.5 }),
    // Right arm
    makeStroke('trainers', smoothCurve([[278, 325], [305, 365], [325, 395], [328, 422]]), { color: '#241b17', size: 3.5 }),
    makeStroke('trainers', smoothCurve([[270, 375], [290, 400], [310, 424]]), { color: '#241b17', size: 3.5 }),
    makeStroke('trainers', smoothCurve([[310, 424], [318, 426], [328, 422]]), { color: '#241b17', size: 3.2 }),
    makeStroke('trainers', smoothCurve([[312, 425], [315, 436], [322, 448], [334, 452], [345, 448], [346, 436], [328, 422]]), { color: '#241b17', size: 3.6 }),
    makeStroke('trainers', smoothCurve([[320, 430], [324, 436], [326, 446], [335, 446]]), { color: '#241b17', size: 3.2 }),
    makeStroke('trainers', [[326, 441], [334, 441]], { color: '#241b17', size: 2.5 }),
    makeStroke('trainers', [[335, 442], [342, 440]], { color: '#241b17', size: 2.5 })
  );

  // Head, Neck, Hair, Glasses, Angry Face
  commands.push(
    // Neck
    makeStroke('trainers', smoothCurve([[210, 250], [216, 280]]), { color: '#201612', size: 3.2 }),
    makeStroke('trainers', smoothCurve([[260, 255], [255, 280]]), { color: '#201612', size: 3.2 }),
    // Jawline & cheek
    makeStroke('trainers', smoothCurve([[286, 230], [290, 240], [285, 248], [275, 258], [265, 265]]), { color: '#201612', size: 3.4 }),
    // Ear
    makeStroke('trainers', smoothCurve([[262, 230], [268, 226], [270, 236], [265, 242]]), { color: '#201612', size: 3.2 }),
    // Clenched mouth grimace
    makeStroke('trainers', [[285, 246], [276, 250]], { color: '#09090b', size: 3.2 }),
    // Rectangular glasses frame
    makeStroke('trainers', smoothCurve([[284, 214], [316, 218], [314, 236], [284, 232], [284, 214]]), { color: '#09090b', size: 3.8 }),
    makeStroke('trainers', [[284, 222], [266, 228]], { color: '#09090b', size: 3.2 }), // glasses temple arm
    makeStroke('trainers', [[292, 224], [298, 226]], { color: '#09090b', size: 3.6 }), // dark pupil glare
    makeStroke('trainers', [[286, 218], [300, 222]], { color: '#09090b', size: 3.6 })  // furrowed brow
  );

  // Hair tufts (spiky anime silhouette)
  const hair = [
    smoothCurve([[210, 250], [195, 232], [204, 220]]),
    smoothCurve([[204, 220], [190, 205], [202, 192]]),
    smoothCurve([[202, 192], [194, 172], [212, 164]]),
    smoothCurve([[212, 164], [215, 145], [230, 142]]),
    smoothCurve([[230, 142], [242, 138], [252, 145]]),
    smoothCurve([[252, 145], [268, 142], [278, 154]]),
    smoothCurve([[278, 154], [295, 162], [290, 176]]),
    smoothCurve([[290, 176], [305, 185], [296, 198]]),
    smoothCurve([[296, 198], [308, 208], [292, 216]]),
    // Internal hair lock lines
    smoothCurve([[225, 155], [232, 180]]),
    smoothCurve([[250, 150], [254, 185]]),
    smoothCurve([[270, 160], [268, 195]]),
  ];
  for (const pts of hair) {
    commands.push(makeStroke('trainers', pts, { color: '#1a1412', size: 3.6 }));
  }

  // Anger FX: Popping red `#` vein, squiggly rage steam, sweat droplets
  commands.push(
    makeStroke('trainers', [[266, 172], [284, 172]], { color: '#dc2626', size: 4.2 }),
    makeStroke('trainers', [[266, 182], [284, 182]], { color: '#dc2626', size: 4.2 }),
    makeStroke('trainers', [[270, 168], [270, 188]], { color: '#dc2626', size: 4.2 }),
    makeStroke('trainers', [[278, 168], [278, 188]], { color: '#dc2626', size: 4.2 }),
    makeStroke('trainers', smoothCurve([[338, 155], [344, 165], [338, 175], [344, 185]]), { color: '#241b17', size: 3.2 }),
    makeStroke('trainers', smoothCurve([[352, 150], [358, 162], [350, 174], [358, 186]]), { color: '#241b17', size: 3.2 }),
    makeStroke('trainers', smoothCurve([[305, 170], [314, 165], [312, 160], [305, 170]]), { color: '#0284c7', size: 2.8 }),
    makeStroke('trainers', smoothCurve([[315, 190], [324, 186], [322, 180], [315, 190]]), { color: '#0284c7', size: 2.8 })
  );

  // 3. ROARK LINEART (Smug, relaxed miner leader)
  // Boots
  commands.push(
    makeStroke('trainers', smoothCurve([[674, 542], [670, 550], [678, 556], [732, 556], [742, 550], [740, 540]]), { color: '#241b17', size: 3.8 }),
    makeStroke('trainers', smoothCurve([[674, 542], [676, 532], [690, 524]]), { color: '#241b17', size: 3.8 }),
    makeStroke('trainers', smoothCurve([[708, 522], [724, 530], [740, 540]]), { color: '#241b17', size: 3.8 }),
    makeStroke('trainers', [[672, 548], [741, 548]], { color: '#241b17', size: 3.8 }),

    makeStroke('trainers', smoothCurve([[832, 534], [828, 542], [836, 548], [890, 548], [900, 542], [898, 532]]), { color: '#241b17', size: 3.8 }),
    makeStroke('trainers', smoothCurve([[832, 534], [834, 524], [846, 516]]), { color: '#241b17', size: 3.8 }),
    makeStroke('trainers', smoothCurve([[864, 514], [882, 522], [898, 532]]), { color: '#241b17', size: 3.8 }),
    makeStroke('trainers', [[830, 540], [899, 540]], { color: '#241b17', size: 3.8 })
  );

  // Baggy Trousers (cargo folds)
  commands.push(
    makeStroke('trainers', smoothCurve([[732, 350], [715, 410], [695, 470], [682, 526]]), { color: '#241b17', size: 3.5 }),
    makeStroke('trainers', smoothCurve([[756, 385], [740, 440], [720, 485], [704, 524]]), { color: '#241b17', size: 3.5 }),
    makeStroke('trainers', smoothCurve([[756, 385], [775, 435], [805, 475], [842, 516]]), { color: '#241b17', size: 3.5 }),
    makeStroke('trainers', smoothCurve([[798, 345], [825, 405], [850, 465], [868, 516]]), { color: '#241b17', size: 3.5 }),
    makeStroke('trainers', [[756, 385], [758, 352]], { color: '#241b17', size: 3.0 }),
    makeStroke('trainers', smoothCurve([[782, 355], [795, 375]]), { color: '#241b17', size: 2.8 }),
    makeStroke('trainers', smoothCurve([[700, 445], [715, 452], [730, 446]]), { color: '#241b17', size: 2.8 }),
    makeStroke('trainers', smoothCurve([[785, 440], [805, 448], [825, 442]]), { color: '#241b17', size: 2.8 })
  );

  // T-shirt & Torso
  commands.push(
    makeStroke('trainers', smoothCurve([[736, 230], [750, 236], [766, 228]]), { color: '#241b17', size: 3.6 }),
    makeStroke('trainers', smoothCurve([[728, 348], [764, 354], [800, 345]]), { color: '#241b17', size: 3.6 }),
    makeStroke('trainers', smoothCurve([[706, 236], [712, 290], [728, 348]]), { color: '#241b17', size: 3.6 }),
    makeStroke('trainers', smoothCurve([[794, 226], [796, 285], [800, 345]]), { color: '#241b17', size: 3.6 }),
    makeStroke('trainers', smoothCurve([[740, 310], [760, 325], [778, 315]]), { color: '#241b17', size: 2.8 })
  );

  // Arms: Gesturing hand & pocket hand
  commands.push(
    makeStroke('trainers', smoothCurve([[706, 236], [688, 255], [682, 268]]), { color: '#241b17', size: 3.4 }),
    makeStroke('trainers', [[682, 268], [704, 262]], { color: '#241b17', size: 3.0 }),
    makeStroke('trainers', smoothCurve([[684, 268], [665, 290], [648, 262]]), { color: '#241b17', size: 3.4 }),
    makeStroke('trainers', smoothCurve([[702, 264], [678, 280], [656, 254]]), { color: '#241b17', size: 3.4 }),
    // Open taunting hand
    makeStroke('trainers', smoothCurve([[656, 254], [650, 245], [656, 238], [648, 236]]), { color: '#241b17', size: 3.2 }),
    makeStroke('trainers', smoothCurve([[648, 236], [626, 238], [622, 246], [640, 252]]), { color: '#241b17', size: 3.2 }),
    makeStroke('trainers', smoothCurve([[640, 252], [624, 254], [628, 260], [646, 258]]), { color: '#241b17', size: 3.2 }),
    makeStroke('trainers', smoothCurve([[646, 258], [632, 264], [638, 268], [648, 262]]), { color: '#241b17', size: 3.2 }),
    // Pocket arm
    makeStroke('trainers', smoothCurve([[794, 226], [816, 245], [820, 258]]), { color: '#241b17', size: 3.5 }),
    makeStroke('trainers', [[820, 258], [804, 256]], { color: '#241b17', size: 3.0 }),
    makeStroke('trainers', smoothCurve([[820, 258], [842, 290], [832, 325], [818, 342]]), { color: '#241b17', size: 3.5 }),
    makeStroke('trainers', smoothCurve([[804, 256], [824, 285], [816, 318], [808, 335]]), { color: '#241b17', size: 3.5 })
  );

  // Miner Helmet & Headlamp
  commands.push(
    makeStroke('trainers', smoothCurve([[684, 152], [696, 118], [724, 96], [754, 104], [780, 132], [784, 150]]), { color: '#201612', size: 4.2 }),
    makeStroke('trainers', smoothCurve([[678, 154], [708, 150], [742, 148], [774, 146], [788, 150]]), { color: '#201612', size: 4.2 }),
    makeStroke('trainers', smoothCurve([[724, 96], [730, 115], [734, 148]]), { color: '#201612', size: 3.2 })
  );
  const lampRim = [];
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    lampRim.push([706 + Math.cos(a) * 13, 126 + Math.sin(a) * 13]);
  }
  commands.push(
    makeStroke('trainers', [[695, 134], [698, 122], [706, 114]], { color: '#201612', size: 3.5 }),
    makeStroke('trainers', lampRim, { color: '#201612', size: 3.8 }),
    makeStroke('trainers', [[701, 126], [711, 126]], { color: '#d97706', size: 2.8 }),
    makeStroke('trainers', [[706, 121], [706, 131]], { color: '#d97706', size: 2.8 })
  );

  // Bangs, Face & Smug Expression
  commands.push(
    makeStroke('trainers', smoothCurve([[704, 152], [708, 168], [714, 154]]), { color: '#1a1412', size: 3.6 }),
    makeStroke('trainers', smoothCurve([[714, 154], [722, 172], [728, 154]]), { color: '#1a1412', size: 3.6 }),
    makeStroke('trainers', smoothCurve([[728, 154], [738, 168], [746, 152]]), { color: '#1a1412', size: 3.6 }),
    makeStroke('trainers', smoothCurve([[764, 150], [770, 176], [774, 152]]), { color: '#1a1412', size: 3.6 }),
    // Face outline
    makeStroke('trainers', smoothCurve([[708, 165], [716, 192], [735, 206], [756, 192], [766, 175]]), { color: '#201612', size: 3.4 }),
    // Smug half-lidded eyes looking across at Lucas
    makeStroke('trainers', smoothCurve([[716, 166], [726, 165]]), { color: '#09090b', size: 3.8 }),
    makeStroke('trainers', smoothCurve([[718, 168], [724, 169]]), { color: '#09090b', size: 2.5 }),
    makeStroke('trainers', [[720, 167], [722, 167]], { color: '#09090b', size: 4.0 }),
    makeStroke('trainers', smoothCurve([[738, 164], [748, 163]]), { color: '#09090b', size: 3.8 }),
    makeStroke('trainers', smoothCurve([[740, 166], [746, 167]]), { color: '#09090b', size: 2.5 }),
    makeStroke('trainers', [[742, 165], [744, 165]], { color: '#09090b', size: 4.0 }),
    // Raised cocky eyebrow
    makeStroke('trainers', smoothCurve([[736, 155], [746, 152], [752, 156]]), { color: '#09090b', size: 3.5 }),
    makeStroke('trainers', smoothCurve([[716, 158], [726, 158]]), { color: '#09090b', size: 3.0 }),
    makeStroke('trainers', [[732, 170], [730, 176]], { color: '#201612', size: 2.5 }),
    // SMUG SMIRK
    makeStroke('trainers', smoothCurve([[724, 184], [736, 184], [752, 174]]), { color: '#09090b', size: 3.8 }),
    makeStroke('trainers', [[750, 172], [754, 176]], { color: '#09090b', size: 3.0 }),
    // Sparkle glint
    makeStroke('trainers', [[648, 166], [668, 166]], { color: '#09090b', size: 3.2 }),
    makeStroke('trainers', [[658, 156], [658, 176]], { color: '#09090b', size: 3.2 })
  );

  // Core shadow hatching
  commands.push(...hatch('trainers', 190, 298, 255, 298, 45, 4.5, 10, { color: '#241b17', size: 1.8, opacity: 0.5 }));
  commands.push(...hatch('trainers', 160, 420, 210, 420, 45, 4.5, 12, { color: '#241b17', size: 1.8, opacity: 0.5 }));
  commands.push(...hatch('trainers', 725, 206, 750, 206, 50, 3.5, 9, { color: '#241b17', size: 1.8, opacity: 0.45 }));

  return commands;
}

// ====================================================
// PASS 3: Knocked-Out Monferno (Accurate Anatomy)
// ====================================================
function buildPass3Monferno() {
  const commands = [];

  // 1. Organic Marker Color Washes for Monferno
  commands.push(
    // Floor contact shadow
    makeStroke('monferno', [[420, 464], [535, 464]], { color: '#786958', size: 8, opacity: 0.5, brush: 'marker' }),
    // Orange body & head wash
    ...markerWash('monferno', [
      [[432, 442], [460, 445], [515, 445]],
      [[440, 452], [480, 456], [518, 452]],
    ], { color: '#ea580c', size: 16, opacity: 0.55 }),
    // Tan chest & muzzle wash
    ...markerWash('monferno', [
      [[438, 448], [448, 450]],
      [[470, 452], [505, 452]],
    ], { color: '#fde68a', size: 10, opacity: 0.7 }),
    // Bright blue mask wash
    ...markerWash('monferno', [
      [[436, 436], [444, 436]],
      [[448, 435], [456, 435]],
    ], { color: '#2563eb', size: 8, opacity: 0.75 }),
    // Flame core wash (vibrant yellow & fiery orange)
    ...markerWash('monferno', [
      [[568, 408], [574, 388]],
    ], { color: '#fde047', size: 16, opacity: 0.75 }),
    ...markerWash('monferno', [
      [[562, 412], [572, 380], [582, 395]],
    ], { color: '#ea580c', size: 12, opacity: 0.55 })
  );

  // White neck ruff / spiky collar
  const ruff = [
    smoothCurve([[454, 438], [458, 444], [462, 440]]),
    smoothCurve([[462, 440], [466, 446], [470, 441]]),
    smoothCurve([[456, 446], [460, 452], [465, 448]]),
  ];
  for (const pts of ruff) {
    commands.push(makeStroke('monferno', pts, { color: '#ffffff', size: 4.0, opacity: 0.95, brush: 'brush' }));
    commands.push(makeStroke('monferno', pts, { color: '#2e241e', size: 2.2, opacity: 0.85 }));
  }

  // Gold shoulder arm bands
  commands.push(
    makeStroke('monferno', [[436, 452], [434, 456]], { color: '#f59e0b', size: 4.5, opacity: 1.0, brush: 'brush' }),
    makeStroke('monferno', [[466, 454], [464, 458]], { color: '#f59e0b', size: 4.5, opacity: 1.0, brush: 'brush' })
  );

  // Head, Ears, Tuft, and Red Brow Mark
  commands.push(
    makeStroke('monferno', smoothCurve([[432, 442], [430, 450], [438, 457], [455, 456], [464, 448], [462, 436], [448, 432], [436, 436], [432, 442]]), { color: '#2e241e', size: 3.4 }),
    // Left ear
    makeStroke('monferno', smoothCurve([[432, 436], [423, 430], [422, 442], [430, 444]]), { color: '#2e241e', size: 3.2 }),
    // Right ear
    makeStroke('monferno', smoothCurve([[458, 434], [467, 428], [468, 440], [460, 442]]), { color: '#2e241e', size: 3.2 }),
    // Orange crown tuft
    makeStroke('monferno', smoothCurve([[442, 432], [445, 422], [448, 432]]), { color: '#2e241e', size: 3.2 }),
    // Red mark between eyes
    makeStroke('monferno', [[446, 438], [448, 438]], { color: '#dc2626', size: 3.8 })
  );

  // KNOCKED OUT "X X" EYES & COMICAL MOUTH
  commands.push(
    // Left eye X
    makeStroke('monferno', [[436, 439], [445, 447]], { color: '#09090b', size: 3.8 }),
    makeStroke('monferno', [[445, 439], [436, 447]], { color: '#09090b', size: 3.8 }),
    // Right eye X
    makeStroke('monferno', [[448, 438], [457, 446]], { color: '#09090b', size: 3.8 }),
    makeStroke('monferno', [[457, 438], [448, 446]], { color: '#09090b', size: 3.8 }),
    // Dazed wavy slack mouth with comical pink tongue
    makeStroke('monferno', smoothCurve([[441, 452], [446, 456], [452, 453]]), { color: '#09090b', size: 2.8 }),
    makeStroke('monferno', smoothCurve([[446, 455], [448, 458], [450, 455]]), { color: '#ef4444', size: 2.5 })
  );

  // Limp sprawled limbs
  commands.push(
    // Left arm & tan digits
    makeStroke('monferno', smoothCurve([[434, 452], [424, 455], [414, 452], [410, 456]]), { color: '#2e241e', size: 3.2 }),
    makeStroke('monferno', [[410, 456], [407, 458]], { color: '#d97706', size: 3.2 }),
    // Right arm & tan digits
    makeStroke('monferno', smoothCurve([[462, 454], [470, 462], [478, 465]]), { color: '#2e241e', size: 3.2 }),
    makeStroke('monferno', [[478, 465], [482, 467]], { color: '#d97706', size: 3.2 }),
    // Body & limp hind legs
    makeStroke('monferno', smoothCurve([[460, 445], [485, 442], [512, 445], [520, 452]]), { color: '#2e241e', size: 3.4 }),
    makeStroke('monferno', smoothCurve([[464, 456], [490, 460], [515, 458]]), { color: '#2e241e', size: 3.0 }),
    makeStroke('monferno', smoothCurve([[512, 450], [526, 454], [534, 452]]), { color: '#2e241e', size: 3.2 })
  );

  // Curled tail with red base patch & lively flickering flame
  commands.push(
    makeStroke('monferno', [[518, 448], [524, 444]], { color: '#dc2626', size: 4.5 }),
    makeStroke('monferno', smoothCurve([[518, 448], [534, 438], [550, 426], [565, 414], [572, 406]]), { color: '#c2410c', size: 4.5 }),
    makeStroke('monferno', smoothCurve([[518, 448], [534, 438], [550, 426], [565, 414], [572, 406]]), { color: '#2e241e', size: 2.5 }),
    // Flame contours
    makeStroke('monferno', smoothCurve([[568, 410], [564, 396], [572, 384], [578, 394], [576, 412]]), { color: '#fde047', size: 4.5, brush: 'brush' }),
    makeStroke('monferno', smoothCurve([[564, 414], [556, 398], [566, 382], [576, 374], [584, 386], [588, 405], [576, 418]]), { color: '#ea580c', size: 3.0 }),
    makeStroke('monferno', smoothCurve([[574, 380], [578, 368], [580, 380]]), { color: '#f97316', size: 2.5 })
  );

  // Comic Knockout FX (dizzy spiral stars)
  commands.push(
    makeStroke('monferno', smoothCurve([[438, 418], [444, 422], [440, 426], [436, 420]]), { color: '#eab308', size: 2.8 }),
    makeStroke('monferno', smoothCurve([[452, 414], [458, 418], [454, 422], [450, 416]]), { color: '#eab308', size: 2.8 }),
    makeStroke('monferno', smoothCurve([[464, 416], [470, 420], [466, 424], [462, 418]]), { color: '#eab308', size: 2.8 })
  );

  return commands;
}

// ====================================================
// PASS 4: Speech Bubble & Hand-Lettered Text
// ====================================================
function buildPass4Bubble() {
  const commands = [];

  // Bubble solid opaque paper-white interior using wide marker fill strokes
  // (Ensures complete coverage without crude geometric bounding box artifacts)
  const fillY = [];
  for (let y = 34; y <= 130; y += 12) {
    fillY.push([[415, y], [695, y]]);
  }
  commands.push(...markerWash('bubble', fillY, { color: '#fffef9', size: 20, opacity: 0.98 }));

  // Pointer tail fill strokes to Roark's mouth at (730, 180)
  for (const pts of [
    [[660, 134], [730, 180]],
    [[668, 134], [730, 180]],
    [[676, 132], [730, 180]],
  ]) {
    commands.push(makeStroke('bubble', pts, { color: '#fffef9', size: 10, opacity: 1.0, brush: 'brush' }));
  }

  // Hand-inked Speech Bubble Outline
  const bubbleOutline = smoothCurve([
    [420, 26], [555, 24], [690, 26], [705, 42],
    [708, 80], [704, 120], [688, 132],
    // Tail to Roark's mouth
    [680, 132], [730, 180], [664, 136],
    [555, 138], [420, 138], [406, 122],
    [404, 80], [406, 42], [420, 26]
  ]);
  commands.push(
    makeStroke('bubble', bubbleOutline, { color: '#09090b', size: 3.8 })
  );

  // EXACT TEXT: "I can SEE the sweat pouring out of your pokeballs bro"
  const lines = [
    { text: 'I can SEE', y: 50 },
    { text: 'the sweat pouring', y: 72 },
    { text: 'out of your', y: 94 },
    { text: 'pokeballs bro', y: 116 },
  ];

  const bubbleCenterX = 555;
  const fontScale = 1.35;

  for (const line of lines) {
    const textW = measureTextWidth(line.text, fontScale);
    const startX = Math.round(bubbleCenterX - textW / 2);
    const rendered = renderTextStrokes(line.text, startX, line.y, fontScale, 'bubble', {
      size: 3.5,
      color: '#09090b',
    });
    commands.push(...rendered.commands);
  }

  return commands;
}

const p1 = buildPass1Arena();
const p2 = buildPass2Trainers();
const p3 = buildPass3Monferno();
const p4 = buildPass4Bubble();

writeFileSync('artifacts/tumblr-pass1-arena.json', JSON.stringify(p1, null, 2));
writeFileSync('artifacts/tumblr-pass2-trainers.json', JSON.stringify(p2, null, 2));
writeFileSync('artifacts/tumblr-pass3-monferno.json', JSON.stringify(p3, null, 2));
writeFileSync('artifacts/tumblr-pass4-bubble.json', JSON.stringify(p4, null, 2));

console.log(`Saved v2 pass files:`);
console.log(`Pass 1 (Arena): ${p1.length} commands`);
console.log(`Pass 2 (Trainers): ${p2.length} commands`);
console.log(`Pass 3 (Monferno): ${p3.length} commands`);
console.log(`Pass 4 (Bubble): ${p4.length} commands`);
console.log(`Total: ${p1.length + p2.length + p3.length + p4.length} commands.`);
