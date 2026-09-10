// artifacts/tumblr-sketch-maker.mjs
// Generates authentic early-2010s Tumblr pencil sketch passes matching art_inspo.png and start_lol.png.
// Pure graphite sketch style: warm paper, hand-drawn pencil strokes with natural human jitter,
// sketchy overlapping contours, delicate diagonal hatching, and zero robotic geometric fills.

import { writeFileSync } from 'node:fs';

// Helper to add subtle natural human jitter/wobble to coordinate points
function humanJitter(points, intensity = 0.6) {
  return points.map(([x, y], idx) => {
    // Subtle pseudo-random variation based on coordinate and index
    const seed = (x * 12.9898 + y * 78.233 + idx * 37.719);
    const wobbleX = (Math.sin(seed) * 0.7 + Math.cos(seed * 2.1) * 0.3) * intensity;
    const wobbleY = (Math.cos(seed * 1.7) * 0.7 + Math.sin(seed * 3.3) * 0.3) * intensity;
    return [
      Math.max(0, Math.min(1000, Math.round((x + wobbleX) * 10) / 10)),
      Math.max(0, Math.min(700, Math.round((y + wobbleY) * 10) / 10))
    ];
  });
}

// Smooth spline with human hand feel
function sketchStroke(layer, ctrlPoints, { color = '#3c322a', size = 3.5, opacity = 0.9, wobble = 0.5 } = {}) {
  if (ctrlPoints.length === 1) {
    return [{ type: 'stroke', layer, brush: 'pencil', color, size, opacity, points: ctrlPoints }];
  }
  const pts = [];
  const p = [ctrlPoints[0], ...ctrlPoints, ctrlPoints[ctrlPoints.length - 1]];
  const steps = 4;
  for (let i = 1; i < p.length - 2; i++) {
    const p0 = p[i - 1], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2];
    for (let t = 0; t <= steps; t++) {
      if (i > 1 && t === 0) continue;
      const t1 = t / steps;
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
  const jittered = humanJitter(pts, wobble);
  return [{ type: 'stroke', layer, brush: 'pencil', color, size, opacity, points: jittered }];
}

// Sketchy double stroke (a second slightly offset, lighter pencil pass that gives a lively drawn feel)
function doubleStroke(layer, ctrlPoints, opts = {}) {
  const c1 = sketchStroke(layer, ctrlPoints, opts);
  // Second pass with slight offset and lighter opacity
  const offsetPoints = ctrlPoints.map(([x, y]) => [x + 0.6, y + 0.4]);
  const c2 = sketchStroke(layer, offsetPoints, {
    ...opts,
    size: Math.max(1.8, (opts.size || 3.5) * 0.7),
    opacity: (opts.opacity || 0.9) * 0.45,
    wobble: (opts.wobble || 0.5) * 1.4,
  });
  return [...c1, ...c2];
}

// Delicate diagonal pencil hatching (like in art_inspo.png)
function sketchHatch(layer, x1, y1, x2, y2, angleDeg = 48, spacing = 4, length = 11, { color = '#453a32', size = 1.8, opacity = 0.5 } = {}) {
  const commands = [];
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad) * length;
  const dy = Math.sin(rad) * length;
  const stepCount = Math.floor(Math.hypot(x2 - x1, y2 - y1) / spacing);
  for (let i = 0; i <= stepCount; i++) {
    const t = i / (stepCount || 1);
    const sx = x1 + (x2 - x1) * t;
    const sy = y1 + (y2 - y1) * t;
    const pts = humanJitter([[sx, sy], [sx + dx, sy + dy]], 0.4);
    commands.push({ type: 'stroke', layer, brush: 'pencil', color, size, opacity, points: pts });
  }
  return commands;
}

