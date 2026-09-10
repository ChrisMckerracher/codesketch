import fs from 'node:fs';

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

const rawStrokes = JSON.parse(fs.readFileSync('artifacts/ash_vector_raw.json'));

const scale = 0.665;
const offsetX = 238;
const offsetY = 30;

function mapPt([rx, ry]) {
  return [
    Math.round((offsetX + (rx - 157) * scale) * 10) / 10,
    Math.round((offsetY + (ry - 62) * scale) * 10) / 10
  ];
}

const ashStrokes = [];
const pikachuStrokes = [];

for (const s of rawStrokes) {
  if (s.length < 2) continue;
  let avgX = 0, avgY = 0;
  for (const [x, y] of s) { avgX += x; avgY += y; }
  avgX /= s.length;
  avgY /= s.length;

  // Pikachu is on viewer's right shoulder:
  // Head & ears: x: 600..940, y: 120..500
  const isPikachu = (avgX >= 600 && avgY <= 500 && (avgX > 630 || avgY < 380));

  if (isPikachu) {
    pikachuStrokes.push(s);
  } else {
    ashStrokes.push(s);
  }
}

console.log(`Classified: Ash=${ashStrokes.length}, Pikachu=${pikachuStrokes.length}`);

// Sort in human drawing order (top to bottom)
ashStrokes.sort((a, b) => Math.min(...a.map(p => p[1])) - Math.min(...b.map(p => p[1])));
pikachuStrokes.sort((a, b) => Math.min(...a.map(p => p[1])) - Math.min(...b.map(p => p[1])));

function toPencilCommands(strokeList, layer, baseColor = '#28201a', baseSize = 3.6) {
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
    if (smooth.length > 5) {
      cmds.push({
        type: 'stroke',
        layer,
        brush: 'pencil',
        color: '#52453b',
        size: Math.max(1.8, baseSize * 0.65),
        opacity: 0.35,
        points: handJitter(smooth.map(([x, y]) => [x + 0.3, y + 0.25]), 0.28)
      });
    }
  }
  return cmds;
}

// PASS 1: Ash Ketchum
const pass1Commands = [
  { type: 'layer.add', id: 'ash', name: 'Ash Ketchum' },
  ...toPencilCommands(ashStrokes, 'ash', '#28201a', 3.6)
];

// PASS 2: Pikachu Partner
const pass2Commands = [
  { type: 'layer.add', id: 'pikachu', name: 'Pikachu Partner' },
  ...toPencilCommands(pikachuStrokes, 'pikachu', '#28201a', 3.6)
];

// PASS 3: Signature Accents & Details
// Green cap emblem, red Pikachu cheek circles
const pass3Commands = [
  { type: 'layer.add', id: 'accents', name: 'Signature Details' }
];

function addAccentSpline(pts, color = '#2e7d32', size = 3.4, opacity = 0.92) {
  const canvasPts = pts.map(mapPt);
  const smooth = handJitter(catmullRomSpline(canvasPts, 3), 0.2);
  pass3Commands.push({
    type: 'stroke',
    layer: 'accents',
    brush: 'pencil',
    color,
    size,
    opacity,
    points: smooth
  });
}

// Ash's Cap Visor Rim (classic green underside/stripe: raw x: 335..580, y: 200..245)
addAccentSpline([[340, 245], [390, 225], [450, 218], [510, 222], [575, 242]], '#2e7d32', 3.8);

// Pikachu's Rosy Red Cheeks (raw x: 650, y: 315 and raw x: 755, y: 345)
function addCheek(cx, cy, r) {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  addAccentSpline(pts, '#c62828', 3.2, 0.95);
  // Inner concentric spiral
  const inner = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    inner.push([cx + Math.cos(a) * (r * 0.5), cy + Math.sin(a) * (r * 0.5)]);
  }
  addAccentSpline(inner, '#c62828', 2.6, 0.8);
}
addCheek(652, 316, 12);
addCheek(758, 350, 12);

// Save pass files
fs.writeFileSync('artifacts/ash-pass1-ash.json', JSON.stringify(pass1Commands, null, 2));
fs.writeFileSync('artifacts/ash-pass2-pikachu.json', JSON.stringify(pass2Commands, null, 2));
fs.writeFileSync('artifacts/ash-pass3-accents.json', JSON.stringify(pass3Commands, null, 2));

console.log("PASS 1 Ash commands:", pass1Commands.length);
console.log("PASS 2 Pikachu commands:", pass2Commands.length);
console.log("PASS 3 Accents commands:", pass3Commands.length);
console.log("TOTAL COMMANDS:", pass1Commands.length + pass2Commands.length + pass3Commands.length);
