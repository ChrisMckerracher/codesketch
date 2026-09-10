import fs from 'node:fs';

// 1. Spline and jitter helpers
function catmullRomSpline(ctrlPoints, pointsPerSegment = 3) {
  if (ctrlPoints.length <= 2) return ctrlPoints;
  const pts = [];
  const p = [ctrlPoints[0], ...ctrlPoints, ctrlPoints[ctrlPoints.length - 1]];
  for (let i = 1; i < p.length - 2; i++) {
    const p0 = p[i - 1], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2];
    for (let t = 0; t <= pointsPerSegment; t++) {
      if (i > 1 && t === 0) continue;
      const t1 = t / pointsPerSegment;
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
      pts.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
    }
  }
  return pts;
}

function handJitter(pts, intensity = 0.22) {
  return pts.map(([x, y], idx) => {
    const s = x * 13.7 + y * 31.9 + idx * 7.3;
    const jx = Math.sin(s) * intensity;
    const jy = Math.cos(s * 1.3) * intensity;
    return [
      Math.max(0, Math.min(1000, Math.round((x + jx) * 10) / 10)),
      Math.max(0, Math.min(700, Math.round((y + jy) * 10) / 10))
    ];
  });
}

const rawStrokes = JSON.parse(fs.readFileSync('artifacts/kirby_monferno_strokes_raw.json'));

// Scaling & centering parameters
// Raw bounds: minX: 59, maxX: 948, minY: 190, maxY: 781
const scale = 0.91;
const offsetX = 92;
const offsetY = 75;

function mapPt([rx, ry]) {
  return [
    Math.round((offsetX + (rx - 59) * scale) * 10) / 10,
    Math.round((offsetY + (ry - 190) * scale) * 10) / 10
  ];
}

// Separate strokes into Monferno vs Kirby vs Effects
// In raw coords:
// Kirby body: x: 380..720, y: 250..530
// Knife: x: 375..445, y: 295..510
// Tail: x: 670..940, y: 190..560 (Monferno tail)
// Monferno head: x: 50..540, y: 400..750
// Monferno body & limbs: y: 480..780

const monfernoRawStrokes = [];
const kirbyRawStrokes = [];

for (const stroke of rawStrokes) {
  if (stroke.length < 2) continue;
  let avgX = 0, avgY = 0;
  for (const [x, y] of stroke) { avgX += x; avgY += y; }
  avgX /= stroke.length;
  avgY /= stroke.length;

  // Tail is Monferno (top right flame: avgX > 680 && avgY < 560, but Kirby is avgX < 710)
  const isTail = (avgX > 690 && avgY < 560) || (avgX > 740);
  const isKnife = (avgX >= 380 && avgX <= 445 && avgY >= 295 && avgY <= 510);
  const isKirbyBody = (avgX > 430 && avgX <= 710 && avgY >= 250 && avgY <= 525);

  if (isKnife || isKirbyBody) {
    kirbyRawStrokes.push(stroke);
  } else {
    monfernoRawStrokes.push(stroke);
  }
}

console.log(`Classified: Monferno=${monfernoRawStrokes.length}, Kirby=${kirbyRawStrokes.length}`);

// Sort in human drawing order
// Monferno: head -> crest -> ears -> face -> torso -> arms/hands -> tail/flame -> feet
monfernoRawStrokes.sort((a, b) => {
  const yA = Math.min(...a.map(p => p[1]));
  const yB = Math.min(...b.map(p => p[1]));
  return yA - yB;
});

// Kirby: round body -> innocent eyes -> happy smile -> knife arm -> knife blade -> feet
kirbyRawStrokes.sort((a, b) => {
  const yA = Math.min(...a.map(p => p[1]));
  const yB = Math.min(...b.map(p => p[1]));
  return yA - yB;
});

function toPencilCommands(strokeList, layer, baseColor = '#2b231d', baseSize = 3.6) {
  const cmds = [];
  for (const raw of strokeList) {
    const canvasPts = raw.map(mapPt);
    const smooth = handJitter(catmullRomSpline(canvasPts, 3), 0.22);
    cmds.push({
      type: 'stroke',
      layer,
      brush: 'pencil',
      color: baseColor,
      size: baseSize,
      opacity: 0.90,
      points: smooth
    });
    // Faint companion sketchy stroke for longer primary contours
    if (smooth.length > 5) {
      cmds.push({
        type: 'stroke',
        layer,
        brush: 'pencil',
        color: '#55463b',
        size: Math.max(1.8, baseSize * 0.65),
        opacity: 0.35,
        points: handJitter(smooth.map(([x, y]) => [x + 0.3, y + 0.25]), 0.28)
      });
    }
  }
  return cmds;
}

// PASS 1: Monferno (Main Character)
const pass1Commands = [
  { type: 'layer.add', id: 'monferno', name: 'Defeated Monferno' },
  ...toPencilCommands(monfernoRawStrokes, 'monferno', '#2b231d', 3.6)
];

