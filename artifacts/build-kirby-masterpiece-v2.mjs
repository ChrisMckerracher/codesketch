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

const scale = 0.91;
const offsetX = 92;
const offsetY = 75;

function mapPt([rx, ry], isKnife = false) {
  // Push knife a tad deeper: +15px in Y
  const dyExtra = isKnife ? 15 : 0;
  return [
    Math.round((offsetX + (rx - 59) * scale) * 10) / 10,
    Math.round((offsetY + (ry - 190) * scale + dyExtra) * 10) / 10
  ];
}

const monfernoRawStrokes = [];
const kirbyRawStrokes = [];
const knifeRawStrokes = [];

for (const stroke of rawStrokes) {
  if (stroke.length < 2) continue;
  let avgX = 0, avgY = 0;
  for (const [x, y] of stroke) { avgX += x; avgY += y; }
  avgX /= stroke.length;
  avgY /= stroke.length;

  const isTail = (avgX > 690 && avgY < 560) || (avgX > 740);
  const isKnife = (avgX >= 380 && avgX <= 445 && avgY >= 295 && avgY <= 510);
  const isKirbyBody = (avgX > 430 && avgX <= 710 && avgY >= 250 && avgY <= 525);

  if (isKnife) {
    knifeRawStrokes.push(stroke);
  } else if (isKirbyBody) {
    kirbyRawStrokes.push(stroke);
  } else {
    monfernoRawStrokes.push(stroke);
  }
}

// Sort in human drawing order
monfernoRawStrokes.sort((a, b) => Math.min(...a.map(p => p[1])) - Math.min(...b.map(p => p[1])));
kirbyRawStrokes.sort((a, b) => Math.min(...a.map(p => p[1])) - Math.min(...b.map(p => p[1])));
knifeRawStrokes.sort((a, b) => Math.min(...a.map(p => p[1])) - Math.min(...b.map(p => p[1])));