// Comic font glyph definition for hand-lettered speech bubble
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
      const pts = strokePts.map(([gx, gy]) => [curX + gx * scale, startY + gy * scale]);
      commands.push(...sketchStroke(layer, pts, {
        color: strokeOpts.color || '#261e19',
        size: strokeOpts.size || 3.4,
        opacity: 0.95,
        wobble: 0.4,
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
// PASS 1: Arena & Architecture (Pencil Sketch)
// ====================================================
function buildPass1Arena() {
  const commands = [
    { type: 'fill', color: '#f5f0e6' }, // authentic warm sketchbook paper
    { type: 'layer.add', id: 'arena', name: 'Arena Architecture' },
    { type: 'layer.add', id: 'trainers', name: 'Trainers' },
    { type: 'layer.add', id: 'monferno', name: 'Knocked Out Monferno' },
    { type: 'layer.add', id: 'bubble', name: 'Speech Bubble' },
  ];

  // Arena horizontal steps and platform boundaries
  commands.push(
    ...doubleStroke('arena', [[0, 240], [1000, 240]], { color: '#4a4038', size: 3.2 }),
    ...doubleStroke('arena', [[0, 268], [1000, 268]], { color: '#4a4038', size: 3.2 }),
    ...doubleStroke('arena', [[0, 298], [1000, 298]], { color: '#4a4038', size: 3.2 }),
    ...doubleStroke('arena', [[0, 315], [250, 332], [500, 338], [750, 332], [1000, 315]], { color: '#4a4038', size: 3.4 }),
    ...doubleStroke('arena', [[0, 380], [250, 400], [500, 408], [750, 400], [1000, 380]], { color: '#4a4038', size: 3.4 }),
    ...doubleStroke('arena', [[0, 452], [250, 476], [500, 485], [750, 476], [1000, 452]], { color: '#4a4038', size: 3.4 }),
    ...doubleStroke('arena', [[0, 630], [250, 665], [500, 678], [750, 665], [1000, 630]], { color: '#4a4038', size: 3.4 })
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
    ...doubleStroke('arena', centerOval, { color: '#4a4038', size: 3.2 }),
    ...sketchStroke('arena', outerOval, { color: '#685c52', size: 2.5, opacity: 0.7 })
  );

  // Central Hexagon Doorway Portal Emblem
  const hexOuter = [[506, 92], [565, 126], [565, 192], [506, 226], [447, 192], [447, 126], [506, 92]];
  const hexInner = [[506, 122], [543, 143], [543, 175], [506, 196], [469, 175], [469, 143], [506, 122]];
  commands.push(
    ...doubleStroke('arena', hexOuter, { color: '#382f28', size: 3.8 }),
    ...doubleStroke('arena', hexInner, { color: '#4a4038', size: 3.2 })
  );
  for (let i = 0; i < 6; i++) {
    commands.push(...sketchStroke('arena', [hexOuter[i], hexInner[i]], { color: '#594d42', size: 2.5, opacity: 0.8 }));
  }
  commands.push(
    ...doubleStroke('arena', [[447, 192], [440, 240], [468, 240], [478, 226], [534, 226], [544, 240], [572, 240], [565, 192]], { color: '#382f28', size: 3.5 })
  );

  // Pillars / struts
  commands.push(
    ...doubleStroke('arena', [[282, 78], [280, 195]], { color: '#4a4038', size: 3.5 }),
    ...sketchStroke('arena', [[280, 125], [315, 78]], { color: '#4a4038', size: 3.2 }),
    ...doubleStroke('arena', [[626, 78], [662, 195]], { color: '#4a4038', size: 3.5 }),
    ...sketchStroke('arena', [[655, 125], [620, 78]], { color: '#4a4038', size: 3.2 })
  );

  // Side pedestals & faceted rock crystals
  commands.push(
    ...doubleStroke('arena', [[0, 205], [125, 205], [125, 295], [0, 295]], { color: '#453a32', size: 3.2 }),
    ...doubleStroke('arena', [[60, 108], [24, 155], [62, 205], [95, 150], [60, 108]], { color: '#382f28', size: 3.2 }),
    ...sketchStroke('arena', [[24, 155], [60, 165], [95, 150]], { color: '#453a32', size: 2.8 }),
    ...sketchStroke('arena', [[60, 165], [62, 205]], { color: '#453a32', size: 2.8 }),

    ...doubleStroke('arena', [[875, 205], [1000, 205], [1000, 295], [875, 295]], { color: '#453a32', size: 3.2 }),
    ...doubleStroke('arena', [[940, 108], [904, 155], [942, 205], [975, 150], [940, 108]], { color: '#382f28', size: 3.2 }),
    ...sketchStroke('arena', [[904, 155], [940, 165], [975, 150]], { color: '#453a32', size: 2.8 }),
    ...sketchStroke('arena', [[940, 165], [942, 205]], { color: '#453a32', size: 2.8 })
  );

  // Subtle architectural pencil hatching on step risers
  commands.push(
    ...sketchHatch('arena', 20, 240, 260, 240, 50, 6, 9, { color: '#685c52', opacity: 0.4 }),
    ...sketchHatch('arena', 740, 240, 980, 240, 50, 6, 9, { color: '#685c52', opacity: 0.4 }),
    ...sketchHatch('arena', 450, 192, 560, 192, 60, 5, 8, { color: '#594d42', opacity: 0.45 })
  );

  return commands;
}

// ====================================================
// PASS 2: Trainers (Pure Expressive Pencil Sketch)
// ====================================================
function buildPass2Trainers() {
  const commands = [];

  // LUCAS (Left Trainer - Annoyed, stubborn wide stance, clenched fists)
  // Chunky winter trainer boots
  commands.push(
    // Left boot
    ...doubleStroke('trainers', [[72, 646], [68, 654], [78, 660], [138, 660], [146, 654], [144, 644]], { color: '#261e19', size: 3.8 }),
    ...doubleStroke('trainers', [[72, 646], [74, 638], [88, 626], [105, 624]], { color: '#261e19', size: 3.6 }),
    ...doubleStroke('trainers', [[105, 624], [120, 624], [132, 632], [144, 644]], { color: '#261e19', size: 3.6 }),
    ...sketchStroke('trainers', [[70, 652], [145, 652]], { color: '#261e19', size: 3.6 }),
    // Right boot
    ...doubleStroke('trainers', [[272, 644], [268, 652], [278, 658], [372, 658], [386, 650], [382, 638]], { color: '#261e19', size: 3.8 }),
    ...doubleStroke('trainers', [[272, 644], [275, 634], [288, 622], [315, 616]], { color: '#261e19', size: 3.6 }),
    ...doubleStroke('trainers', [[315, 616], [342, 616], [365, 626], [382, 638]], { color: '#261e19', size: 3.6 }),
    ...sketchStroke('trainers', [[270, 650], [384, 646]], { color: '#261e19', size: 3.6 }),
    // Ground shadows
    ...sketchHatch('trainers', 65, 660, 145, 660, 30, 4, 12, { color: '#453a32', opacity: 0.55 }),
    ...sketchHatch('trainers', 270, 658, 385, 658, 30, 4, 12, { color: '#453a32', opacity: 0.55 })
  );

  // Pants (wide stance, denim folds)
  commands.push(
    ...doubleStroke('trainers', [[165, 442], [145, 490], [122, 550], [105, 624]], { color: '#261e19', size: 3.6 }),
    ...doubleStroke('trainers', [[226, 482], [195, 535], [165, 580], [136, 625]], { color: '#261e19', size: 3.5 }),
    ...doubleStroke('trainers', [[226, 482], [252, 530], [278, 575], [292, 616]], { color: '#261e19', size: 3.5 }),
    ...doubleStroke('trainers', [[278, 440], [305, 490], [332, 550], [354, 616]], { color: '#261e19', size: 3.6 }),
    ...sketchStroke('trainers', [[226, 482], [228, 452]], { color: '#261e19', size: 3.0 }),
    ...sketchStroke('trainers', [[125, 545], [140, 552], [152, 546]], { color: '#261e19', size: 2.8 }),
    ...sketchStroke('trainers', [[305, 542], [320, 548], [330, 542]], { color: '#261e19', size: 2.8 }),
    ...sketchStroke('trainers', [[110, 618], [125, 624], [136, 618]], { color: '#261e19', size: 2.8 }),
    ...sketchStroke('trainers', [[300, 612], [325, 618], [350, 612]], { color: '#261e19', size: 2.8 }),
    // Pants shadow hatching
    ...sketchHatch('trainers', 150, 480, 180, 530, 65, 4.5, 10, { color: '#382f28', opacity: 0.45 }),
    ...sketchHatch('trainers', 270, 480, 295, 530, 65, 4.5, 10, { color: '#382f28', opacity: 0.45 })
  );

  // Hoodie Torso & bunched hood
  commands.push(
    ...doubleStroke('trainers', [[164, 442], [220, 446], [278, 440]], { color: '#261e19', size: 3.6 }),
    ...sketchStroke('trainers', [[166, 432], [220, 435], [276, 430]], { color: '#261e19', size: 3.2 }),
    ...doubleStroke('trainers', [[152, 325], [158, 380], [165, 432]], { color: '#261e19', size: 3.6 }),
    ...doubleStroke('trainers', [[278, 325], [274, 380], [276, 430]], { color: '#261e19', size: 3.6 }),
    // Bunched hood folds around neck
    ...doubleStroke('trainers', [[188, 292], [205, 305], [235, 308], [266, 296]], { color: '#261e19', size: 3.6 }),
    ...doubleStroke('trainers', [[192, 280], [225, 290], [262, 282]], { color: '#261e19', size: 3.6 }),
    ...sketchStroke('trainers', [[208, 305], [215, 318], [232, 316], [236, 308]], { color: '#261e19', size: 3.2 }),
    ...sketchStroke('trainers', [[180, 315], [195, 335]], { color: '#261e19', size: 3.0 }),
    ...sketchStroke('trainers', [[250, 315], [240, 335]], { color: '#261e19', size: 3.0 }),
    // Hood shadow hatching
    ...sketchHatch('trainers', 190, 298, 255, 298, 45, 4, 9, { color: '#382f28', opacity: 0.5 })
  );

  // Pokeball Backpack
  const bpCx = 182, bpCy = 376, bpR = 44;
  const bpOutline = [];
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    bpOutline.push([bpCx + Math.cos(a) * bpR, bpCy + Math.sin(a) * bpR]);
  }
  commands.push(
    ...doubleStroke('trainers', bpOutline, { color: '#201612', size: 4.0 }),
    ...sketchStroke('trainers', [[bpCx - bpR + 2, bpCy - 4], [bpCx + bpR - 2, bpCy - 4]], { color: '#201612', size: 3.8 }),
    ...sketchStroke('trainers', [[bpCx - bpR + 2, bpCy + 4], [bpCx + bpR - 2, bpCy + 4]], { color: '#201612', size: 3.8 })
  );
  const btnOuter = [], btnInner = [];
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    btnOuter.push([bpCx + Math.cos(a) * 14, bpCy + Math.sin(a) * 14]);
    btnInner.push([bpCx + Math.cos(a) * 7, bpCy + Math.sin(a) * 7]);
  }
  commands.push(
    ...doubleStroke('trainers', btnOuter, { color: '#201612', size: 3.5 }),
    ...sketchStroke('trainers', btnInner, { color: '#201612', size: 3.0 }),
    ...sketchStroke('trainers', [[160, 315], [162, 345], [168, 375]], { color: '#261e19', size: 3.5 }),
    ...sketchStroke('trainers', [[210, 315], [205, 345], [202, 375]], { color: '#261e19', size: 3.2 }),
    ...sketchStroke('trainers', [[155, 412], [148, 426], [165, 420]], { color: '#261e19', size: 3.0 }),
    ...sketchStroke('trainers', [[210, 410], [218, 424], [202, 418]], { color: '#261e19', size: 3.0 }),
    // Backpack hatching
    ...sketchHatch('trainers', 150, 340, 215, 340, 45, 4, 8, { color: '#382f28', opacity: 0.45 }),
    ...sketchHatch('trainers', 160, 420, 210, 420, 45, 4, 11, { color: '#382f28', opacity: 0.5 })
  );

  // Arms & Tensely Clenched Fists
  commands.push(
    // Left arm
    ...doubleStroke('trainers', [[152, 325], [125, 365], [115, 395], [118, 424]], { color: '#261e19', size: 3.5 }),
    ...sketchStroke('trainers', [[162, 375], [148, 400], [135, 425]], { color: '#261e19', size: 3.5 }),
    ...sketchStroke('trainers', [[118, 424], [128, 426], [136, 424]], { color: '#261e19', size: 3.2 }),
    ...doubleStroke('trainers', [[118, 426], [112, 436], [116, 448], [128, 452], [138, 448], [140, 436], [135, 425]], { color: '#261e19', size: 3.6 }),
    ...sketchStroke('trainers', [[130, 430], [136, 436], [134, 446], [124, 446]], { color: '#261e19', size: 3.2 }),
    ...sketchStroke('trainers', [[116, 442], [124, 440]], { color: '#261e19', size: 2.6 }),
    ...sketchStroke('trainers', [[125, 442], [132, 441]], { color: '#261e19', size: 2.6 }),
    // Right arm
    ...doubleStroke('trainers', [[278, 325], [305, 365], [325, 395], [328, 422]], { color: '#261e19', size: 3.5 }),
    ...sketchStroke('trainers', [[270, 375], [290, 400], [310, 424]], { color: '#261e19', size: 3.5 }),
    ...sketchStroke('trainers', [[310, 424], [318, 426], [328, 422]], { color: '#261e19', size: 3.2 }),
    ...doubleStroke('trainers', [[312, 425], [315, 436], [322, 448], [334, 452], [345, 448], [346, 436], [328, 422]], { color: '#261e19', size: 3.6 }),
    ...sketchStroke('trainers', [[320, 430], [324, 436], [326, 446], [335, 446]], { color: '#261e19', size: 3.2 }),
    ...sketchStroke('trainers', [[326, 441], [334, 441]], { color: '#261e19', size: 2.6 }),
    ...sketchStroke('trainers', [[335, 442], [342, 440]], { color: '#261e19', size: 2.6 })
  );

  // Head, Hair, Glasses, Angry Profile Expression
  commands.push(
    // Neck
    ...sketchStroke('trainers', [[210, 250], [216, 280]], { color: '#201612', size: 3.4 }),
    ...sketchStroke('trainers', [[260, 255], [255, 280]], { color: '#201612', size: 3.4 }),
    // Jaw & cheek
    ...doubleStroke('trainers', [[286, 230], [290, 240], [285, 248], [275, 258], [265, 265]], { color: '#201612', size: 3.5 }),
    // Ear
    ...sketchStroke('trainers', [[262, 230], [268, 226], [270, 236], [265, 242]], { color: '#201612', size: 3.2 }),
    // Clenched mouth grimace
    ...sketchStroke('trainers', [[285, 246], [276, 250]], { color: '#110d0a', size: 3.4 }),
    // Rectangular glasses frame
    ...doubleStroke('trainers', [[284, 214], [316, 218], [314, 236], [284, 232], [284, 214]], { color: '#110d0a', size: 3.8 }),
    ...sketchStroke('trainers', [[284, 222], [266, 228]], { color: '#110d0a', size: 3.2 }),
    ...sketchStroke('trainers', [[292, 224], [298, 226]], { color: '#110d0a', size: 3.8 }),
    ...sketchStroke('trainers', [[286, 218], [300, 222]], { color: '#110d0a', size: 3.8 })
  );

  // Spiky Anime Hair Tufts
  const hair = [
    [[210, 250], [195, 232], [204, 220]],
    [[204, 220], [190, 205], [202, 192]],
    [[202, 192], [194, 172], [212, 164]],
    [[212, 164], [215, 145], [230, 142]],
    [[230, 142], [242, 138], [252, 145]],
    [[252, 145], [268, 142], [278, 154]],
    [[278, 154], [295, 162], [290, 176]],
    [[290, 176], [305, 185], [296, 198]],
    [[296, 198], [308, 208], [292, 216]],
    // Internal hair locks
    [[225, 155], [232, 180]],
    [[250, 150], [254, 185]],
    [[270, 160], [268, 195]],
    [[235, 180], [240, 215]],
  ];
  for (const pts of hair) {
    commands.push(...doubleStroke('trainers', pts, { color: '#18120e', size: 3.6 }));
  }

  // Anger FX: Popping `#` vein, squiggly rage lines, sweat drops
  commands.push(
    // Vein `#`
    ...sketchStroke('trainers', [[266, 172], [284, 172]], { color: '#c02626', size: 4.2 }),
    ...sketchStroke('trainers', [[266, 182], [284, 182]], { color: '#c02626', size: 4.2 }),
    ...sketchStroke('trainers', [[270, 168], [270, 188]], { color: '#c02626', size: 4.2 }),
    ...sketchStroke('trainers', [[278, 168], [278, 188]], { color: '#c02626', size: 4.2 }),
    // Rage steam lines
    ...sketchStroke('trainers', [[338, 155], [344, 165], [338, 175], [344, 185]], { color: '#261e19', size: 3.2 }),
    ...sketchStroke('trainers', [[352, 150], [358, 162], [350, 174], [358, 186]], { color: '#261e19', size: 3.2 }),
    // Sweat drops
    ...sketchStroke('trainers', [[305, 170], [314, 165], [312, 160], [305, 170]], { color: '#261e19', size: 2.8 }),
    ...sketchStroke('trainers', [[315, 190], [324, 186], [322, 180], [315, 190]], { color: '#261e19', size: 2.8 })
  );

  // ROARK (Right Trainer - Smug, cocky smirk, mining helmet, gesturing hand)
  // Mining Boots
  commands.push(
    // Left boot
    ...doubleStroke('trainers', [[674, 542], [670, 550], [678, 556], [732, 556], [742, 550], [740, 540]], { color: '#261e19', size: 3.8 }),
    ...doubleStroke('trainers', [[674, 542], [676, 532], [690, 524]], { color: '#261e19', size: 3.6 }),
    ...doubleStroke('trainers', [[708, 522], [724, 530], [740, 540]], { color: '#261e19', size: 3.6 }),
    ...sketchStroke('trainers', [[672, 548], [741, 548]], { color: '#261e19', size: 3.6 }),
    // Right boot
    ...doubleStroke('trainers', [[832, 534], [828, 542], [836, 548], [890, 548], [900, 542], [898, 532]], { color: '#261e19', size: 3.8 }),
    ...doubleStroke('trainers', [[832, 534], [834, 524], [846, 516]], { color: '#261e19', size: 3.6 }),
    ...doubleStroke('trainers', [[864, 514], [882, 522], [898, 532]], { color: '#261e19', size: 3.6 }),
    ...sketchStroke('trainers', [[830, 540], [899, 540]], { color: '#261e19', size: 3.6 }),
    // Ground shadows
    ...sketchHatch('trainers', 668, 554, 742, 554, 30, 4, 12, { color: '#453a32', opacity: 0.55 }),
    ...sketchHatch('trainers', 828, 546, 902, 546, 30, 4, 12, { color: '#453a32', opacity: 0.55 })
  );

  // Baggy Trousers (cargo folds & creases)
  commands.push(
    ...doubleStroke('trainers', [[732, 350], [715, 410], [695, 470], [682, 526]], { color: '#261e19', size: 3.5 }),
    ...doubleStroke('trainers', [[756, 385], [740, 440], [720, 485], [704, 524]], { color: '#261e19', size: 3.5 }),
    ...doubleStroke('trainers', [[756, 385], [775, 435], [805, 475], [842, 516]], { color: '#261e19', size: 3.5 }),
    ...doubleStroke('trainers', [[798, 345], [825, 405], [850, 465], [868, 516]], { color: '#261e19', size: 3.5 }),
    ...sketchStroke('trainers', [[756, 385], [758, 352]], { color: '#261e19', size: 3.0 }),
    ...sketchStroke('trainers', [[782, 355], [795, 375]], { color: '#261e19', size: 2.8 }),
    ...sketchStroke('trainers', [[700, 445], [715, 452], [730, 446]], { color: '#261e19', size: 2.8 }),
    ...sketchStroke('trainers', [[785, 440], [805, 448], [825, 442]], { color: '#261e19', size: 2.8 }),
    // Trouser shading
    ...sketchHatch('trainers', 740, 395, 765, 440, 60, 4.5, 10, { color: '#382f28', opacity: 0.45 })
  );

  // T-shirt & Torso (relaxed slouch)
  commands.push(
    ...doubleStroke('trainers', [[736, 230], [750, 236], [766, 228]], { color: '#261e19', size: 3.6 }),
    ...doubleStroke('trainers', [[728, 348], [764, 354], [800, 345]], { color: '#261e19', size: 3.6 }),
    ...doubleStroke('trainers', [[706, 236], [712, 290], [728, 348]], { color: '#261e19', size: 3.6 }),
    ...doubleStroke('trainers', [[794, 226], [796, 285], [800, 345]], { color: '#261e19', size: 3.6 }),
    ...sketchStroke('trainers', [[740, 310], [760, 325], [778, 315]], { color: '#261e19', size: 2.8 })
  );

  // Arms: Gesturing hand & pocket hand
  commands.push(
    // Left gesturing arm
    ...doubleStroke('trainers', [[706, 236], [688, 255], [682, 268]], { color: '#261e19', size: 3.4 }),
    ...sketchStroke('trainers', [[682, 268], [704, 262]], { color: '#261e19', size: 3.0 }),
    ...doubleStroke('trainers', [[684, 268], [665, 290], [648, 262]], { color: '#261e19', size: 3.4 }),
    ...doubleStroke('trainers', [[702, 264], [678, 280], [656, 254]], { color: '#261e19', size: 3.4 }),
    // Open taunting hand & fingers pointing to Lucas
    ...doubleStroke('trainers', [[656, 254], [650, 245], [656, 238], [648, 236]], { color: '#261e19', size: 3.2 }),
    ...doubleStroke('trainers', [[648, 236], [626, 238], [622, 246], [640, 252]], { color: '#261e19', size: 3.2 }),
    ...doubleStroke('trainers', [[640, 252], [624, 254], [628, 260], [646, 258]], { color: '#261e19', size: 3.2 }),
    ...doubleStroke('trainers', [[646, 258], [632, 264], [638, 268], [648, 262]], { color: '#261e19', size: 3.2 }),
    // Right arm in pocket
    ...doubleStroke('trainers', [[794, 226], [816, 245], [820, 258]], { color: '#261e19', size: 3.5 }),
    ...sketchStroke('trainers', [[820, 258], [804, 256]], { color: '#261e19', size: 3.0 }),
    ...doubleStroke('trainers', [[820, 258], [842, 290], [832, 325], [818, 342]], { color: '#261e19', size: 3.5 }),
    ...doubleStroke('trainers', [[804, 256], [824, 285], [816, 318], [808, 335]], { color: '#261e19', size: 3.5 })
  );

  // Miner Helmet & Headlamp
  commands.push(
    ...doubleStroke('trainers', [[684, 152], [696, 118], [724, 96], [754, 104], [780, 132], [784, 150]], { color: '#1e1612', size: 4.0 }),
    ...doubleStroke('trainers', [[678, 154], [708, 150], [742, 148], [774, 146], [788, 150]], { color: '#1e1612', size: 4.0 }),
    ...sketchStroke('trainers', [[724, 96], [730, 115], [734, 148]], { color: '#1e1612', size: 3.2 })
  );
  const lampRim = [];
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    lampRim.push([706 + Math.cos(a) * 13, 126 + Math.sin(a) * 13]);
  }
  commands.push(
    ...sketchStroke('trainers', [[695, 134], [698, 122], [706, 114]], { color: '#1e1612', size: 3.5 }),
    ...doubleStroke('trainers', lampRim, { color: '#1e1612', size: 3.8 }),
    ...sketchStroke('trainers', [[701, 126], [711, 126]], { color: '#382f28', size: 2.8 }),
    ...sketchStroke('trainers', [[706, 121], [706, 131]], { color: '#382f28', size: 2.8 })
  );

  // Bangs, Face & Smug Expression
  commands.push(
    ...doubleStroke('trainers', [[704, 152], [708, 168], [714, 154]], { color: '#18120e', size: 3.6 }),
    ...doubleStroke('trainers', [[714, 154], [722, 172], [728, 154]], { color: '#18120e', size: 3.6 }),
    ...doubleStroke('trainers', [[728, 154], [738, 168], [746, 152]], { color: '#18120e', size: 3.6 }),
    ...doubleStroke('trainers', [[764, 150], [770, 176], [774, 152]], { color: '#18120e', size: 3.6 }),
    // Face outline
    ...doubleStroke('trainers', [[708, 165], [716, 192], [735, 206], [756, 192], [766, 175]], { color: '#201612', size: 3.4 }),
    // Smug half-lidded eyes looking across at Lucas
    ...doubleStroke('trainers', [[716, 166], [726, 165]], { color: '#110d0a', size: 3.8 }),
    ...sketchStroke('trainers', [[718, 168], [724, 169]], { color: '#110d0a', size: 2.5 }),
    ...sketchStroke('trainers', [[720, 167], [722, 167]], { color: '#110d0a', size: 4.0 }),
    ...doubleStroke('trainers', [[738, 164], [748, 163]], { color: '#110d0a', size: 3.8 }),
    ...sketchStroke('trainers', [[740, 166], [746, 167]], { color: '#110d0a', size: 2.5 }),
    ...sketchStroke('trainers', [[742, 165], [744, 165]], { color: '#110d0a', size: 4.0 }),
    // Eyebrows
    ...sketchStroke('trainers', [[736, 155], [746, 152], [752, 156]], { color: '#110d0a', size: 3.5 }),
    ...sketchStroke('trainers', [[716, 158], [726, 158]], { color: '#110d0a', size: 3.0 }),
    ...sketchStroke('trainers', [[732, 170], [730, 176]], { color: '#201612', size: 2.5 }),
    // SMUG SMIRK
    ...doubleStroke('trainers', [[724, 184], [736, 184], [752, 174]], { color: '#110d0a', size: 3.8 }),
    ...sketchStroke('trainers', [[750, 172], [754, 176]], { color: '#110d0a', size: 3.0 }),
    // Sparkle glint
    ...sketchStroke('trainers', [[648, 166], [668, 166]], { color: '#261e19', size: 3.2 }),
    ...sketchStroke('trainers', [[658, 156], [658, 176]], { color: '#261e19', size: 3.2 }),
    // Roark neck hatching
    ...sketchHatch('trainers', 725, 206, 750, 206, 50, 3.5, 9, { color: '#382f28', opacity: 0.45 })
  );

  return commands;
}

