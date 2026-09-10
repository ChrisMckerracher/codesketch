import fs from 'node:fs';
import { execSync } from 'node:child_process';

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

// PASS 1: Arena Architecture
const pass1Commands = JSON.parse(fs.readFileSync('artifacts/tumblr-pass1-arena.json'));

// PASS 2: Trainers (Lucas & Roark)
const pass2Commands = JSON.parse(fs.readFileSync('artifacts/tumblr-pass2-trainers.json'));

// PASS 3: Accurate Monferno (mapped to exact green smudge: x: 512..647, y: 345..458)
const rawMonfernoStrokes = JSON.parse(fs.readFileSync('artifacts/monferno_vector_raw.json'));
const pass3Commands = [
  { type: 'layer.add', id: 'monferno', name: 'Knocked Out Monferno' }
];

const scale = 0.134;
const offsetX = 512;
const offsetY = 346;

for (const rawStroke of rawMonfernoStrokes) {
  if (rawStroke.length < 2) continue;
  // Map points to canvas coordinates
  const canvasPts = rawStroke.map(([rx, ry]) => [
    Math.round((offsetX + (rx - 11) * scale) * 10) / 10,
    Math.round((offsetY + (ry - 99) * scale) * 10) / 10
  ]);

  const smoothPts = handJitter(catmullRomSpline(canvasPts, 3), 0.20);
  pass3Commands.push({
    type: 'stroke',
    layer: 'monferno',
    brush: 'pencil',
    color: '#2b231d',
    size: 3.4,
    opacity: 0.90,
    points: smoothPts
  });

  // Faint companion sketch stroke for longer contours
  if (smoothPts.length > 5) {
    pass3Commands.push({
      type: 'stroke',
      layer: 'monferno',
      brush: 'pencil',
      color: '#55463b',
      size: 2.1,
      opacity: 0.35,
      points: handJitter(smoothPts.map(([x, y]) => [x + 0.3, y + 0.25]), 0.28)
    });
  }
}

// Dizzy stars & sweat drops above Monferno head (head is around x: 540..570, y: 360..390)
function addEffectSpline(pts, color = '#45382e', size = 2.4) {
  const smooth = handJitter(catmullRomSpline(pts, 2), 0.2);
  pass3Commands.push({
    type: 'stroke',
    layer: 'monferno',
    brush: 'pencil',
    color,
    size,
    opacity: 0.85,
    points: smooth
  });
}
// Dizzy star 1
addEffectSpline([[536, 345], [540, 338], [544, 345], [536, 341], [544, 341]]);
// Dizzy star 2
addEffectSpline([[556, 350], [560, 343], [564, 350], [556, 346], [564, 346]]);
// Sweat droplet 1
addEffectSpline([[528, 360], [524, 355], [528, 350], [531, 355], [528, 360]]);
// Sweat droplet 2
addEffectSpline([[570, 358], [574, 353], [570, 348], [567, 353], [570, 358]]);

// PASS 4: Speech Bubble
// Located in upper center-left as user indicated in green (x: 430..600, y: 70..190)
// Tail points from [570, 195] down-right directly to Roark's mouth at [645, 248]!
const pass4Commands = [
  { type: 'layer.add', id: 'bubble', name: 'Speech Bubble' },
  // Paper underlay fill to hide background architecture
  {
    type: 'ellipse',
    layer: 'bubble',
    x: 425,
    y: 70,
    width: 200,
    height: 135,
    color: '#f7f3e8',
    opacity: 0.98
  }
];

const bubbleContour = [
  [435, 130], [428, 105], [442, 85], [475, 75], [525, 72], [570, 76],
  [598, 92], [608, 115], [605, 142], [590, 168], [568, 185],
  // Tail pointing to Roark's mouth at [645, 248]!
  [582, 195],
  [612, 222],
  [645, 248], // Exactly at Roark's smirk!
  [608, 228],
  [565, 202],
  [540, 195],
  [495, 195], [455, 182], [436, 160], [435, 130]
];

const smoothBubble = handJitter(catmullRomSpline(bubbleContour, 3), 0.28);
pass4Commands.push(
  {
    type: 'stroke',
    layer: 'bubble',
    brush: 'pencil',
    color: '#261e19',
    size: 3.6,
    opacity: 0.92,
    points: smoothBubble
  },
  {
    type: 'stroke',
    layer: 'bubble',
    brush: 'pencil',
    color: '#55463b',
    size: 2.2,
    opacity: 0.4,
    points: handJitter(smoothBubble.map(([x, y]) => [x + 0.35, y + 0.3]), 0.35)
  }
);