// PASS 2: Kirby with Knife
const pass2Commands = [
  { type: 'layer.add', id: 'kirby', name: 'Kirby with Knife' },
  ...toPencilCommands(kirbyRawStrokes, 'kirby', '#261e19', 3.8)
];

// PASS 3: Effects & Meme Details
// Ground contact shadows, dramatic comic impact marks around knife stab, dizzy sweat drops
const pass3Commands = [
  { type: 'layer.add', id: 'effects', name: 'Meme Details & Effects' }
];

// Subtle floor contact shadow beneath Monferno and Kirby
function addShadow(x1, y1, x2, y2, angleDeg = 30, spacing = 5, length = 12) {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad) * length;
  const dy = Math.sin(rad) * length;
  const stepCount = Math.floor(Math.hypot(x2 - x1, y2 - y1) / spacing);
  for (let i = 0; i <= stepCount; i++) {
    const t = i / (stepCount || 1);
    const sx = x1 + (x2 - x1) * t;
    const sy = y1 + (y2 - y1) * t;
    const pts = handJitter([[sx, sy], [sx + dx, sy + dy]], 0.2);
    pass3Commands.push({
      type: 'stroke',
      layer: 'effects',
      brush: 'pencil',
      color: '#55483d',
      size: 1.8,
      opacity: 0.45,
      points: pts
    });
  }
}
// Ground contact shadows under Monferno's head, belly, arms, feet
addShadow(140, 600, 480, 600, 25, 6, 10);
addShadow(500, 620, 850, 620, 25, 6, 10);

// Comic impact lines around the knife plunge point (knife enters at ~ x: 440, y: 350)
function addImpactLine(x1, y1, x2, y2) {
  pass3Commands.push({
    type: 'stroke',
    layer: 'effects',
    brush: 'pencil',
    color: '#211812',
    size: 2.8,
    opacity: 0.88,
    points: handJitter([[x1, y1], [x2, y2]], 0.2)
  });
}
// Impact shock sparks
addImpactLine(425, 340, 410, 325);
addImpactLine(435, 335, 430, 315);
addImpactLine(450, 340, 460, 325);
addImpactLine(420, 355, 405, 360);
addImpactLine(455, 355, 470, 360);

// Comic impact "THWACK!" hand-lettered text in top-left margin (classic early Tumblr comic style)
const GLYPHS = {
  ' ': { width: 5.0, strokes: [] },
  'T': { width: 6.5, strokes: [[[3.2, 0], [3.2, 10]], [[0.5, 0], [6.0, 0]]] },
  'H': { width: 6.5, strokes: [[[1.0, 0], [1.0, 10]], [[5.5, 0], [5.5, 10]], [[1.0, 5], [5.5, 5]]] },
  'W': { width: 8.5, strokes: [[[0.8, 0], [2.4, 10], [4.4, 4.0], [6.2, 10], [8.0, 0]]] },
  'A': { width: 7.0, strokes: [[[0.8, 10], [3.5, 0], [6.2, 10]], [[1.8, 6.5], [5.2, 6.5]]] },
  'C': { width: 6.5, strokes: [[[5.8, 1.8], [3.5, 0], [1.2, 3.5], [1.2, 6.5], [3.5, 10], [5.8, 8.2]]] },
  'K': { width: 6.5, strokes: [[[1.2, 0], [1.2, 10]], [[5.8, 0], [1.2, 5.5]], [[3.2, 4.5], [6.0, 10]]] },
  '!': { width: 3.5, strokes: [[[1.8, 0], [1.8, 7.0]], [[1.8, 9.2], [1.8, 10.0]]] },
};

function renderComicText(text, startX, startY, scale = 1.6) {
  const cmds = [];
  let cx = startX;
  for (const ch of text) {
    const glyph = GLYPHS[ch] || { width: 5.0, strokes: [] };
    for (const strokePts of glyph.strokes) {
      const scaled = strokePts.map(([gx, gy]) => [cx + gx * scale, startY + gy * scale]);
      const smoothed = handJitter(catmullRomSpline(scaled, 2), 0.25);
      cmds.push({
        type: 'stroke',
        layer: 'effects',
        brush: 'pencil',
        color: '#1e1611',
        size: 3.6,
        opacity: 0.95,
        points: smoothed
      });
    }
    cx += glyph.width * scale;
  }
  return cmds;
}

pass3Commands.push(...renderComicText("THWACK!", 320, 270, 1.8));

// Save pass files
fs.writeFileSync('artifacts/kirby-pass1-monferno.json', JSON.stringify(pass1Commands, null, 2));
fs.writeFileSync('artifacts/kirby-pass2-kirby.json', JSON.stringify(pass2Commands, null, 2));
fs.writeFileSync('artifacts/kirby-pass3-effects.json', JSON.stringify(pass3Commands, null, 2));

console.log("PASS 1 Monferno commands:", pass1Commands.length);
console.log("PASS 2 Kirby commands:", pass2Commands.length);
console.log("PASS 3 Effects commands:", pass3Commands.length);
console.log("TOTAL COMMANDS:", pass1Commands.length + pass2Commands.length + pass3Commands.length);
