// artifacts/tumblr-maker.mjs
// Generates pass 1-4 JSON files for Codesketch CLI submission.

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

function hatch(layer, x1, y1, x2, y2, angleDeg = 45, spacing = 5, length = 14, { color = '#38302c', size = 2, opacity = 0.5 } = {}) {
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

// ----------------------------------------------------
// PASS 1: Arena & Architecture
// ----------------------------------------------------
function buildPass1Arena() {
  const commands = [
    { type: 'fill', color: '#f6f1e7' },
    { type: 'layer.add', id: 'arena', name: 'Arena & Architecture' },
    { type: 'layer.add', id: 'trainers', name: 'Trainers' },
    { type: 'layer.add', id: 'monferno', name: 'Monferno' },
    { type: 'layer.add', id: 'bubble', name: 'Speech Bubble' },
  ];

  // Arena step shelves
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

  // Central Hexagon Doorway / Portal Emblem
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

  // Pillars / struts
  commands.push(
    makeStroke('arena', [[282, 78], [280, 195]], { color: '#4d4239', size: 3.5, opacity: 0.85 }),
    makeStroke('arena', [[280, 125], [315, 78]], { color: '#4d4239', size: 3.5, opacity: 0.85 }),
    makeStroke('arena', [[626, 78], [662, 195]], { color: '#4d4239', size: 3.5, opacity: 0.85 }),
    makeStroke('arena', [[655, 125], [620, 78]], { color: '#4d4239', size: 3.5, opacity: 0.85 })
  );

  // Side pedestals & crystals
  commands.push(
    // Left
    makeStroke('arena', [[0, 205], [125, 205], [125, 295], [0, 295]], { color: '#453a32', size: 3.2, opacity: 0.85 }),
    makeStroke('arena', [[60, 108], [24, 155], [62, 205], [95, 150], [60, 108]], { color: '#453a32', size: 3.2, opacity: 0.85 }),
    makeStroke('arena', [[24, 155], [60, 165], [95, 150]], { color: '#453a32', size: 2.8, opacity: 0.85 }),
    makeStroke('arena', [[60, 165], [62, 205]], { color: '#453a32', size: 2.8, opacity: 0.85 }),
    // Right
    makeStroke('arena', [[875, 205], [1000, 205], [1000, 295], [875, 295]], { color: '#453a32', size: 3.2, opacity: 0.85 }),
    makeStroke('arena', [[940, 108], [904, 155], [942, 205], [975, 150], [940, 108]], { color: '#453a32', size: 3.2, opacity: 0.85 }),
    makeStroke('arena', [[904, 155], [940, 165], [975, 150]], { color: '#453a32', size: 2.8, opacity: 0.85 }),
    makeStroke('arena', [[940, 165], [942, 205]], { color: '#453a32', size: 2.8, opacity: 0.85 })
  );

  return commands;
}

// ----------------------------------------------------
// PASS 2: Trainers (Lucas & Roark)
// ----------------------------------------------------
function buildPass2Trainers() {
  const commands = [];

  // Color washes
  commands.push(
    // Lucas hoodie wash
    { type: 'ellipse', layer: 'trainers', x: 155, y: 310, width: 130, height: 125, color: '#475569', opacity: 0.65 },
    { type: 'ellipse', layer: 'trainers', x: 110, y: 335, width: 45, height: 80, color: '#475569', opacity: 0.65 },
    { type: 'ellipse', layer: 'trainers', x: 280, y: 335, width: 50, height: 80, color: '#475569', opacity: 0.65 },
    // Lucas pants wash
    { type: 'rect', layer: 'trainers', x: 95, y: 440, width: 85, height: 180, color: '#b8a994', opacity: 0.6 },
    { type: 'rect', layer: 'trainers', x: 255, y: 440, width: 95, height: 175, color: '#b8a994', opacity: 0.6 },
    // Lucas backpack wash
    { type: 'ellipse', layer: 'trainers', x: 138, y: 332, width: 88, height: 44, color: '#c2410c', opacity: 0.85 },
    { type: 'ellipse', layer: 'trainers', x: 138, y: 374, width: 88, height: 44, color: '#f5efe6', opacity: 0.95 },
    // Lucas boots wash
    { type: 'ellipse', layer: 'trainers', x: 70, y: 625, width: 75, height: 35, color: '#2d2724', opacity: 0.75 },
    { type: 'ellipse', layer: 'trainers', x: 275, y: 620, width: 105, height: 35, color: '#2d2724', opacity: 0.75 },

    // Roark shirt wash
    { type: 'ellipse', layer: 'trainers', x: 695, y: 228, width: 125, height: 125, color: '#cbd5e1', opacity: 0.7 },
    // Roark pants wash
    { type: 'rect', layer: 'trainers', x: 675, y: 350, width: 85, height: 180, color: '#64748b', opacity: 0.65 },
    { type: 'rect', layer: 'trainers', x: 765, y: 350, width: 95, height: 170, color: '#64748b', opacity: 0.65 },
    // Roark boots wash
    { type: 'ellipse', layer: 'trainers', x: 672, y: 524, width: 75, height: 32, color: '#452a1b', opacity: 0.8 },
    { type: 'ellipse', layer: 'trainers', x: 830, y: 516, width: 76, height: 32, color: '#452a1b', opacity: 0.8 },
    // Roark helmet wash
    { type: 'ellipse', layer: 'trainers', x: 685, y: 96, width: 100, height: 58, color: '#d97706', opacity: 0.75 },
    // Roark headlamp glow
    { type: 'ellipse', layer: 'trainers', x: 694, y: 114, width: 24, height: 24, color: '#fef08a', opacity: 0.9 },
    // Roark skin tone
    { type: 'ellipse', layer: 'trainers', x: 710, y: 160, width: 55, height: 50, color: '#fed7aa', opacity: 0.7 },
    { type: 'ellipse', layer: 'trainers', x: 630, y: 240, width: 45, height: 45, color: '#fed7aa', opacity: 0.7 }
  );

  // LUCAS CONTOURS
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

  // Pants
  commands.push(
    makeStroke('trainers', smoothCurve([[165, 442], [145, 490], [122, 550], [105, 624]]), { color: '#28201a', size: 3.5 }),
    makeStroke('trainers', smoothCurve([[226, 482], [195, 535], [165, 580], [136, 625]]), { color: '#28201a', size: 3.5 }),
    makeStroke('trainers', smoothCurve([[226, 482], [252, 530], [278, 575], [292, 616]]), { color: '#28201a', size: 3.5 }),
    makeStroke('trainers', smoothCurve([[278, 440], [305, 490], [332, 550], [354, 616]]), { color: '#28201a', size: 3.5 }),
    makeStroke('trainers', [[226, 482], [228, 452]], { color: '#28201a', size: 3.0 }),
    makeStroke('trainers', smoothCurve([[125, 545], [140, 552], [152, 546]]), { color: '#28201a', size: 2.8 }),
    makeStroke('trainers', smoothCurve([[305, 542], [320, 548], [330, 542]]), { color: '#28201a', size: 2.8 })
  );

  // Torso & Hoodie
  commands.push(
    makeStroke('trainers', smoothCurve([[164, 442], [220, 446], [278, 440]]), { color: '#241b17', size: 3.6 }),
    makeStroke('trainers', smoothCurve([[166, 432], [220, 435], [276, 430]]), { color: '#241b17', size: 3.4 }),
    makeStroke('trainers', smoothCurve([[152, 325], [158, 380], [165, 432]]), { color: '#241b17', size: 3.6 }),
    makeStroke('trainers', smoothCurve([[278, 325], [274, 380], [276, 430]]), { color: '#241b17', size: 3.6 }),
    makeStroke('trainers', smoothCurve([[188, 292], [205, 305], [235, 308], [266, 296]]), { color: '#241b17', size: 3.6 }),
    makeStroke('trainers', smoothCurve([[192, 280], [225, 290], [262, 282]]), { color: '#241b17', size: 3.6 }),
    makeStroke('trainers', smoothCurve([[208, 305], [215, 318], [232, 316], [236, 308]]), { color: '#241b17', size: 3.2 })
  );

  // Backpack
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
    { type: 'ellipse', layer: 'trainers', x: bpCx - 14, y: bpCy - 14, width: 28, height: 28, color: '#f7f2e7', opacity: 1.0 },
    makeStroke('trainers', btnOuter, { color: '#201612', size: 3.5 }),
    makeStroke('trainers', btnInner, { color: '#201612', size: 3.0 }),
    makeStroke('trainers', smoothCurve([[160, 315], [162, 345], [168, 375]]), { color: '#241b17', size: 3.5 }),
    makeStroke('trainers', smoothCurve([[210, 315], [205, 345], [202, 375]]), { color: '#241b17', size: 3.2 }),
    makeStroke('trainers', [[155, 412], [148, 426], [165, 420]], { color: '#241b17', size: 3.0 }),
    makeStroke('trainers', [[210, 410], [218, 424], [202, 418]], { color: '#241b17', size: 3.0 })
  );

  // Arms & Clenched Fists
  commands.push(
    // Left arm
    makeStroke('trainers', smoothCurve([[152, 325], [125, 365], [115, 395], [118, 424]]), { color: '#241b17', size: 3.5 }),
    makeStroke('trainers', smoothCurve([[162, 375], [148, 400], [135, 425]]), { color: '#241b17', size: 3.5 }),
    makeStroke('trainers', smoothCurve([[118, 424], [128, 426], [136, 424]]), { color: '#241b17', size: 3.2 }),
    makeStroke('trainers', smoothCurve([[118, 426], [112, 436], [116, 448], [128, 452], [138, 448], [140, 436], [135, 425]]), { color: '#241b17', size: 3.6 }),
    makeStroke('trainers', smoothCurve([[130, 430], [136, 436], [134, 446], [124, 446]]), { color: '#241b17', size: 3.2 }),
    // Right arm
    makeStroke('trainers', smoothCurve([[278, 325], [305, 365], [325, 395], [328, 422]]), { color: '#241b17', size: 3.5 }),
    makeStroke('trainers', smoothCurve([[270, 375], [290, 400], [310, 424]]), { color: '#241b17', size: 3.5 }),
    makeStroke('trainers', smoothCurve([[310, 424], [318, 426], [328, 422]]), { color: '#241b17', size: 3.2 }),
    makeStroke('trainers', smoothCurve([[312, 425], [315, 436], [322, 448], [334, 452], [345, 448], [346, 436], [328, 422]]), { color: '#241b17', size: 3.6 }),
    makeStroke('trainers', smoothCurve([[320, 430], [324, 436], [326, 446], [335, 446]]), { color: '#241b17', size: 3.2 })
  );

  // Head, Face & Hair
  commands.push(
    makeStroke('trainers', smoothCurve([[286, 230], [290, 240], [285, 248], [275, 258], [265, 265]]), { color: '#201612', size: 3.4 }),
    makeStroke('trainers', smoothCurve([[208, 250], [214, 275]]), { color: '#201612', size: 3.4 }),
    makeStroke('trainers', smoothCurve([[262, 230], [268, 226], [270, 236], [265, 242]]), { color: '#201612', size: 3.2 }),
    makeStroke('trainers', [[285, 246], [276, 250]], { color: '#201612', size: 3.0 }),
    makeStroke('trainers', smoothCurve([[284, 214], [316, 218], [314, 236], [284, 232], [284, 214]]), { color: '#09090b', size: 3.8 }),
    makeStroke('trainers', [[284, 222], [266, 228]], { color: '#09090b', size: 3.2 }),
    makeStroke('trainers', [[292, 224], [298, 226]], { color: '#09090b', size: 3.5 }),
    makeStroke('trainers', [[286, 218], [300, 222]], { color: '#09090b', size: 3.6 })
  );

  // Hair tufts
  const hair = [
    smoothCurve([[210, 250], [195, 232], [204, 220]]),
    smoothCurve([[204, 220], [190, 205], [202, 192]]),
    smoothCurve([[202, 192], [194, 172], [212, 164]]),
    smoothCurve([[212, 164], [215, 145], [230, 142]]),
    smoothCurve([[230, 142], [242, 138], [252, 145]]),
    smoothCurve([[252, 145], [268, 142], [278, 154]]),
    smoothCurve([[278, 154], [295, 162], [290, 176]]),
    smoothCurve([[290, 176], [305, 185], [296, 198]]),
    smoothCurve([[296, 198], [308, 208], [292, 216]])
  ];
  for (const pts of hair) {
    commands.push(makeStroke('trainers', pts, { color: '#1a1412', size: 3.6 }));
  }

  // Anger FX (Popping vein '#' in red, rage lines, sweat)
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

  // ROARK CONTOURS
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

  // Pants
  commands.push(
    makeStroke('trainers', smoothCurve([[732, 350], [715, 410], [695, 470], [682, 526]]), { color: '#241b17', size: 3.5 }),
    makeStroke('trainers', smoothCurve([[756, 385], [740, 440], [720, 485], [704, 524]]), { color: '#241b17', size: 3.5 }),
    makeStroke('trainers', smoothCurve([[756, 385], [775, 435], [805, 475], [842, 516]]), { color: '#241b17', size: 3.5 }),
    makeStroke('trainers', smoothCurve([[798, 345], [825, 405], [850, 465], [868, 516]]), { color: '#241b17', size: 3.5 }),
    makeStroke('trainers', [[756, 385], [758, 352]], { color: '#241b17', size: 3.0 }),
    makeStroke('trainers', smoothCurve([[700, 445], [715, 452], [730, 446]]), { color: '#241b17', size: 2.8 }),
    makeStroke('trainers', smoothCurve([[785, 440], [805, 448], [825, 442]]), { color: '#241b17', size: 2.8 })
  );

  // Torso & T-shirt
  commands.push(
    makeStroke('trainers', smoothCurve([[736, 230], [750, 236], [766, 228]]), { color: '#241b17', size: 3.6 }),
    makeStroke('trainers', smoothCurve([[728, 348], [764, 354], [800, 345]]), { color: '#241b17', size: 3.6 }),
    makeStroke('trainers', smoothCurve([[706, 236], [712, 290], [728, 348]]), { color: '#241b17', size: 3.6 }),
    makeStroke('trainers', smoothCurve([[794, 226], [796, 285], [800, 345]]), { color: '#241b17', size: 3.6 }),
    makeStroke('trainers', smoothCurve([[740, 310], [760, 325], [778, 315]]), { color: '#241b17', size: 2.8 })
  );

  // Arms: Gesturing hand & pocket hand
  commands.push(
    // Gesturing left arm
    makeStroke('trainers', smoothCurve([[706, 236], [688, 255], [682, 268]]), { color: '#241b17', size: 3.4 }),
    makeStroke('trainers', [[682, 268], [704, 262]], { color: '#241b17', size: 3.0 }),
    makeStroke('trainers', smoothCurve([[684, 268], [665, 290], [648, 262]]), { color: '#241b17', size: 3.4 }),
    makeStroke('trainers', smoothCurve([[702, 264], [678, 280], [656, 254]]), { color: '#241b17', size: 3.4 }),
    // Hand & fingers
    makeStroke('trainers', smoothCurve([[656, 254], [650, 245], [656, 238], [648, 236]]), { color: '#241b17', size: 3.2 }),
    makeStroke('trainers', smoothCurve([[648, 236], [626, 238], [622, 246], [640, 252]]), { color: '#241b17', size: 3.2 }),
    makeStroke('trainers', smoothCurve([[640, 252], [624, 254], [628, 260], [646, 258]]), { color: '#241b17', size: 3.2 }),
    makeStroke('trainers', smoothCurve([[646, 258], [632, 264], [638, 268], [648, 262]]), { color: '#241b17', size: 3.2 }),
    // Right arm in pocket
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

  // Bangs & Smug Face
  commands.push(
    makeStroke('trainers', smoothCurve([[704, 152], [708, 168], [714, 154]]), { color: '#1a1412', size: 3.6 }),
    makeStroke('trainers', smoothCurve([[714, 154], [722, 172], [728, 154]]), { color: '#1a1412', size: 3.6 }),
    makeStroke('trainers', smoothCurve([[728, 154], [738, 168], [746, 152]]), { color: '#1a1412', size: 3.6 }),
    makeStroke('trainers', smoothCurve([[764, 150], [770, 176], [774, 152]]), { color: '#1a1412', size: 3.6 }),
    // Face
    makeStroke('trainers', smoothCurve([[708, 165], [716, 192], [735, 206], [756, 192], [766, 175]]), { color: '#201612', size: 3.4 }),
    // Smug half-lidded eyes looking across
    makeStroke('trainers', smoothCurve([[716, 166], [726, 165]]), { color: '#09090b', size: 3.8 }),
    makeStroke('trainers', smoothCurve([[718, 168], [724, 169]]), { color: '#09090b', size: 2.5 }),
    makeStroke('trainers', [[720, 167], [722, 167]], { color: '#09090b', size: 4.0 }),
    makeStroke('trainers', smoothCurve([[738, 164], [748, 163]]), { color: '#09090b', size: 3.8 }),
    makeStroke('trainers', smoothCurve([[740, 166], [746, 167]]), { color: '#09090b', size: 2.5 }),
    makeStroke('trainers', [[742, 165], [744, 165]], { color: '#09090b', size: 4.0 }),
    makeStroke('trainers', smoothCurve([[736, 155], [746, 152], [752, 156]]), { color: '#09090b', size: 3.5 }),
    makeStroke('trainers', smoothCurve([[716, 158], [726, 158]]), { color: '#09090b', size: 3.0 }),
    makeStroke('trainers', [[732, 170], [730, 176]], { color: '#201612', size: 2.5 }),
    // SMIRK
    makeStroke('trainers', smoothCurve([[724, 184], [736, 184], [752, 174]]), { color: '#09090b', size: 3.8 }),
    makeStroke('trainers', [[750, 172], [754, 176]], { color: '#09090b', size: 3.0 }),
    // Sparkle
    makeStroke('trainers', [[648, 166], [668, 166]], { color: '#09090b', size: 3.2 }),
    makeStroke('trainers', [[658, 156], [658, 176]], { color: '#09090b', size: 3.2 })
  );

  // Shadows
  commands.push(...hatch('trainers', 190, 298, 255, 298, 45, 4, 10, { color: '#241b17', size: 1.8, opacity: 0.55 }));
  commands.push(...hatch('trainers', 160, 420, 210, 420, 45, 4, 12, { color: '#241b17', size: 1.8, opacity: 0.55 }));
  commands.push(...hatch('trainers', 725, 206, 750, 206, 50, 3.5, 9, { color: '#241b17', size: 1.8, opacity: 0.5 }));

  return commands;
}

// ----------------------------------------------------
// PASS 3: Accurate Monferno (Bulbapedia anatomy)
// ----------------------------------------------------
function buildPass3Monferno() {
  const commands = [];

  // Monferno anatomy:
  // - Orange body fur (#ea580c)
  // - Tan / cream muzzle & chest & ears (#fef3c7 / #fde68a)
  // - White spiky neck collar / ruff (#ffffff)
  // - Gold shoulder arm bands (#f59e0b)
  // - Blue mask markings above eyes (#2563eb)
  // - Red mark between eyes (#dc2626)
  // - Orange head tuft (#ea580c)
  // - Long tail with flame at tip (yellow #fde047 core, orange #ea580c flickers)
  // - Knocked out X X eyes & dazed slack mouth with tongue

  // Washes
  commands.push(
    // Floor contact shadow
    { type: 'ellipse', layer: 'monferno', x: 420, y: 462, width: 120, height: 14, color: '#baa894', opacity: 0.65 },
    // Orange body
    { type: 'ellipse', layer: 'monferno', x: 460, y: 440, width: 60, height: 26, color: '#ea580c', opacity: 0.9 },
    // Tan chest/belly patch
    { type: 'ellipse', layer: 'monferno', x: 468, y: 448, width: 44, height: 16, color: '#fde68a', opacity: 0.95 },
    // Head orange
    { type: 'ellipse', layer: 'monferno', x: 430, y: 432, width: 36, height: 28, color: '#ea580c', opacity: 0.95 },
    // Tan blunt muzzle
    { type: 'ellipse', layer: 'monferno', x: 434, y: 445, width: 22, height: 13, color: '#fde68a', opacity: 0.95 },
    // Tan ear interiors
    { type: 'ellipse', layer: 'monferno', x: 423, y: 433, width: 10, height: 10, color: '#fde68a', opacity: 0.9 },
    { type: 'ellipse', layer: 'monferno', x: 463, y: 433, width: 10, height: 10, color: '#fde68a', opacity: 0.9 },
    // Blue mask markings above eyes
    { type: 'ellipse', layer: 'monferno', x: 435, y: 436, width: 14, height: 8, color: '#2563eb', opacity: 0.95 },
    { type: 'ellipse', layer: 'monferno', x: 448, y: 435, width: 14, height: 8, color: '#2563eb', opacity: 0.95 },
    // Flame core & glow
    { type: 'ellipse', layer: 'monferno', x: 565, y: 392, width: 20, height: 26, color: '#fde047', opacity: 0.95 },
    { type: 'ellipse', layer: 'monferno', x: 560, y: 386, width: 28, height: 34, color: '#ea580c', opacity: 0.6 }
  );

  // White neck ruff / collar
  const neckRuff = [
    smoothCurve([[454, 438], [458, 444], [462, 440]]),
    smoothCurve([[462, 440], [466, 446], [470, 441]]),
    smoothCurve([[456, 446], [460, 452], [465, 448]]),
  ];
  for (const pts of neckRuff) {
    commands.push(makeStroke('monferno', pts, { color: '#ffffff', size: 3.5, opacity: 1.0, brush: 'brush' }));
    commands.push(makeStroke('monferno', pts, { color: '#38302c', size: 2.2, opacity: 0.85 }));
  }

  // Gold shoulder bands
  commands.push(
    makeStroke('monferno', [[436, 452], [434, 456]], { color: '#f59e0b', size: 4.5, opacity: 1.0, brush: 'brush' }),
    makeStroke('monferno', [[466, 454], [464, 458]], { color: '#f59e0b', size: 4.5, opacity: 1.0, brush: 'brush' })
  );

  // Contours: Head & Ears
  commands.push(
    makeStroke('monferno', smoothCurve([[432, 442], [430, 450], [438, 457], [455, 456], [464, 448], [462, 436], [448, 432], [436, 436], [432, 442]]), { color: '#2e241e', size: 3.4 }),
    // Left ear
    makeStroke('monferno', smoothCurve([[432, 436], [423, 430], [422, 442], [430, 444]]), { color: '#2e241e', size: 3.2 }),
    // Right ear
    makeStroke('monferno', smoothCurve([[458, 434], [467, 428], [468, 440], [460, 442]]), { color: '#2e241e', size: 3.2 }),
    // Head hair tuft
    makeStroke('monferno', smoothCurve([[442, 432], [445, 422], [448, 432]]), { color: '#2e241e', size: 3.2 }),
    // Red mark between eyes
    makeStroke('monferno', [[446, 438], [448, 438]], { color: '#dc2626', size: 3.8 })
  );

  // KNOCKED OUT X X EYES!
  commands.push(
    // Left eye X (bold cartoon KO)
    makeStroke('monferno', [[436, 439], [445, 447]], { color: '#09090b', size: 3.8 }),
    makeStroke('monferno', [[445, 439], [436, 447]], { color: '#09090b', size: 3.8 }),
    // Right eye X
    makeStroke('monferno', [[448, 438], [457, 446]], { color: '#09090b', size: 3.8 }),
    makeStroke('monferno', [[457, 438], [448, 446]], { color: '#09090b', size: 3.8 }),
    // Comical dazed slack mouth with little tongue out
    makeStroke('monferno', smoothCurve([[441, 452], [446, 456], [452, 453]]), { color: '#09090b', size: 2.8 }),
    makeStroke('monferno', smoothCurve([[446, 455], [448, 458], [450, 455]]), { color: '#ef4444', size: 2.5 })
  );

  // Limp sprawled limbs
  commands.push(
    // Left arm & tan fingers
    makeStroke('monferno', smoothCurve([[434, 452], [424, 455], [414, 452], [410, 456]]), { color: '#2e241e', size: 3.2 }),
    makeStroke('monferno', [[410, 456], [407, 458]], { color: '#d97706', size: 3.2 }),
    // Right arm & tan fingers
    makeStroke('monferno', smoothCurve([[462, 454], [470, 462], [478, 465]]), { color: '#2e241e', size: 3.2 }),
    makeStroke('monferno', [[478, 465], [482, 467]], { color: '#d97706', size: 3.2 }),
    // Body & limp hind legs
    makeStroke('monferno', smoothCurve([[460, 445], [485, 442], [512, 445], [520, 452]]), { color: '#2e241e', size: 3.4 }),
    makeStroke('monferno', smoothCurve([[464, 456], [490, 460], [515, 458]]), { color: '#2e241e', size: 3.0 }),
    makeStroke('monferno', smoothCurve([[512, 450], [526, 454], [534, 452]]), { color: '#2e241e', size: 3.2 })
  );

  // Tail & Flame
  commands.push(
    // Red patch at base of tail
    makeStroke('monferno', [[518, 448], [524, 444]], { color: '#dc2626', size: 4.5 }),
    // Curled monkey tail
    makeStroke('monferno', smoothCurve([[518, 448], [534, 438], [550, 426], [565, 414], [572, 406]]), { color: '#c2410c', size: 4.5 }),
    makeStroke('monferno', smoothCurve([[518, 448], [534, 438], [550, 426], [565, 414], [572, 406]]), { color: '#2e241e', size: 2.5 }),
    // Flame
    makeStroke('monferno', smoothCurve([[568, 410], [564, 396], [572, 384], [578, 394], [576, 412]]), { color: '#fde047', size: 4.5, brush: 'brush' }),
    makeStroke('monferno', smoothCurve([[564, 414], [556, 398], [566, 382], [576, 374], [584, 386], [588, 405], [576, 418]]), { color: '#ea580c', size: 3.0 }),
    makeStroke('monferno', smoothCurve([[574, 380], [578, 368], [580, 380]]), { color: '#f97316', size: 2.5 })
  );

  // Comic Knockout FX (dizzy spiral stars)
  commands.push(
    makeStroke('monferno', smoothCurve([[438, 418], [444, 422], [440, 426], [436, 420]]), { color: '#eab308', size: 2.8 }),
    makeStroke('monferno', smoothCurve([[452, 414], [458, 418], [454, 422], [450, 416]]), { color: '#eab308', size: 2.8 }),
    makeStroke('monferno', smoothCurve([[464, 416], [470, 420], [466, 424], [462, 418]]), { color: '#eab308', size: 2.8 }),
    // Ground shadow
    makeStroke('monferno', [[420, 464], [530, 464]], { color: '#3d342d', size: 4.0, opacity: 0.5 })
  );

  return commands;
}

// ----------------------------------------------------
// PASS 4: Speech Bubble & Hand-Lettered Text
// ----------------------------------------------------
function buildPass4Bubble() {
  const commands = [];

  // Solid clean off-white fill for speech bubble
  commands.push(
    { type: 'rect', layer: 'bubble', x: 415, y: 32, width: 280, height: 100, color: '#fffef9', opacity: 0.98 },
    { type: 'ellipse', layer: 'bubble', x: 405, y: 32, width: 30, height: 100, color: '#fffef9', opacity: 0.98 },
    { type: 'ellipse', layer: 'bubble', x: 680, y: 32, width: 30, height: 100, color: '#fffef9', opacity: 0.98 }
  );

  // Bubble tail fill pointing to Roark's mouth at (730, 180)
  for (const pts of [
    [[660, 134], [730, 180]],
    [[666, 134], [730, 180]],
    [[672, 132], [730, 180]],
    [[678, 130], [730, 180]],
  ]) {
    commands.push(makeStroke('bubble', pts, { color: '#fffef9', size: 8 }));
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
    makeStroke('bubble', bubbleOutline, { color: '#09090b', size: 4.0 })
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
      size: 3.4,
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

console.log(`Saved pass files:`);
console.log(`Pass 1 (Arena): ${p1.length} commands`);
console.log(`Pass 2 (Trainers): ${p2.length} commands`);
console.log(`Pass 3 (Monferno): ${p3.length} commands`);
console.log(`Pass 4 (Bubble): ${p4.length} commands`);
console.log(`Total: ${p1.length + p2.length + p3.length + p4.length} commands.`);