function toPencilCommands(strokeList, layer, baseColor = '#2b231d', baseSize = 3.6, isKnife = false) {
  const cmds = [];
  for (const raw of strokeList) {
    const canvasPts = raw.map(p => mapPt(p, isKnife));
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
  ...toPencilCommands(monfernoRawStrokes, 'monferno', '#2b231d', 3.6, false)
];

// PASS 2: Kirby & Deep Knife Plunge
const pass2Commands = [
  { type: 'layer.add', id: 'kirby', name: 'Kirby with Knife' },
  ...toPencilCommands(kirbyRawStrokes, 'kirby', '#261e19', 3.8, false),
  // Knife shifted deeper into Monferno (+15px Y)
  ...toPencilCommands(knifeRawStrokes, 'kirby', '#221914', 3.8, true)
];

// PASS 3: Blood & Meme Details (NO THWACK!)
const pass3Commands = [
  { type: 'layer.add', id: 'blood', name: 'Blood & Details' }
];

// Helper to add organic pencil blood strokes
function addBloodSpline(pts, color = '#8b1812', size = 3.4, opacity = 0.90) {
  const smooth = handJitter(catmullRomSpline(pts, 3), 0.22);
  pass3Commands.push({
    type: 'stroke',
    layer: 'blood',
    brush: 'pencil',
    color,
    size,
    opacity,
    points: smooth
  });
  // Faint dark crimson edge
  if (smooth.length > 4) {
    pass3Commands.push({
      type: 'stroke',
      layer: 'blood',
      brush: 'pencil',
      color: '#5a0d09',
      size: Math.max(1.6, size * 0.6),
      opacity: 0.45,
      points: handJitter(smooth.map(([x, y]) => [x + 0.25, y + 0.2]), 0.25)
    });
  }
}

// Blood trickles and spurts around the knife entry point (entry is at x: 440, y: 360)
// 1. Knife entry wound slit & pooling around blade
addBloodSpline([[425, 355], [435, 362], [445, 364], [455, 360]], '#7d140f', 4.0, 0.95);
addBloodSpline([[428, 358], [438, 366], [448, 367], [452, 363]], '#9e1a14', 3.5, 0.95);

// 2. Crimson blood trickling down Monferno back & fur
addBloodSpline([[438, 366], [436, 380], [439, 395], [437, 412], [442, 430]], '#8b1812', 3.4);
addBloodSpline([[445, 367], [449, 385], [452, 402], [448, 420], [450, 438]], '#8b1812', 3.2);
addBloodSpline([[442, 430], [440, 445], [444, 460], [441, 475]], '#7d140f', 3.0);

// 3. Blood dripping off the back onto the floor
addBloodSpline([[441, 475], [440, 490]], '#9e1a14', 3.2);
// Blood drip teardrops
addBloodSpline([[439, 495], [441, 498], [439, 502], [438, 498], [439, 495]], '#9e1a14', 2.8);
addBloodSpline([[449, 470], [451, 474], [449, 477], [448, 474], [449, 470]], '#9e1a14', 2.6);

// 4. Stylized pool of blood on the floor beneath Monferno
addBloodSpline([[415, 505], [428, 512], [445, 516], [465, 514], [480, 508], [472, 502], [450, 498], [430, 500], [415, 505]], '#7d140f', 3.8);
addBloodSpline([[422, 507], [438, 512], [455, 513], [470, 508]], '#9e1a14', 3.2);

// 5. Blood spurting out of the wound (comic pressure jets away from blade)
addBloodSpline([[432, 356], [420, 342], [406, 332], [392, 328], [382, 330]], '#a01a12', 3.4, 0.95);
addBloodSpline([[430, 362], [416, 360], [404, 364], [396, 370]], '#a01a12', 2.8, 0.95);
addBloodSpline([[440, 352], [443, 340], [450, 330], [459, 324]], '#8b1812', 2.6, 0.9);
// Spurt tip droplets
addBloodSpline([[376, 331], [373, 328], [376, 325], [379, 328], [376, 331]], '#9e1a14', 2.4);
addBloodSpline([[391, 373], [388, 371], [390, 368], [393, 370], [391, 373]], '#9e1a14', 2.2);
addBloodSpline([[463, 321], [466, 318], [469, 321], [466, 324], [463, 321]], '#9e1a14', 2.2);

// 6. Comic blood splatter drops / droplets
addBloodSpline([[418, 342], [415, 338], [418, 335], [420, 338], [418, 342]], '#9e1a14', 2.6);
addBloodSpline([[460, 348], [464, 344], [467, 348], [464, 351], [460, 348]], '#9e1a14', 2.6);
addBloodSpline([[405, 365], [402, 362], [405, 359], [407, 362], [405, 365]], '#9e1a14', 2.4);

// Subtle floor contact shadow beneath Monferno
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
      layer: 'blood',
      brush: 'pencil',
      color: '#55483d',
      size: 1.8,
      opacity: 0.45,
      points: pts
    });
  }
}
addShadow(140, 600, 480, 600, 25, 6, 10);
addShadow(500, 620, 850, 620, 25, 6, 10);

// Save passes to files
fs.writeFileSync('artifacts/kirby-v2-pass1-monferno.json', JSON.stringify(pass1Commands, null, 2));
fs.writeFileSync('artifacts/kirby-v2-pass2-kirby.json', JSON.stringify(pass2Commands, null, 2));
fs.writeFileSync('artifacts/kirby-v2-pass3-blood.json', JSON.stringify(pass3Commands, null, 2));

console.log("PASS 1 Monferno commands:", pass1Commands.length);
console.log("PASS 2 Kirby & Knife commands:", pass2Commands.length);
console.log("PASS 3 Blood commands:", pass3Commands.length);
console.log("TOTAL COMMANDS:", pass1Commands.length + pass2Commands.length + pass3Commands.length);
