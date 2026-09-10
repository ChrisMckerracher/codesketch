// artifacts/tumblr-builder.mjs
// Native command generator for the Tumblr reaction artwork in Codesketch.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Helper for smooth spline / multi-point stroke
function makeStroke(layer, points, { color = '#2a221f', size = 3, opacity = 1.0, brush = 'pencil' } = {}) {
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

// Catmull-Rom spline interpolation to generate natural organic strokes
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

// Organic line generator with slight natural hand jitter/variance
function organicLine(p1, p2, segments = 3, wobble = 0.8) {
  const pts = [p1];
  for (let i = 1; i < segments; i++) {
    const ratio = i / segments;
    const x = p1[0] + (p2[0] - p1[0]) * ratio + (Math.sin(i * 3.7) * wobble);
    const y = p1[1] + (p2[1] - p1[1]) * ratio + (Math.cos(i * 2.3) * wobble);
    pts.push([x, y]);
  }
  pts.push(p2);
  return smoothCurve(pts, 3);
}

// Hatching generator for shadows
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

// Comic font glyph definition (normalized 0-10 width, 0-12 height)
// Baseline at y=8, cap-height at y=0, x-height at y=3.5, descender at y=11
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

function renderTextStrokes(text, startX, startY, scale = 1.3, layer = 'speech', strokeOpts = {}) {
  const commands = [];
  let curX = startX;
  for (const char of text) {
    const glyph = GLYPHS[char] || { width: 4.5, strokes: [] };
    for (const strokePts of glyph.strokes) {
      const smoothed = smoothCurve(strokePts.map(([gx, gy]) => [curX + gx * scale, startY + gy * scale]), 2);
      commands.push(makeStroke(layer, smoothed, {
        brush: 'pencil',
        size: strokeOpts.size || 3.2,
        color: strokeOpts.color || '#181210',
        opacity: strokeOpts.opacity || 1.0,
      }));
    }
    curX += (glyph.width + 1.2) * scale;
  }
  return { commands, width: curX - startX };
}

// Calculate text total width for centering
function measureTextWidth(text, scale = 1.3) {
  let width = 0;
  for (const char of text) {
    const glyph = GLYPHS[char] || { width: 4.5 };
    width += (glyph.width + 1.2) * scale;
  }
  return width;
}

export function generateArtworkCommands() {
  const commands = [];

  // ==========================================
  // PASS 1: Base Canvas & Layer Registration
  // ==========================================
  commands.push(
    { type: 'fill', color: '#f6f1e7' }, // warm sketchbook paper
    { type: 'layer.add', id: 'arena', name: 'Gym Architecture' },
    { type: 'layer.add', id: 'washes', name: 'Muted Washes' },
    { type: 'layer.add', id: 'monferno', name: 'Knocked Out Monferno' },
    { type: 'layer.add', id: 'characters', name: 'Character Contours' },
    { type: 'layer.add', id: 'shading', name: 'Hatching & Accents' },
    { type: 'layer.add', id: 'speech', name: 'Speech Bubble & Text' }
  );

  // Subtle paper grain vignette pencil marks
  const paperEdges = [
    [[0, 10], [50, 0]], [[950, 0], [1000, 15]],
    [[0, 685], [45, 700]], [[960, 700], [1000, 680]]
  ];
  for (const pts of paperEdges) {
    commands.push(makeStroke('arena', pts, { color: '#ded7c8', size: 2, opacity: 0.4, brush: 'pencil' }));
  }

  // ==========================================
  // PASS 2: Arena Gym Architecture
  // ==========================================
  // Background steps & floor tiers
  const arenaStepLines = [
    // Top wall line
    [[0, 240], [1000, 240]],
    // Middle step shelf
    [[0, 268], [1000, 268]],
    // Lower step shelf
    [[0, 298], [1000, 298]],
    // Tier 1 curve (arena upper boundary)
    smoothCurve([[0, 315], [250, 332], [500, 338], [750, 332], [1000, 315]]),
    // Tier 2 curve (arena mid step)
    smoothCurve([[0, 380], [250, 400], [500, 408], [750, 400], [1000, 380]]),
    // Tier 3 curve (arena lower ring)
    smoothCurve([[0, 452], [250, 476], [500, 485], [750, 476], [1000, 452]]),
    // Bottom sweeping floor curve
    smoothCurve([[0, 630], [250, 665], [500, 678], [750, 665], [1000, 630]]),
  ];
  for (const pts of arenaStepLines) {
    commands.push(makeStroke('arena', pts, { color: '#4a4038', size: 3.5, opacity: 0.85, brush: 'pencil' }));
  }

  // Arena Center Battle Oval
  // Outer circle
  const centerOvalPts = [];
  const outerOvalPts = [];
  const cx = 506, cy = 526, rx = 88, ry = 23;
  const orx = 188, ory = 44;
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    centerOvalPts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    outerOvalPts.push([cx + Math.cos(a) * orx, cy + Math.sin(a) * ory]);
  }
  commands.push(makeStroke('arena', centerOvalPts, { color: '#544940', size: 3.2, opacity: 0.85, brush: 'pencil' }));
  commands.push(makeStroke('arena', outerOvalPts, { color: '#685c52', size: 2.5, opacity: 0.6, brush: 'pencil' }));

  // Central Hexagonal Doorway / Portal Emblem
  const hexOuter = [
    [506, 92], [565, 126], [565, 192], [506, 226], [447, 192], [447, 126], [506, 92]
  ];
  const hexInner = [
    [506, 122], [543, 143], [543, 175], [506, 196], [469, 175], [469, 143], [506, 122]
  ];
  commands.push(makeStroke('arena', hexOuter, { color: '#3d342d', size: 4.2, opacity: 0.95, brush: 'pencil' }));
  commands.push(makeStroke('arena', hexInner, { color: '#4d4239', size: 3.5, opacity: 0.9, brush: 'pencil' }));

  // Bevel depth lines connecting inner and outer hexagon
  for (let i = 0; i < 6; i++) {
    commands.push(makeStroke('arena', [hexOuter[i], hexInner[i]], { color: '#594d42', size: 2.5, opacity: 0.75, brush: 'pencil' }));
  }

  // Hexagon base pedestal and plinth
  const hexPlinth = [
    [447, 192], [440, 240], [468, 240], [478, 226], [534, 226], [544, 240], [572, 240], [565, 192]
  ];
  commands.push(makeStroke('arena', hexPlinth, { color: '#453b33', size: 3.5, opacity: 0.9, brush: 'pencil' }));

  // Flanking pillars / architectural braces
  const leftStrut = [
    [[282, 78], [280, 195]],
    [[280, 125], [315, 78]],
    [[258, 240], [258, 195]],
  ];
  for (const pts of leftStrut) {
    commands.push(makeStroke('arena', pts, { color: '#4d4239', size: 3.5, opacity: 0.85, brush: 'pencil' }));
  }

  const rightStrut = [
    [[626, 78], [662, 195]],
    [[655, 125], [620, 78]],
    [[685, 240], [685, 195]],
  ];
  for (const pts of rightStrut) {
    commands.push(makeStroke('arena', pts, { color: '#4d4239', size: 3.5, opacity: 0.85, brush: 'pencil' }));
  }

  // Side Rock Pedestals & Angular Crystals
  // Left Pedestal
  const leftPedestal = [
    [[0, 205], [125, 205]],
    [[125, 205], [125, 295]],
    [[0, 295], [125, 295]],
    // Crystal facets
    [[60, 108], [24, 155]], [[60, 108], [95, 150]],
    [[24, 155], [62, 205]], [[95, 150], [62, 205]],
    [[24, 155], [60, 165]], [[95, 150], [60, 165]], [[60, 165], [62, 205]],
    [[12, 185], [35, 205]], [[105, 180], [85, 205]],
  ];
  for (const pts of leftPedestal) {
    commands.push(makeStroke('arena', pts, { color: '#453a32', size: 3.2, opacity: 0.85, brush: 'pencil' }));
  }

  // Right Pedestal
  const rightPedestal = [
    [[875, 205], [1000, 205]],
    [[875, 205], [875, 295]],
    [[875, 295], [1000, 295]],
    // Crystal facets
    [[940, 108], [904, 155]], [[940, 108], [975, 150]],
    [[904, 155], [942, 205]], [[975, 150], [942, 205]],
    [[904, 155], [940, 165]], [[975, 150], [940, 165]], [[940, 165], [942, 205]],
    [[892, 185], [915, 205]], [[985, 180], [965, 205]],
  ];
  for (const pts of rightPedestal) {
    commands.push(makeStroke('arena', pts, { color: '#453a32', size: 3.2, opacity: 0.85, brush: 'pencil' }));
  }

  // ==========================================
  // PASS 3: Muted Washes (Backdrop & Arena)
  // ==========================================
  // Stone tint washes
  commands.push(
    // Hexagon void dark wash
    { type: 'rect', layer: 'washes', x: 470, y: 135, width: 72, height: 50, color: '#e8dfce', opacity: 0.6 },
    // Step shadow wash
    { type: 'rect', layer: 'washes', x: 0, y: 240, width: 1000, height: 26, color: '#ede5d5', opacity: 0.45 },
    { type: 'rect', layer: 'washes', x: 0, y: 268, width: 1000, height: 28, color: '#e6ded0', opacity: 0.4 },
    // Arena center ring subtle warm tint
    { type: 'ellipse', layer: 'washes', x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2, color: '#ece4d4', opacity: 0.5 }
  );

  // Soft stone shadow strokes using marker
  const stoneWashes = [
    [[450, 180], [560, 180]],
    [[445, 230], [565, 230]],
    [[30, 215], [115, 215]],
    [[885, 215], [975, 215]],
  ];
  for (const pts of stoneWashes) {
    commands.push(makeStroke('washes', pts, { color: '#d5cbba', size: 14, opacity: 0.35, brush: 'marker' }));
  }

  // ==========================================
  // PASS 4: Knocked-Out Monferno (In the Gap)
  // ==========================================
  // Monferno sits in the gap between Lucas (x ~ 330) and Roark (x ~ 680)
  // Position: x ~ 430 to 580, y ~ 415 to 480
  // Base color washes for Monferno
  // Orange body
  commands.push(
    // Torso wash
    { type: 'ellipse', layer: 'monferno', x: 462, y: 442, width: 56, height: 24, color: '#ea580c', opacity: 0.75 },
    // Head wash
    { type: 'ellipse', layer: 'monferno', x: 432, y: 434, width: 34, height: 26, color: '#ea580c', opacity: 0.8 },
    // Cream face / muzzle
    { type: 'ellipse', layer: 'monferno', x: 434, y: 444, width: 22, height: 14, color: '#fef3c7', opacity: 0.9 },
    // Blue mask / ears
    { type: 'ellipse', layer: 'monferno', x: 438, y: 432, width: 12, height: 10, color: '#2563eb', opacity: 0.85 },
    { type: 'ellipse', layer: 'monferno', x: 448, y: 430, width: 10, height: 8, color: '#2563eb', opacity: 0.85 },
    // Flame core & glow
    { type: 'ellipse', layer: 'monferno', x: 565, y: 395, width: 18, height: 24, color: '#fbbf24', opacity: 0.9 },
    { type: 'ellipse', layer: 'monferno', x: 562, y: 390, width: 24, height: 30, color: '#f97316', opacity: 0.55 },
    // Floor contact shadow under Monferno
    { type: 'ellipse', layer: 'monferno', x: 425, y: 462, width: 110, height: 12, color: '#baa894', opacity: 0.65 }
  );

  // Monferno contours & details (pencil/ink)
  // Head contour
  const monfernoHead = smoothCurve([
    [432, 442], [430, 450], [438, 457], [455, 456], [464, 448], [462, 436], [448, 432], [436, 436], [432, 442]
  ]);
  commands.push(makeStroke('monferno', monfernoHead, { color: '#2e241e', size: 3.2, opacity: 1.0, brush: 'pencil' }));

  // Crown tuft
  const crownTuft = smoothCurve([
    [442, 432], [445, 424], [448, 432]
  ]);
  commands.push(makeStroke('monferno', crownTuft, { color: '#2e241e', size: 3.0, opacity: 1.0, brush: 'pencil' }));

  // Blue ear markings
  commands.push(
    makeStroke('monferno', [[432, 436], [426, 434], [428, 442], [432, 440]], { color: '#1d4ed8', size: 2.8, opacity: 1.0, brush: 'pencil' }),
    makeStroke('monferno', [[456, 432], [462, 430], [464, 438], [458, 438]], { color: '#1d4ed8', size: 2.8, opacity: 1.0, brush: 'pencil' })
  );

  // Muzzle line
  commands.push(makeStroke('monferno', smoothCurve([[434, 447], [444, 452], [454, 448]]), { color: '#524338', size: 2.2, opacity: 0.85, brush: 'pencil' }));

  // KNOCKED OUT X X EYES!
  // Left eye X
  commands.push(
    makeStroke('monferno', [[437, 441], [444, 447]], { color: '#181210', size: 3.2, opacity: 1.0, brush: 'pencil' }),
    makeStroke('monferno', [[444, 441], [437, 447]], { color: '#181210', size: 3.2, opacity: 1.0, brush: 'pencil' }),
    // Right eye X
    makeStroke('monferno', [[448, 440], [455, 446]], { color: '#181210', size: 3.2, opacity: 1.0, brush: 'pencil' }),
    makeStroke('monferno', [[455, 440], [448, 446]], { color: '#181210', size: 3.2, opacity: 1.0, brush: 'pencil' })
  );

  // Comical dazed slack mouth
  commands.push(makeStroke('monferno', smoothCurve([[442, 453], [446, 455], [450, 453]]), { color: '#181210', size: 2.5, opacity: 1.0, brush: 'pencil' }));

  // Limp sprawled arms
  // Left arm limp on ground
  const monfLeftArm = smoothCurve([[438, 452], [425, 455], [415, 452], [410, 456]]);
  commands.push(makeStroke('monferno', monfLeftArm, { color: '#2e241e', size: 3.0, opacity: 1.0, brush: 'pencil' }));
  // Right arm limp on ground
  const monfRightArm = smoothCurve([[458, 454], [466, 462], [475, 465]]);
  commands.push(makeStroke('monferno', monfRightArm, { color: '#2e241e', size: 3.0, opacity: 1.0, brush: 'pencil' }));

  // Torso back contour
  const monfBack = smoothCurve([[460, 445], [485, 442], [512, 445], [520, 452]]);
  commands.push(makeStroke('monferno', monfBack, { color: '#2e241e', size: 3.2, opacity: 1.0, brush: 'pencil' }));
  // Belly contour
  const monfBelly = smoothCurve([[464, 456], [490, 460], [515, 458]]);
  commands.push(makeStroke('monferno', monfBelly, { color: '#2e241e', size: 2.8, opacity: 0.9, brush: 'pencil' }));

  // Limp hind legs
  const monfLegs = smoothCurve([[512, 450], [526, 454], [534, 452]]);
  commands.push(makeStroke('monferno', monfLegs, { color: '#2e241e', size: 3.0, opacity: 1.0, brush: 'pencil' }));

  // Curled monkey tail
  const monfTail = smoothCurve([[518, 448], [532, 440], [548, 428], [564, 415], [572, 408]]);
  commands.push(makeStroke('monferno', monfTail, { color: '#c2410c', size: 4.2, opacity: 1.0, brush: 'pencil' }));
  commands.push(makeStroke('monferno', monfTail, { color: '#2e241e', size: 2.2, opacity: 0.8, brush: 'pencil' }));

  // Tail flame contours & flickers
  const flameOuter = smoothCurve([
    [566, 412], [558, 400], [565, 388], [574, 380], [582, 388], [586, 404], [576, 416]
  ]);
  const flameInner = smoothCurve([
    [569, 408], [565, 398], [572, 388], [578, 396], [576, 408]
  ]);
  commands.push(makeStroke('monferno', flameOuter, { color: '#ea580c', size: 2.8, opacity: 0.9, brush: 'pencil' }));
  commands.push(makeStroke('monferno', flameInner, { color: '#d97706', size: 2.2, opacity: 0.9, brush: 'pencil' }));

  // Comical knock-out dizzy stars / spiral above head
  const dizzyStar1 = [[444, 420], [448, 426], [442, 424], [450, 422]];
  const dizzyStar2 = [[455, 418], [458, 424], [453, 422], [460, 420]];
  commands.push(
    makeStroke('monferno', dizzyStar1, { color: '#d97706', size: 2.2, opacity: 0.9, brush: 'pencil' }),
    makeStroke('monferno', dizzyStar2, { color: '#d97706', size: 2.2, opacity: 0.9, brush: 'pencil' }),
    // Sweat droplet on head
    makeStroke('monferno', smoothCurve([[432, 430], [428, 426], [430, 422], [432, 430]]), { color: '#38bdf8', size: 2.0, opacity: 0.9, brush: 'pencil' })
  );

  // ==========================================
  // PASS 5: Left Trainer (Lucas)
  // ==========================================
  // Color Washes for Lucas
  commands.push(
    // Hoodie wash (muted slate/navy blue)
    { type: 'ellipse', layer: 'washes', x: 155, y: 310, width: 130, height: 125, color: '#475569', opacity: 0.65 },
    // Sleeves wash
    { type: 'ellipse', layer: 'washes', x: 110, y: 335, width: 45, height: 80, color: '#475569', opacity: 0.65 },
    { type: 'ellipse', layer: 'washes', x: 280, y: 335, width: 50, height: 80, color: '#475569', opacity: 0.65 },
    // Trousers wash (muted warm khaki)
    { type: 'rect', layer: 'washes', x: 95, y: 440, width: 85, height: 180, color: '#b8a994', opacity: 0.6 },
    { type: 'rect', layer: 'washes', x: 255, y: 440, width: 95, height: 175, color: '#b8a994', opacity: 0.6 },
    // Hair wash (dark charcoal)
    { type: 'ellipse', layer: 'washes', x: 200, y: 155, width: 105, height: 95, color: '#1e293b', opacity: 0.8 },
    // Pokeball Backpack top half (brick red)
    { type: 'ellipse', layer: 'washes', x: 138, y: 332, width: 88, height: 44, color: '#c2410c', opacity: 0.85 },
    // Pokeball Backpack bottom half (cream)
    { type: 'ellipse', layer: 'washes', x: 138, y: 374, width: 88, height: 44, color: '#f5efe6', opacity: 0.95 },
    // Boots wash
    { type: 'ellipse', layer: 'washes', x: 70, y: 625, width: 75, height: 35, color: '#2d2724', opacity: 0.75 },
    { type: 'ellipse', layer: 'washes', x: 275, y: 620, width: 105, height: 35, color: '#2d2724', opacity: 0.75 },
    // Ground shadows
    { type: 'ellipse', layer: 'washes', x: 65, y: 652, width: 90, height: 14, color: '#9e8e7a', opacity: 0.6 },
    { type: 'ellipse', layer: 'washes', x: 270, y: 648, width: 120, height: 16, color: '#9e8e7a', opacity: 0.6 }
  );

  // Lucas Contours (Pencil & Ink)
  // Left Boot (chunky trainer boot)
  const lucasLeftBoot = [
    smoothCurve([[72, 646], [68, 654], [78, 660], [138, 660], [146, 654], [144, 644]]), // sole bottom
    smoothCurve([[72, 646], [74, 638], [88, 626], [105, 624]]), // heel & ankle back
    smoothCurve([[105, 624], [120, 624], [132, 632], [144, 644]]), // ankle front to toe
    [[70, 652], [145, 652]], // sole tread separator
  ];
  for (const pts of lucasLeftBoot) {
    commands.push(makeStroke('characters', pts, { color: '#241b17', size: 3.8, opacity: 1.0, brush: 'pencil' }));
  }

  // Right Boot (angled outward)
  const lucasRightBoot = [
    smoothCurve([[272, 644], [268, 652], [278, 658], [372, 658], [386, 650], [382, 638]]), // sole bottom
    smoothCurve([[272, 644], [275, 634], [288, 622], [315, 616]]), // heel & ankle back
    smoothCurve([[315, 616], [342, 616], [365, 626], [382, 638]]), // front to toe
    [[270, 650], [384, 646]], // sole tread separator
  ];
  for (const pts of lucasRightBoot) {
    commands.push(makeStroke('characters', pts, { color: '#241b17', size: 3.8, opacity: 1.0, brush: 'pencil' }));
  }

  // Lucas Pants (wide stance, anime creases)
  const lucasPants = [
    // Left leg outer contour
    smoothCurve([[165, 442], [145, 490], [122, 550], [105, 624]]),
    // Left leg inner seam
    smoothCurve([[226, 482], [195, 535], [165, 580], [136, 625]]),
    // Right leg inner seam
    smoothCurve([[226, 482], [252, 530], [278, 575], [292, 616]]),
    // Right leg outer contour
    smoothCurve([[278, 440], [305, 490], [332, 550], [354, 616]]),
    // Crotch crease
    [[226, 482], [228, 452]],
    // Knee & cuff creases
    smoothCurve([[125, 545], [140, 552], [152, 546]]),
    smoothCurve([[305, 542], [320, 548], [330, 542]]),
    smoothCurve([[110, 618], [125, 624], [136, 618]]),
    smoothCurve([[300, 612], [325, 618], [350, 612]]),
  ];
  for (const pts of lucasPants) {
    commands.push(makeStroke('characters', pts, { color: '#28201a', size: 3.5, opacity: 1.0, brush: 'pencil' }));
  }

  // Lucas Hoodie & Torso
  const lucasTorso = [
    // Waistband bottom
    smoothCurve([[164, 442], [220, 446], [278, 440]]),
    // Waistband top line (ribbing)
    smoothCurve([[166, 432], [220, 435], [276, 430]]),
    // Left torso side
    smoothCurve([[152, 325], [158, 380], [165, 432]]),
    // Right torso side
    smoothCurve([[278, 325], [274, 380], [276, 430]]),
    // Bunched hood around neck
    smoothCurve([[188, 292], [205, 305], [235, 308], [266, 296]]),
    smoothCurve([[192, 280], [225, 290], [262, 282]]),
    smoothCurve([[208, 305], [215, 318], [232, 316], [236, 308]]), // hood folds
  ];
  for (const pts of lucasTorso) {
    commands.push(makeStroke('characters', pts, { color: '#241b17', size: 3.6, opacity: 1.0, brush: 'pencil' }));
  }

  // Pokeball Backpack (on back)
  const bpCx = 182, bpCy = 376, bpR = 44;
  const bpOutline = [];
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    bpOutline.push([bpCx + Math.cos(a) * bpR, bpCy + Math.sin(a) * bpR]);
  }
  commands.push(makeStroke('characters', bpOutline, { color: '#201612', size: 4.0, opacity: 1.0, brush: 'pencil' }));

  // Pokeball center band
  commands.push(
    makeStroke('characters', [[bpCx - bpR + 2, bpCy - 4], [bpCx + bpR - 2, bpCy - 4]], { color: '#201612', size: 3.5, opacity: 1.0, brush: 'pencil' }),
    makeStroke('characters', [[bpCx - bpR + 2, bpCy + 4], [bpCx + bpR - 2, bpCy + 4]], { color: '#201612', size: 3.5, opacity: 1.0, brush: 'pencil' })
  );

  // Pokeball center button
  const btnOuter = [], btnInner = [];
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    btnOuter.push([bpCx + Math.cos(a) * 14, bpCy + Math.sin(a) * 14]);
    btnInner.push([bpCx + Math.cos(a) * 7, bpCy + Math.sin(a) * 7]);
  }
  commands.push(
    { type: 'ellipse', layer: 'characters', x: bpCx - 14, y: bpCy - 14, width: 28, height: 28, color: '#f7f2e7', opacity: 1.0 },
    makeStroke('characters', btnOuter, { color: '#201612', size: 3.5, opacity: 1.0, brush: 'pencil' }),
    makeStroke('characters', btnInner, { color: '#201612', size: 3.0, opacity: 1.0, brush: 'pencil' })
  );

  // Backpack straps & bottom triangular flap accents
  commands.push(
    makeStroke('characters', smoothCurve([[160, 315], [162, 345], [168, 375]]), { color: '#241b17', size: 3.5, opacity: 1.0, brush: 'pencil' }),
    makeStroke('characters', smoothCurve([[210, 315], [205, 345], [202, 375]]), { color: '#241b17', size: 3.2, opacity: 1.0, brush: 'pencil' }),
    makeStroke('characters', [[155, 412], [148, 426], [165, 420]], { color: '#241b17', size: 3.0, opacity: 1.0, brush: 'pencil' }),
    makeStroke('characters', [[210, 410], [218, 424], [202, 418]], { color: '#241b17', size: 3.0, opacity: 1.0, brush: 'pencil' })
  );

  // Lucas Left Arm & Clenched Fist
  const lucasLeftArm = [
    // Outer arm / sleeve
    smoothCurve([[152, 325], [125, 365], [115, 395], [118, 424]]),
    // Inner arm / sleeve
    smoothCurve([[162, 375], [148, 400], [135, 425]]),
    // Cuff line
    smoothCurve([[118, 424], [128, 426], [136, 424]]),
    // Clenched fist knuckles
    smoothCurve([[118, 426], [112, 436], [116, 448], [128, 452], [138, 448], [140, 436], [135, 425]]),
    // Thumb clamped over knuckles
    smoothCurve([[130, 430], [136, 436], [134, 446], [124, 446]]),
    // Knuckle creases
    [[116, 442], [124, 440]],
    [[125, 442], [132, 441]],
  ];
  for (const pts of lucasLeftArm) {
    commands.push(makeStroke('characters', pts, { color: '#241b17', size: 3.5, opacity: 1.0, brush: 'pencil' }));
  }

  // Lucas Right Arm & Clenched Fist
  const lucasRightArm = [
    // Outer arm / sleeve
    smoothCurve([[278, 325], [305, 365], [325, 395], [328, 422]]),
    // Inner arm / sleeve
    smoothCurve([[270, 375], [290, 400], [310, 424]]),
    // Cuff line
    smoothCurve([[310, 424], [318, 426], [328, 422]]),
    // Clenched fist knuckles
    smoothCurve([[312, 425], [315, 436], [322, 448], [334, 452], [345, 448], [346, 436], [328, 422]]),
    // Thumb clamped over knuckles
    smoothCurve([[320, 430], [324, 436], [326, 446], [335, 446]]),
    // Knuckle creases
    [[326, 441], [334, 441]],
    [[335, 442], [342, 440]],
  ];
  for (const pts of lucasRightArm) {
    commands.push(makeStroke('characters', pts, { color: '#241b17', size: 3.5, opacity: 1.0, brush: 'pencil' }));
  }

  // Lucas Head, Messy Hair, Glasses, Profile
  const lucasHead = [
    // Jawline and cheek (right side profile)
    smoothCurve([[286, 230], [290, 240], [285, 248], [275, 258], [265, 265]]),
    // Neck back
    smoothCurve([[208, 250], [214, 275]]),
    // Ear
    smoothCurve([[262, 230], [268, 226], [270, 236], [265, 242]]),
    // Clenched mouth / grimace
    [[285, 246], [276, 250]],
    // Furrowed angry brow
    smoothCurve([[286, 220], [298, 224]]),
    // Angry squint eye
    smoothCurve([[292, 225], [298, 227]]),
    // Glasses (distinctive thick rectangular frames)
    smoothCurve([[284, 216], [314, 220], [312, 234], [284, 230], [284, 216]]),
    // Glasses ear temple arm
    [[284, 222], [266, 228]],
  ];
  for (const pts of lucasHead) {
    commands.push(makeStroke('characters', pts, { color: '#201612', size: 3.4, opacity: 1.0, brush: 'pencil' }));
  }

  // Messy Spiky Hair Tufts (fanning outward in all directions)
  const hairTufts = [
    smoothCurve([[210, 250], [195, 232], [204, 220]]),
    smoothCurve([[204, 220], [190, 205], [202, 192]]),
    smoothCurve([[202, 192], [194, 172], [212, 164]]),
    smoothCurve([[212, 164], [215, 145], [230, 142]]),
    smoothCurve([[230, 142], [242, 138], [252, 145]]),
    smoothCurve([[252, 145], [268, 142], [278, 154]]),
    smoothCurve([[278, 154], [295, 162], [290, 176]]),
    smoothCurve([[290, 176], [305, 185], [296, 198]]),
    smoothCurve([[296, 198], [308, 208], [292, 216]]),
    // Inner hair tuft lines for texture
    smoothCurve([[225, 155], [232, 180]]),
    smoothCurve([[250, 150], [254, 185]]),
    smoothCurve([[270, 160], [268, 195]]),
    smoothCurve([[238, 185], [242, 220]]),
  ];
  for (const pts of hairTufts) {
    commands.push(makeStroke('characters', pts, { color: '#1a1412', size: 3.6, opacity: 1.0, brush: 'pencil' }));
  }

  // Lucas Anger Symbols (popping vein '#', rage squiggles, sweat drops)
  // Popping vein '#' / 4-pointed tick in deep angry red
  commands.push(
    makeStroke('shading', [[268, 174], [282, 174]], { color: '#b91c1c', size: 3.5, opacity: 1.0, brush: 'pencil' }),
    makeStroke('shading', [[268, 182], [282, 182]], { color: '#b91c1c', size: 3.5, opacity: 1.0, brush: 'pencil' }),
    makeStroke('shading', [[272, 170], [272, 186]], { color: '#b91c1c', size: 3.5, opacity: 1.0, brush: 'pencil' }),
    makeStroke('shading', [[278, 170], [278, 186]], { color: '#b91c1c', size: 3.5, opacity: 1.0, brush: 'pencil' })
  );

  // Rage vibration squiggles
  const rageLines = [
    smoothCurve([[338, 155], [344, 165], [338, 175], [344, 185]]),
    smoothCurve([[352, 150], [358, 162], [350, 174], [358, 186]]),
  ];
  for (const pts of rageLines) {
    commands.push(makeStroke('shading', pts, { color: '#241b17', size: 3.2, opacity: 0.9, brush: 'pencil' }));
  }

  // Flying sweat droplets
  const sweatDrops = [
    smoothCurve([[305, 170], [314, 165], [312, 160], [305, 170]]),
    smoothCurve([[315, 190], [324, 186], [322, 180], [315, 190]]),
    smoothCurve([[285, 260], [292, 266], [290, 270], [285, 260]]),
  ];
  for (const pts of sweatDrops) {
    commands.push(makeStroke('shading', pts, { color: '#0284c7', size: 2.5, opacity: 0.9, brush: 'pencil' }));
  }

  // ==========================================
  // PASS 6: Right Trainer (Roark)
  // ==========================================
  // Color Washes for Roark
  commands.push(
    // T-shirt wash (casual heather gray/tan)
    { type: 'ellipse', layer: 'washes', x: 695, y: 228, width: 125, height: 125, color: '#cbd5e1', opacity: 0.7 },
    // Baggy trousers wash (dusty slate blue)
    { type: 'rect', layer: 'washes', x: 675, y: 350, width: 85, height: 180, color: '#64748b', opacity: 0.65 },
    { type: 'rect', layer: 'washes', x: 765, y: 350, width: 95, height: 170, color: '#64748b', opacity: 0.65 },
    // Mining boots wash (deep leather brown)
    { type: 'ellipse', layer: 'washes', x: 672, y: 524, width: 75, height: 32, color: '#452a1b', opacity: 0.8 },
    { type: 'ellipse', layer: 'washes', x: 830, y: 516, width: 76, height: 32, color: '#452a1b', opacity: 0.8 },
    // Miner helmet wash (ochre yellow hard hat)
    { type: 'ellipse', layer: 'washes', x: 685, y: 96, width: 100, height: 58, color: '#d97706', opacity: 0.75 },
    // Headlamp fixture yellow glow
    { type: 'ellipse', layer: 'washes', x: 694, y: 114, width: 24, height: 24, color: '#fef08a', opacity: 0.9 },
    // Skin wash (face, arms, neck)
    { type: 'ellipse', layer: 'washes', x: 710, y: 160, width: 55, height: 50, color: '#fed7aa', opacity: 0.7 },
    { type: 'ellipse', layer: 'washes', x: 630, y: 240, width: 45, height: 45, color: '#fed7aa', opacity: 0.7 },
    // Ground shadows
    { type: 'ellipse', layer: 'washes', x: 668, y: 546, width: 80, height: 14, color: '#9e8e7a', opacity: 0.6 },
    { type: 'ellipse', layer: 'washes', x: 825, y: 538, width: 85, height: 14, color: '#9e8e7a', opacity: 0.6 }
  );

  // Roark Mining Boots
  const roarkLeftBoot = [
    smoothCurve([[674, 542], [670, 550], [678, 556], [732, 556], [742, 550], [740, 540]]), // sole
    smoothCurve([[674, 542], [676, 532], [690, 524]]), // heel to cuff
    smoothCurve([[708, 522], [724, 530], [740, 540]]), // front to toe
    [[672, 548], [741, 548]], // sole tread separator
  ];
  for (const pts of roarkLeftBoot) {
    commands.push(makeStroke('characters', pts, { color: '#241b17', size: 3.8, opacity: 1.0, brush: 'pencil' }));
  }

  const roarkRightBoot = [
    smoothCurve([[832, 534], [828, 542], [836, 548], [890, 548], [900, 542], [898, 532]]), // sole
    smoothCurve([[832, 534], [834, 524], [846, 516]]), // heel to cuff
    smoothCurve([[864, 514], [882, 522], [898, 532]]), // front to toe
    [[830, 540], [899, 540]], // sole tread separator
  ];
  for (const pts of roarkRightBoot) {
    commands.push(makeStroke('characters', pts, { color: '#241b17', size: 3.8, opacity: 1.0, brush: 'pencil' }));
  }

  // Roark Baggy Trousers (relaxed mining pants)
  const roarkPants = [
    // Left leg outer
    smoothCurve([[732, 350], [715, 410], [695, 470], [682, 526]]),
    // Left leg inner seam
    smoothCurve([[756, 385], [740, 440], [720, 485], [704, 524]]),
    // Right leg inner seam
    smoothCurve([[756, 385], [775, 435], [805, 475], [842, 516]]),
    // Right leg outer
    smoothCurve([[798, 345], [825, 405], [850, 465], [868, 516]]),
    // Crotch crease & pocket lines
    [[756, 385], [758, 352]],
    smoothCurve([[782, 355], [795, 375]]),
    // Knee & fold creases
    smoothCurve([[700, 445], [715, 452], [730, 446]]),
    smoothCurve([[785, 440], [805, 448], [825, 442]]),
    smoothCurve([[688, 520], [700, 524]]),
    smoothCurve([[845, 510], [860, 514]]),
  ];
  for (const pts of roarkPants) {
    commands.push(makeStroke('characters', pts, { color: '#241b17', size: 3.5, opacity: 1.0, brush: 'pencil' }));
  }

  // Roark T-shirt & Torso
  const roarkTorso = [
    // Crew collar
    smoothCurve([[736, 230], [750, 236], [766, 228]]),
    // Waistline / hem
    smoothCurve([[728, 348], [764, 354], [800, 345]]),
    // Left torso
    smoothCurve([[706, 236], [712, 290], [728, 348]]),
    // Right torso
    smoothCurve([[794, 226], [796, 285], [800, 345]]),
    // Shirt fold lines
    smoothCurve([[740, 310], [760, 325], [778, 315]]),
  ];
  for (const pts of roarkTorso) {
    commands.push(makeStroke('characters', pts, { color: '#241b17', size: 3.6, opacity: 1.0, brush: 'pencil' }));
  }

  // Roark Left Gesturing Arm (taunting palm-up gesture toward Lucas)
  const roarkLeftArm = [
    // Shoulder & sleeve
    smoothCurve([[706, 236], [688, 255], [682, 268]]),
    [[682, 268], [704, 262]], // sleeve hem
    // Bare forearm extending up-left
    smoothCurve([[684, 268], [665, 290], [648, 262]]), // elbow to wrist underside
    smoothCurve([[702, 264], [678, 280], [656, 254]]), // upper forearm
    // Relaxed open palm & thumb
    smoothCurve([[656, 254], [650, 245], [656, 238], [648, 236]]), // thumb
    // Taunting splayed fingers (pointing at Lucas)
    smoothCurve([[648, 236], [626, 238], [622, 246], [640, 252]]), // index finger
    smoothCurve([[640, 252], [624, 254], [628, 260], [646, 258]]), // middle finger
    smoothCurve([[646, 258], [632, 264], [638, 268], [648, 262]]), // ring/pinky
  ];
  for (const pts of roarkLeftArm) {
    commands.push(makeStroke('characters', pts, { color: '#241b17', size: 3.4, opacity: 1.0, brush: 'pencil' }));
  }

  // Roark Right Arm (hand casually tucked in pocket/hip)
  const roarkRightArm = [
    // Shoulder & sleeve
    smoothCurve([[794, 226], [816, 245], [820, 258]]),
    [[820, 258], [804, 256]], // sleeve hem
    // Arm bent back to pocket
    smoothCurve([[820, 258], [842, 290], [832, 325], [818, 342]]),
    smoothCurve([[804, 256], [824, 285], [816, 318], [808, 335]]),
  ];
  for (const pts of roarkRightArm) {
    commands.push(makeStroke('characters', pts, { color: '#241b17', size: 3.5, opacity: 1.0, brush: 'pencil' }));
  }

  // Roark Miner Helmet & Headlamp
  // Dome crest
  const helmetDome = smoothCurve([
    [684, 152], [696, 118], [724, 96], [754, 104], [780, 132], [784, 150]
  ]);
  const helmetBrim = smoothCurve([
    [678, 154], [708, 150], [742, 148], [774, 146], [788, 150]
  ]);
  const helmetCrest = smoothCurve([
    [724, 96], [730, 115], [734, 148]
  ]);
  commands.push(
    makeStroke('characters', helmetDome, { color: '#201612', size: 4.0, opacity: 1.0, brush: 'pencil' }),
    makeStroke('characters', helmetBrim, { color: '#201612', size: 4.0, opacity: 1.0, brush: 'pencil' }),
    makeStroke('characters', helmetCrest, { color: '#201612', size: 3.0, opacity: 1.0, brush: 'pencil' })
  );

  // Headlamp Fixture on front brim
  const lampCx = 706, lampCy = 126;
  const lampRim = [];
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    lampRim.push([lampCx + Math.cos(a) * 13, lampCy + Math.sin(a) * 13]);
  }
  commands.push(
    // Bracket
    makeStroke('characters', [[695, 134], [698, 122], [706, 114]], { color: '#201612', size: 3.5, opacity: 1.0, brush: 'pencil' }),
    makeStroke('characters', lampRim, { color: '#201612', size: 3.5, opacity: 1.0, brush: 'pencil' }),
    // Inner lamp bulb
    makeStroke('characters', [[lampCx - 5, lampCy], [lampCx + 5, lampCy]], { color: '#d97706', size: 2.5, opacity: 1.0, brush: 'pencil' })
  );

  // Roark Messy Bangs peeking under helmet
  const roarkBangs = [
    smoothCurve([[704, 152], [708, 168], [714, 154]]),
    smoothCurve([[714, 154], [722, 172], [728, 154]]),
    smoothCurve([[728, 154], [738, 168], [746, 152]]),
    smoothCurve([[764, 150], [770, 176], [774, 152]]), // sideburn
  ];
  for (const pts of roarkBangs) {
    commands.push(makeStroke('characters', pts, { color: '#1a1412', size: 3.4, opacity: 1.0, brush: 'pencil' }));
  }

  // Roark Smug Face & Expression
  const roarkFace = [
    // Jawline & chin
    smoothCurve([[708, 165], [716, 192], [735, 206], [756, 192], [766, 175]]),
    // Half-lidded cocky left eye (looking at Lucas)
    smoothCurve([[716, 166], [726, 165]]), // upper lid (smug horizontal)
    smoothCurve([[718, 168], [724, 169]]), // lower lid
    [[720, 167], [722, 167]], // pupil looking across
    // Half-lidded right eye
    smoothCurve([[738, 164], [748, 163]]),
    smoothCurve([[740, 166], [746, 167]]),
    [[742, 165], [744, 165]],
    // Raised cocky eyebrow (right)
    smoothCurve([[736, 155], [746, 152], [752, 156]]),
    // Relaxed eyebrow (left)
    smoothCurve([[716, 158], [726, 158]]),
    // Nose
    [[732, 170], [730, 176]],
    // SMUG SMIRK! Curving up high on right cheek
    smoothCurve([[724, 184], [736, 184], [750, 176]]),
    // Smirk corner crease
    [[748, 174], [752, 178]],
  ];
  for (const pts of roarkFace) {
    commands.push(makeStroke('characters', pts, { color: '#201612', size: 3.2, opacity: 1.0, brush: 'pencil' }));
  }

  // Roark Sparkle / Glint `✦` near mouth
  const sparkCx = 658, sparkCy = 166;
  commands.push(
    makeStroke('shading', [[sparkCx - 10, sparkCy], [sparkCx + 10, sparkCy]], { color: '#201612', size: 3.0, opacity: 1.0, brush: 'pencil' }),
    makeStroke('shading', [[sparkCx, sparkCy - 10], [sparkCx, sparkCy + 10]], { color: '#201612', size: 3.0, opacity: 1.0, brush: 'pencil' })
  );

  // Cross-hatching for shadows on both characters
  // Under Lucas hood
  commands.push(...hatch('shading', 190, 298, 255, 298, 45, 4, 10, { color: '#241b17', size: 1.8, opacity: 0.55 }));
  // Under Lucas backpack
  commands.push(...hatch('shading', 160, 420, 210, 420, 45, 4, 12, { color: '#241b17', size: 1.8, opacity: 0.55 }));
  // Lucas pants inner thigh shadow
  commands.push(...hatch('shading', 215, 480, 240, 520, 60, 4, 12, { color: '#241b17', size: 1.8, opacity: 0.45 }));
  // Under Roark chin / neck
  commands.push(...hatch('shading', 725, 206, 750, 206, 50, 3.5, 9, { color: '#241b17', size: 1.8, opacity: 0.5 }));
  // Roark pants crotch shadow
  commands.push(...hatch('shading', 745, 385, 770, 415, 55, 4, 10, { color: '#241b17', size: 1.8, opacity: 0.4 }));

  // ==========================================
  // PASS 7: Speech Bubble & Hand-Lettering
  // ==========================================
  // Requirements:
  // - "Right man's speech bubble must read EXACTLY: 'I can SEE the sweat pouring out of your pokeballs bro'."
  // - "Tail points to his mouth."
  // - "Plan readable hand-drawn lettering with clear line breaks, enough room, no collision with heads."
  //
  // Bubble bounds: x: 405 to 705 (width 300), y: 26 to 138 (height 112)
  // Roark's mouth is at (734, 184)
  // Tail originates from bubble at (662, 134) to (682, 128) and points down-right to (730, 180).

  // Solid clean off-white fill for speech bubble so text is 100% crisp & readable
  commands.push(
    { type: 'rect', layer: 'speech', x: 415, y: 32, width: 280, height: 100, color: '#fffef9', opacity: 0.98 },
    { type: 'ellipse', layer: 'speech', x: 405, y: 32, width: 30, height: 100, color: '#fffef9', opacity: 0.98 },
    { type: 'ellipse', layer: 'speech', x: 680, y: 32, width: 30, height: 100, color: '#fffef9', opacity: 0.98 }
  );

  // Bubble tail fill
  const tailFillStrokes = [
    [[660, 134], [728, 178]],
    [[666, 134], [728, 178]],
    [[672, 132], [728, 178]],
    [[678, 130], [728, 178]],
  ];
  for (const pts of tailFillStrokes) {
    commands.push(makeStroke('speech', pts, { color: '#fffef9', size: 8, opacity: 1.0, brush: 'pencil' }));
  }

  // Hand-inked Speech Bubble Outline
  const bubbleOutline = smoothCurve([
    [420, 26], [555, 24], [690, 26], [705, 42],
    [708, 80], [704, 120], [688, 132],
    // Tail
    [680, 132], [730, 178], [664, 136],
    [555, 138], [420, 138], [406, 122],
    [404, 80], [406, 42], [420, 26]
  ]);
  commands.push(makeStroke('speech', bubbleOutline, { color: '#201612', size: 3.8, opacity: 1.0, brush: 'pencil' }));

  // Hand-Lettered Text (EXACT: "I can SEE the sweat pouring out of your pokeballs bro")
  // 4 Lines:
  // Line 1: "I can SEE"
  // Line 2: "the sweat pouring"
  // Line 3: "out of your"
  // Line 4: "pokeballs bro"
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
    const rendered = renderTextStrokes(line.text, startX, line.y, fontScale, 'speech', {
      size: 3.2,
      color: '#181210',
      opacity: 1.0
    });
    commands.push(...rendered.commands);
  }

  return commands;
}

// Generate commands and partition into batches of 15-20 commands
const allCommands = generateArtworkCommands();
console.log(`Generated ${allCommands.length} commands total.`);

// Partition into batches
const BATCH_SIZE = 18;
const batches = [];
for (let i = 0; i < allCommands.length; i += BATCH_SIZE) {
  batches.push(allCommands.slice(i, i + BATCH_SIZE));
}

console.log(`Split into ${batches.length} batches of ~${BATCH_SIZE} commands.`);

mkdirSync('artifacts/tumblr-batches', { recursive: true });
for (let i = 0; i < batches.length; i++) {
  const filename = `artifacts/tumblr-batches/batch-${String(i + 1).padStart(2, '0')}.json`;
  writeFileSync(filename, JSON.stringify(batches[i], null, 2));
}

writeFileSync('artifacts/tumblr-all-commands.json', JSON.stringify(allCommands, null, 2));
console.log('Saved all batches to artifacts/tumblr-batches/');
