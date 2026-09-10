import fs from 'node:fs';

// 1. Read start_lol PGM
const buf = fs.readFileSync("artifacts/start_lol_1000x700.pgm");
let headerEnd = 0, newlines = 0;
for (let i = 0; i < 100; i++) {
  if (buf[i] === 10) {
    newlines++;
    if (newlines === 3) { headerEnd = i + 1; break; }
  }
}
const W = 1000, H = 700;
const raw = buf.subarray(headerEnd);
const grid = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) {
  grid[i] = raw[i] < 172 ? 1 : 0;
}

// Zhang-Suen thinning
let changed = true;
const toZero = [];
let iter = 0;
while (changed && iter < 100) {
  changed = false;
  iter++;
  for (let y = 1; y < H - 1; y++) {
    const row = y * W;
    for (let x = 1; x < W - 1; x++) {
      const idx = row + x;
      if (grid[idx] === 0) continue;
      const p2 = grid[idx - W], p3 = grid[idx - W + 1], p4 = grid[idx + 1], p5 = grid[idx + W + 1];
      const p6 = grid[idx + W], p7 = grid[idx + W - 1], p8 = grid[idx - 1], p9 = grid[idx - W - 1];
      const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
      if (B < 2 || B > 6) continue;
      let A = 0;
      if (p2 === 0 && p3 === 1) A++;
      if (p3 === 0 && p4 === 1) A++;
      if (p4 === 0 && p5 === 1) A++;
      if (p5 === 0 && p6 === 1) A++;
      if (p6 === 0 && p7 === 1) A++;
      if (p7 === 0 && p8 === 1) A++;
      if (p8 === 0 && p9 === 1) A++;
      if (p9 === 0 && p2 === 1) A++;
      if (A !== 1) continue;
      if (p2 * p4 * p6 !== 0) continue;
      if (p4 * p6 * p8 !== 0) continue;
      toZero.push(idx);
    }
  }
  for (const idx of toZero) grid[idx] = 0;
  toZero.length = 0;

  for (let y = 1; y < H - 1; y++) {
    const row = y * W;
    for (let x = 1; x < W - 1; x++) {
      const idx = row + x;
      if (grid[idx] === 0) continue;
      const p2 = grid[idx - W], p3 = grid[idx - W + 1], p4 = grid[idx + 1], p5 = grid[idx + W + 1];
      const p6 = grid[idx + W], p7 = grid[idx + W - 1], p8 = grid[idx - 1], p9 = grid[idx - W - 1];
      const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
      if (B < 2 || B > 6) continue;
      let A = 0;
      if (p2 === 0 && p3 === 1) A++;
      if (p3 === 0 && p4 === 1) A++;
      if (p4 === 0 && p5 === 1) A++;
      if (p5 === 0 && p6 === 1) A++;
      if (p6 === 0 && p7 === 1) A++;
      if (p7 === 0 && p8 === 1) A++;
      if (p8 === 0 && p9 === 1) A++;
      if (p9 === 0 && p2 === 1) A++;
      if (A !== 1) continue;
      if (p2 * p4 * p8 !== 0) continue;
      if (p2 * p6 * p8 !== 0) continue;
      toZero.push(idx);
    }
  }
  for (const idx of toZero) grid[idx] = 0;
  toZero.length = 0;
}

// Clean spurs
for (let y = 1; y < H - 1; y++) {
  for (let x = 1; x < W - 1; x++) {
    const idx = y * W + x;
    if (grid[idx] === 0) continue;
    let nCount = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (grid[(y + dy) * W + (x + dx)] === 1) nCount++;
      }
    }
    if (nCount === 0) grid[idx] = 0;
  }
}

// Directional tracing
const visited = new Uint8Array(W * H);
const rawStrokes = [];

function traceSmoothPath(startIdx) {
  const path = [startIdx];
  visited[startIdx] = 1;
  let cur = startIdx;
  let prev = -1;

  while (true) {
    const cx = cur % W, cy = Math.floor(cur / W);
    let bestN = -1, bestScore = -Infinity;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
        const nIdx = ny * W + nx;
        if (grid[nIdx] !== 1 || visited[nIdx] === 1) continue;

        let score = 10;
        if (prev !== -1) {
          const px = prev % W, py = Math.floor(prev / W);
          const v1x = cx - px, v1y = cy - py;
          const v2x = nx - cx, v2y = ny - cy;
          const dot = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1);
          score += dot * 5;
        }
        if (score > bestScore) {
          bestScore = score;
          bestN = nIdx;
        }
      }
    }

    if (bestN === -1) break;
    visited[bestN] = 1;
    path.push(bestN);
    prev = cur;
    cur = bestN;
  }
  return path;
}