// ====================================================
// PASS 3: Knocked-Out Monferno (Bulbapedia Anatomy)
// ====================================================
function buildPass3Monferno() {
  const commands = [];

  // Monferno Anatomy (Chimpanzee Pokémon):
  // - Orange fur primate head with prominent sharp flame crown tuft
  // - Big curved ears with inner folds
  // - Blunt muzzle with nostrils & slack dazed mouth with comical tongue out
  // - Blue mask markings curving over the brows, small red center dot
  // - Knocked out cartoon "X X" eyes
  // - Spiky white collar / ruff around neck
  // - Gold bands on upper arms near shoulders
  // - Slender primate body and limp sprawled limbs on ground
  // - Long tail with red base, curling upward, terminating in a lively burning flame
  // - Floating yellow spiral stars & sweat bead
  // - Ground contact pencil hatching

  // Ground contact shadow hatching
  commands.push(
    ...sketchHatch('monferno', 420, 464, 530, 464, 25, 4, 10, { color: '#4a4038', opacity: 0.55 })
  );

  // Spiky white neck ruff / collar
  const ruff = [
    [[454, 438], [458, 444], [462, 440]],
    [[462, 440], [466, 446], [470, 441]],
    [[456, 446], [460, 452], [465, 448]],
  ];
  for (const pts of ruff) {
    commands.push(...doubleStroke('monferno', pts, { color: '#261e19', size: 3.2 }));
  }

  // Gold shoulder bands
  commands.push(
    ...doubleStroke('monferno', [[436, 452], [434, 456]], { color: '#261e19', size: 3.5 }),
    ...doubleStroke('monferno', [[466, 454], [464, 458]], { color: '#261e19', size: 3.5 })
  );

  // Head contour, crown tuft, ears
  commands.push(
    ...doubleStroke('monferno', [[432, 442], [430, 450], [438, 457], [455, 456], [464, 448], [462, 436], [448, 432], [436, 436], [432, 442]], { color: '#261e19', size: 3.5 }),
    // Left ear
    ...doubleStroke('monferno', [[432, 436], [423, 430], [422, 442], [430, 444]], { color: '#261e19', size: 3.2 }),
    ...sketchStroke('monferno', [[425, 434], [425, 440]], { color: '#261e19', size: 2.5 }),
    // Right ear
    ...doubleStroke('monferno', [[458, 434], [467, 428], [468, 440], [460, 442]], { color: '#261e19', size: 3.2 }),
    ...sketchStroke('monferno', [[465, 432], [465, 438]], { color: '#261e19', size: 2.5 }),
    // Sharp Flame Crown Tuft on head
    ...doubleStroke('monferno', [[440, 432], [443, 420], [447, 422], [450, 416], [452, 426], [448, 432]], { color: '#261e19', size: 3.4 }),
    // Blue mask markings curving above eyes
    ...doubleStroke('monferno', [[434, 436], [440, 434], [444, 437]], { color: '#261e19', size: 3.2 }),
    ...doubleStroke('monferno', [[447, 437], [452, 434], [458, 436]], { color: '#261e19', size: 3.2 }),
    // Center forehead mark
    ...sketchStroke('monferno', [[445, 437], [447, 437]], { color: '#c02626', size: 3.8 }),
    // Blunt muzzle line
    ...sketchStroke('monferno', [[436, 447], [446, 451], [454, 448]], { color: '#261e19', size: 2.6 })
  );

  // KNOCKED OUT "X X" EYES & COMICAL SLACK MOUTH
  commands.push(
    // Left eye X
    ...doubleStroke('monferno', [[436, 439], [445, 447]], { color: '#110d0a', size: 3.8 }),
    ...doubleStroke('monferno', [[445, 439], [436, 447]], { color: '#110d0a', size: 3.8 }),
    // Right eye X
    ...doubleStroke('monferno', [[448, 438], [457, 446]], { color: '#110d0a', size: 3.8 }),
    ...doubleStroke('monferno', [[457, 438], [448, 446]], { color: '#110d0a', size: 3.8 }),
    // Dazed slack mouth with little pink tongue sticking out
    ...sketchStroke('monferno', [[441, 452], [446, 456], [452, 453]], { color: '#110d0a', size: 2.8 }),
    ...sketchStroke('monferno', [[446, 455], [448, 458], [450, 455]], { color: '#dc2626', size: 2.5 })
  );

  // Limp Sprawled Primate Limbs on Stone
  commands.push(
    // Left arm & splayed fingers
    ...doubleStroke('monferno', [[434, 452], [424, 455], [414, 452], [410, 456]], { color: '#261e19', size: 3.2 }),
    ...sketchStroke('monferno', [[410, 456], [406, 458]], { color: '#261e19', size: 2.8 }),
    ...sketchStroke('monferno', [[411, 454], [408, 453]], { color: '#261e19', size: 2.6 }),
    ...sketchStroke('monferno', [[412, 457], [409, 460]], { color: '#261e19', size: 2.6 }),
    // Right arm & splayed fingers
    ...doubleStroke('monferno', [[462, 454], [470, 462], [478, 465]], { color: '#261e19', size: 3.2 }),
    ...sketchStroke('monferno', [[478, 465], [483, 467]], { color: '#261e19', size: 2.8 }),
    ...sketchStroke('monferno', [[477, 463], [482, 462]], { color: '#261e19', size: 2.6 }),
    // Torso back & belly
    ...doubleStroke('monferno', [[460, 445], [485, 442], [512, 445], [520, 452]], { color: '#261e19', size: 3.5 }),
    ...doubleStroke('monferno', [[464, 456], [490, 460], [515, 458]], { color: '#261e19', size: 3.2 }),
    // Limp hind legs
    ...doubleStroke('monferno', [[512, 450], [526, 454], [534, 452]], { color: '#261e19', size: 3.2 }),
    ...sketchStroke('monferno', [[534, 452], [538, 453]], { color: '#261e19', size: 2.8 }),
    // Chest patch hatching
    ...sketchHatch('monferno', 475, 450, 505, 450, 45, 3.5, 7, { color: '#4a4038', opacity: 0.4 })
  );

  // Long Curled Tail with Flickering Flame
  commands.push(
    // Red tail base patch
    ...sketchStroke('monferno', [[518, 448], [524, 444]], { color: '#c02626', size: 4.2 }),
    // Curled tail
    ...doubleStroke('monferno', [[518, 448], [534, 438], [550, 426], [565, 414], [572, 406]], { color: '#261e19', size: 3.8 }),
    // Active Flame at tip (outer and inner flickers)
    ...doubleStroke('monferno', [[564, 414], [556, 398], [566, 382], [576, 374], [584, 386], [588, 405], [576, 418]], { color: '#261e19', size: 3.2 }),
    ...sketchStroke('monferno', [[568, 410], [564, 396], [572, 384], [578, 394], [576, 412]], { color: '#261e19', size: 2.6 }),
    ...sketchStroke('monferno', [[574, 380], [578, 368], [580, 380]], { color: '#261e19', size: 2.5 }),
    // Flame interior hatching
    ...sketchHatch('monferno', 564, 400, 580, 400, 55, 3.5, 8, { color: '#4a4038', opacity: 0.45 })
  );

  // Comic Knockout FX: Floating yellow dizzy spiral stars & sweat drop
  commands.push(
    ...sketchStroke('monferno', [[438, 418], [444, 422], [440, 426], [436, 420]], { color: '#d97706', size: 2.8 }),
    ...sketchStroke('monferno', [[452, 414], [458, 418], [454, 422], [450, 416]], { color: '#d97706', size: 2.8 }),
    ...sketchStroke('monferno', [[464, 416], [470, 420], [466, 424], [462, 418]], { color: '#d97706', size: 2.8 }),
    ...sketchStroke('monferno', [[432, 430], [428, 426], [430, 422], [432, 430]], { color: '#0284c7', size: 2.4 })
  );

  return commands;
}