// Comic hand-lettering
const GLYPHS = {
  ' ': { width: 5.0, strokes: [] },
  'I': { width: 4.8, strokes: [[[2.4, 0], [2.4, 9]], [[0.8, 0], [4.0, 0]], [[0.8, 9], [4.0, 9]]] },
  'S': { width: 6.5, strokes: [[[5.8, 1.5], [3.8, 0], [1.5, 1.5], [2.2, 4.2], [5.5, 5.8], [5.2, 9], [1.2, 8.5]]] },
  'E': { width: 5.8, strokes: [[[1.2, 0], [1.2, 9]], [[1.2, 0], [5.4, 0]], [[1.2, 4.5], [4.2, 4.5]], [[1.2, 9], [5.4, 9]]] },
  'c': { width: 5.5, strokes: [[[5.0, 4.5], [3.2, 3.8], [1.2, 6.0], [3.2, 9.0], [5.0, 8.2]]] },
  'a': { width: 5.8, strokes: [[[5.0, 4.5], [3.0, 3.8], [1.2, 6.0], [3.0, 9.0], [5.0, 8.2]], [[5.0, 3.8], [5.0, 9.0]]] },
  'n': { width: 5.8, strokes: [[[1.2, 3.8], [1.2, 9.0]], [[1.2, 5.2], [3.2, 3.8], [5.0, 4.8], [5.0, 9.0]]] },
  't': { width: 4.5, strokes: [[[2.4, 1.2], [2.4, 8.2], [4.0, 9.0]], [[0.8, 3.8], [4.2, 3.8]]] },
  'h': { width: 5.8, strokes: [[[1.2, 0.0], [1.2, 9.0]], [[1.2, 5.2], [3.2, 3.8], [5.0, 4.8], [5.0, 9.0]]] },
  'e': { width: 5.8, strokes: [[[1.2, 6.0], [5.2, 6.0], [4.5, 3.8], [3.0, 3.8], [1.2, 6.0], [3.0, 9.0], [5.2, 8.2]]] },
  's': { width: 5.2, strokes: [[[4.8, 4.5], [3.0, 3.8], [1.2, 4.8], [4.2, 6.2], [4.8, 7.8], [2.8, 9.0], [1.0, 8.0]]] },
  'w': { width: 8.2, strokes: [[[1.0, 3.8], [2.4, 9.0], [4.2, 5.5], [5.8, 9.0], [7.5, 3.8]]] },
  'p': { width: 5.8, strokes: [[[1.2, 3.8], [1.2, 12.0]], [[1.2, 4.5], [3.5, 3.8], [5.2, 5.5], [3.8, 8.2], [1.2, 7.8]]] },
  'o': { width: 5.8, strokes: [[[3.2, 3.8], [1.2, 6.0], [3.2, 9.0], [5.2, 6.0], [3.2, 3.8]]] },
  'u': { width: 5.8, strokes: [[[1.2, 3.8], [1.2, 7.8], [3.2, 9.0], [5.2, 7.8], [5.2, 3.8]], [[5.2, 5.0], [5.2, 9.0]]] },
  'r': { width: 4.8, strokes: [[[1.2, 3.8], [1.2, 9.0]], [[1.2, 5.2], [3.0, 3.8], [4.5, 4.5]]] },
  'i': { width: 3.0, strokes: [[[1.5, 3.8], [1.5, 9.0]], [[1.5, 1.4], [1.5, 2.0]]] },
  'g': { width: 5.8, strokes: [[[5.0, 4.5], [3.0, 3.8], [1.2, 6.0], [3.0, 8.2], [5.0, 7.8]], [[5.0, 3.8], [5.0, 10.5], [3.2, 12.0], [1.5, 11.0]]] },
  'f': { width: 4.8, strokes: [[[4.2, 0.6], [3.0, 0.0], [1.8, 1.6], [1.8, 9.0]], [[0.8, 3.8], [4.0, 3.8]]] },
  'y': { width: 5.6, strokes: [[[1.2, 3.8], [3.2, 8.2]], [[4.8, 3.8], [3.2, 8.2], [1.8, 12.0]]] },
  'k': { width: 5.8, strokes: [[[1.2, 0.0], [1.2, 9.0]], [[4.8, 3.8], [1.2, 6.0]], [[2.8, 5.5], [5.2, 9.0]]] },
  'b': { width: 5.8, strokes: [[[1.2, 0.0], [1.2, 9.0]], [[1.2, 5.0], [3.5, 3.8], [5.2, 6.0], [3.5, 8.8], [1.2, 9.0]]] },
  'l': { width: 3.5, strokes: [[[1.8, 0.0], [1.8, 8.2], [3.2, 9.0]]] },
};

function renderText(text, startX, startY, scale = 1.25) {
  const cmds = [];
  let cx = startX;
  for (const ch of text) {
    const glyph = GLYPHS[ch] || { width: 5.0, strokes: [] };
    for (const strokePts of glyph.strokes) {
      const scaled = strokePts.map(([gx, gy]) => [cx + gx * scale, startY + gy * scale]);
      const smoothed = handJitter(catmullRomSpline(scaled, 2), 0.25);
      cmds.push({
        type: 'stroke',
        layer: 'bubble',
        brush: 'pencil',
        color: '#211a15',
        size: 3.2,
        opacity: 0.94,
        points: smoothed
      });
    }
    cx += glyph.width * scale;
  }
  return cmds;
}

pass4Commands.push(
  ...renderText("I can SEE", 488, 92, 1.25),
  ...renderText("the sweat pouring", 450, 113, 1.20),
  ...renderText("out of your", 478, 134, 1.20),
  ...renderText("pokeballs bro", 468, 155, 1.20)
);

// Save passes to files
fs.writeFileSync('artifacts/tumblr-pass1-arena.json', JSON.stringify(pass1Commands, null, 2));
fs.writeFileSync('artifacts/tumblr-pass2-trainers.json', JSON.stringify(pass2Commands, null, 2));
fs.writeFileSync('artifacts/tumblr-pass3-monferno.json', JSON.stringify(pass3Commands, null, 2));
fs.writeFileSync('artifacts/tumblr-pass4-bubble.json', JSON.stringify(pass4Commands, null, 2));

console.log("PASS 1 Arena commands:", pass1Commands.length);
console.log("PASS 2 Trainers commands:", pass2Commands.length);
console.log("PASS 3 Monferno commands:", pass3Commands.length);
console.log("PASS 4 Bubble commands:", pass4Commands.length);
console.log("TOTAL COMMANDS:", pass1Commands.length + pass2Commands.length + pass3Commands.length + pass4Commands.length);