for (let i = 0; i < W * H; i++) {
  if (grid[i] === 1 && !visited[i]) {
    const cx = i % W, cy = Math.floor(i / W);
    let deg = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && nx < W && ny >= 0 && ny < H && grid[ny * W + nx] === 1) deg++;
      }
    }
    if (deg === 1) {
      const p = traceSmoothPath(i);
      if (p.length >= 3) rawStrokes.push(p);
    }
  }
}
for (let i = 0; i < W * H; i++) {
  if (grid[i] === 1 && !visited[i]) {
    const p = traceSmoothPath(i);
    if (p.length >= 3) rawStrokes.push(p);
  }
}

// Chain adjacent strokes
const pointStrokes = rawStrokes.map(s => s.map(idx => [idx % W, Math.floor(idx / W)]));
function dist(p1, p2) { return Math.hypot(p1[0] - p2[0], p1[1] - p2[1]); }

const chained = [];
const used = new Set();
for (let i = 0; i < pointStrokes.length; i++) {
  if (used.has(i)) continue;
  let cur = [...pointStrokes[i]];
  used.add(i);

  let merged = true;
  while (merged) {
    merged = false;
    const endPt = cur[cur.length - 1];
    let bestJ = -1, bestDist = 5.0;
    for (let j = 0; j < pointStrokes.length; j++) {
      if (used.has(j)) continue;
      const other = pointStrokes[j];
      const dStart = dist(endPt, other[0]);
      if (dStart < bestDist) {
        bestDist = dStart;
        bestJ = j;
      }
    }
    if (bestJ !== -1) {
      used.add(bestJ);
      cur = cur.concat(pointStrokes[bestJ]);
      merged = true;
    }
  }
  chained.push(cur);
}

function rdp(pts, epsilon) {
  if (pts.length <= 2) return pts;
  let dmax = 0, index = 0;
  const [x1, y1] = pts[0];
  const [x2, y2] = pts[pts.length - 1];
  const dx = x2 - x1, dy = y2 - y1;
  const norm = Math.hypot(dx, dy);
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const d = norm === 0 ? Math.hypot(x - x1, y - y1) : Math.abs(dy * x - dx * y + x2 * y1 - y2 * x1) / norm;
    if (d > dmax) { dmax = d; index = i; }
  }
  if (dmax > epsilon) {
    const r1 = rdp(pts.slice(0, index + 1), epsilon);
    const r2 = rdp(pts.slice(index), epsilon);
    return [...r1.slice(0, -1), ...r2];
  }
  return [pts[0], pts[pts.length - 1]];
}

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