// ====================================================
// PASS 4: Speech Bubble & Hand-Lettered Text
// ====================================================
function buildPass4Bubble() {
  const commands = [];

  // Bubble solid opaque paper-white interior using dense pencil hatch / white wash
  // to ensure background lines don't show through
  for (let y = 32; y <= 132; y += 8) {
    commands.push({
      type: 'stroke',
      layer: 'bubble',
      brush: 'pencil',
      color: '#f5f0e6',
      size: 14,
      opacity: 1.0,
      points: [[415, y], [695, y]],
    });
  }

  // Pointer tail white fill
  for (const pts of [
    [[660, 134], [730, 180]],
    [[668, 134], [730, 180]],
    [[676, 132], [730, 180]],
  ]) {
    commands.push({
      type: 'stroke',
      layer: 'bubble',
      brush: 'pencil',
      color: '#f5f0e6',
      size: 10,
      opacity: 1.0,
      points: pts,
    });
  }

  // Hand-inked Speech Bubble Outline (organic slightly wobbly comic contour)
  const bubbleOutline = [
    [420, 26], [555, 24], [690, 26], [705, 42],
    [708, 80], [704, 120], [688, 132],
    // Tail pointing directly to Roark's mouth at (730, 180)
    [680, 132], [730, 180], [664, 136],
    [555, 138], [420, 138], [406, 122],
    [404, 80], [406, 42], [420, 26]
  ];
  commands.push(
    ...doubleStroke('bubble', bubbleOutline, { color: '#1a1410', size: 3.8 })
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
      color: '#1a1410',
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

console.log(`Saved pure sketch pass files:`);
console.log(`Pass 1 (Arena): ${p1.length} commands`);
console.log(`Pass 2 (Trainers): ${p2.length} commands`);
console.log(`Pass 3 (Monferno): ${p3.length} commands`);
console.log(`Pass 4 (Bubble): ${p4.length} commands`);
console.log(`Total: ${p1.length + p2.length + p3.length + p4.length} commands.`);