function handJitter(pts, intensity = 0.25) {
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

const rawSimplified = chained.map(s => rdp(s, 1.3)).filter(s => s.length >= 2);

const arenaStrokes = [];
const lucasStrokes = [];
const roarkStrokes = [];

for (const pts of rawSimplified) {
  let avgX = 0, avgY = 0;
  for (const [x, y] of pts) { avgX += x; avgY += y; }
  avgX /= pts.length;
  avgY /= pts.length;

  const minX = Math.min(...pts.map(p => p[0]));
  const maxX = Math.max(...pts.map(p => p[0]));
  const width = maxX - minX;

  if (width > 500 && avgY > 200) {
    arenaStrokes.push(pts);
  } else if (avgY < 320 && avgX > 380 && avgX < 620) {
    arenaStrokes.push(pts);
  } else if (avgX < 240 && avgY < 360 && avgY < 250) {
    arenaStrokes.push(pts);
  } else if (avgX > 800 && avgY < 360) {
    arenaStrokes.push(pts);
  } else if (avgX < 450) {
    lucasStrokes.push(pts);
  } else {
    roarkStrokes.push(pts);
  }
}

// Human drawing order
arenaStrokes.sort((a, b) => Math.min(...a.map(p => p[1])) - Math.min(...b.map(p => p[1])));
lucasStrokes.sort((a, b) => Math.min(...a.map(p => p[1])) - Math.min(...b.map(p => p[1])));
roarkStrokes.sort((a, b) => Math.min(...a.map(p => p[1])) - Math.min(...b.map(p => p[1])));

function toPencilStrokes(strokeList, layer, baseColor = '#342c25', baseSize = 3.6, withReinforce = true) {
  const commands = [];
  for (const rawPts of strokeList) {
    const smoothPts = handJitter(catmullRomSpline(rawPts, 3), 0.22);
    commands.push({
      type: 'stroke',
      layer,
      brush: 'pencil',
      color: baseColor,
      size: baseSize,
      opacity: 0.90,
      points: smoothPts
    });
    if (withReinforce && smoothPts.length > 5) {
      const offsetPts = handJitter(smoothPts.map(([x, y]) => [x + 0.35, y + 0.3]), 0.35);
      commands.push({
        type: 'stroke',
        layer,
        brush: 'pencil',
        color: '#55483d',
        size: Math.max(1.8, baseSize * 0.65),
        opacity: 0.35,
        points: offsetPts
      });
    }
  }
  return commands;
}

// PASS 1: Arena (NO HATCHING STRIPES!)
const pass1Commands = [
  { type: 'layer.add', id: 'arena', name: 'Arena Architecture' },
  ...toPencilStrokes(arenaStrokes, 'arena', '#443931', 3.4, false)
];

// PASS 2: Trainers (Lucas & Roark - NO HATCHING STRIPES!)
const pass2Commands = [
  { type: 'layer.add', id: 'trainers', name: 'Trainers' },
  ...toPencilStrokes(lucasStrokes, 'trainers', '#2b231d', 3.6, true),
  ...toPencilStrokes(roarkStrokes, 'trainers', '#2b231d', 3.6, true)
];

// PASS 3: Knocked Out Monferno
// LOCATED EXACTLY WHERE THE USER SMUDGED GREEN:
// x: 540..645, y: 360..440 (on the arena step behind Roark!)
const monfernoStrokes = [];
function addMonfernoSpline(pts, color = '#2b221a', size = 3.4, opacity = 0.90) {
  const smooth = handJitter(catmullRomSpline(pts, 3), 0.25);
  monfernoStrokes.push({
    type: 'stroke',
    layer: 'monferno',
    brush: 'pencil',
    color,
    size,
    opacity,
    points: smooth
  });
  if (smooth.length > 4) {
    monfernoStrokes.push({
      type: 'stroke',
      layer: 'monferno',
      brush: 'pencil',
      color: '#55463b',
      size: size * 0.65,
      opacity: 0.35,
      points: handJitter(smooth.map(([x, y]) => [x + 0.3, y + 0.25]), 0.3)
    });
  }
}

// Monferno Head: Slumped face-down/side on step (x: 550, y: 400)
// 1. Curved head crest / flame-tuft peak sweeping back/up
addMonfernoSpline([[562, 388], [554, 376], [546, 366], [542, 360], [548, 360], [556, 370], [562, 382]]);
// 2. Head dome
addMonfernoSpline([[548, 392], [552, 382], [562, 380], [572, 382], [580, 390], [582, 400]]);
// 3. Muzzle / jaw resting on stone step
addMonfernoSpline([[582, 400], [578, 410], [568, 414], [556, 412], [548, 404], [548, 392]]);
// Muzzle mouth line with sharp canine tooth and tongue lolling
addMonfernoSpline([[558, 406], [568, 406], [576, 404]]);
addMonfernoSpline([[564, 406], [563, 410], [567, 406]]); // Sharp tooth
addMonfernoSpline([[568, 406], [570, 412], [575, 411], [574, 405]]); // Tongue

// 4. Large round ears with inner C-cartilage
addMonfernoSpline([[548, 388], [538, 382], [532, 388], [534, 398], [546, 400]]); // Left ear
addMonfernoSpline([[540, 388], [536, 392], [542, 396]]); // Inner fold
addMonfernoSpline([[578, 384], [586, 380], [592, 386], [590, 394], [582, 396]]); // Right ear
addMonfernoSpline([[584, 384], [588, 388], [584, 392]]); // Inner fold

// 5. Distinctive blue eye mask & red nose/forehead bridge
addMonfernoSpline([[552, 390], [562, 388], [570, 388], [578, 392], [574, 398], [566, 396], [558, 398], [552, 390]]); // Blue mask
addMonfernoSpline([[564, 388], [566, 394], [568, 388]], '#7a221a', 3.2); // Red center bridge

// 6. Knocked out "X X" eyes
addMonfernoSpline([[556, 392], [562, 398]], '#1a1410', 3.4);
addMonfernoSpline([[562, 392], [556, 398]], '#1a1410', 3.4);
addMonfernoSpline([[570, 392], [576, 398]], '#1a1410', 3.4);
addMonfernoSpline([[576, 392], [570, 398]], '#1a1410', 3.4);

// 7. Spiky white collar / neck ruff
addMonfernoSpline([[550, 406], [546, 412], [552, 416], [558, 414], [564, 420], [572, 416], [580, 420], [586, 414], [592, 418], [594, 410]]);

// 8. Slumped primate torso on step
addMonfernoSpline([[574, 414], [585, 418], [600, 420], [614, 418], [622, 412], [620, 404], [605, 402], [592, 404]]);
// Tan belly patch line & curl
addMonfernoSpline([[586, 414], [595, 416], [606, 414]]);
addMonfernoSpline([[596, 410], [598, 408], [600, 410]]); // Belly swirl

// 9. Limp sprawled arms with yellow shoulder/bicep band
addMonfernoSpline([[580, 414], [576, 422], [568, 428], [558, 430], [552, 428]]); // Left arm
addMonfernoSpline([[574, 418], [571, 422], [574, 425]]); // Yellow arm band
// 5 limp fingers
addMonfernoSpline([[554, 428], [548, 429], [546, 432]]);
addMonfernoSpline([[552, 430], [547, 433]]);
addMonfernoSpline([[553, 431], [549, 435]]);

// Right arm sprawled backwards
addMonfernoSpline([[610, 404], [618, 400], [626, 398], [632, 400]]);
addMonfernoSpline([[616, 402], [617, 399]]); // Yellow band

// 10. Limp hind legs sprawled
addMonfernoSpline([[614, 418], [622, 424], [630, 426], [636, 424]]); // Leg
addMonfernoSpline([[634, 424], [638, 422], [642, 425]]); // 3 monkey toes

// 11. Long curled monkey tail with red base and burning flame tip
addMonfernoSpline([[622, 410], [630, 406], [638, 398], [644, 386], [642, 374], [634, 368], [624, 372], [620, 380], [624, 386]]);
// Red tail base patch
addMonfernoSpline([[624, 409], [628, 407], [632, 409]], '#7a221a', 3.2);
// Flame on tail tip (jagged Fire-type flame)
addMonfernoSpline([[624, 386], [622, 380], [616, 372], [620, 362], [628, 366], [628, 376], [624, 386]], '#362418', 3.2);
addMonfernoSpline([[620, 362], [622, 354], [625, 362]], '#362418', 2.8); // Flame spike
addMonfernoSpline([[621, 374], [624, 370], [625, 375]], '#5c4332', 2.2); // Inner flame flick

// 12. Dizzy stars & sweat droplets over head
addMonfernoSpline([[546, 352], [550, 346], [554, 352], [548, 349], [554, 348]], '#45382e', 2.4); // Star 1
addMonfernoSpline([[568, 356], [572, 350], [576, 356], [570, 353], [576, 352]], '#45382e', 2.4); // Star 2
addMonfernoSpline([[540, 370], [536, 366], [540, 362], [542, 366], [540, 370]], '#45382e', 2.2); // Sweat drop

const pass3Commands = [
  { type: 'layer.add', id: 'monferno', name: 'Knocked Out Monferno' },
  ...monfernoStrokes
];

// PASS 4: Speech Bubble
// POSITIONED IN UPPER RIGHT: x: 670..920, y: 55..180
// COMPLETELY CLEAR OF ROARK'S FACE (Roark is at x: 580..660, y: 180..260)!
// Tail points from [685, 170] down to Roark's mouth at [635, 240]!
const bubbleCommands = [
  { type: 'layer.add', id: 'bubble', name: 'Speech Bubble' },
  // Paper underlay fill to occlude background lines
  {
    type: 'ellipse',
    layer: 'bubble',
    x: 670,
    y: 55,
    width: 250,
    height: 125,
    color: '#f7f3e8',
    opacity: 0.98
  }
];

// Organic comic bubble outline
const bubbleBorderPts = [
  [680, 115], [674, 90], [690, 70], [725, 58], [785, 55], [845, 58],
  [895, 72], [920, 95], [918, 130], [895, 155], [845, 172], [775, 175],
  [725, 172],
  [695, 170], // Pointer tail start
  [665, 205],
  [635, 240], // Pointer tip at Roark's mouth!
  [658, 200],
  [685, 168],
  [678, 140], [680, 115]
];

const smoothBubble = handJitter(catmullRomSpline(bubbleBorderPts, 3), 0.3);
bubbleCommands.push(
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

bubbleCommands.push(
  ...renderText("I can SEE", 755, 75, 1.28),
  ...renderText("the sweat pouring", 715, 96, 1.22),
  ...renderText("out of your", 745, 117, 1.22),
  ...renderText("pokeballs bro", 735, 138, 1.22)
);

// Save passes
fs.writeFileSync('artifacts/tumblr-pass1-arena.json', JSON.stringify(pass1Commands, null, 2));
fs.writeFileSync('artifacts/tumblr-pass2-trainers.json', JSON.stringify(pass2Commands, null, 2));
fs.writeFileSync('artifacts/tumblr-pass3-monferno.json', JSON.stringify(pass3Commands, null, 2));
fs.writeFileSync('artifacts/tumblr-pass4-bubble.json', JSON.stringify(bubbleCommands, null, 2));

console.log("PASS 1 Arena:", pass1Commands.length);
console.log("PASS 2 Trainers:", pass2Commands.length);
console.log("PASS 3 Monferno:", pass3Commands.length);
console.log("PASS 4 Bubble:", bubbleCommands.length);
console.log("TOTAL:", pass1Commands.length + pass2Commands.length + pass3Commands.length + bubbleCommands.length);
