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

// Spur removal
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

// Directional smooth tracing
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

// Start endpoints
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

// Start remaining
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

// Douglas-Peucker simplification to extract key control points
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

// Catmull-Rom spline interpolation for silky smooth pencil curves
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

// Organic hand jitter
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

// Convert chained strokes to smooth pencil lines
const rawSimplified = chained.map(s => rdp(s, 1.3)).filter(s => s.length >= 2);

// Classify strokes into layers
// Left trainer: Lucas (x: 50..420, y: 150..670)
// Right trainer: Roark (x: 550..920, y: 140..670)
// Arena: center monument (380..620, y < 350), floor arcs (y: 200..600, wide x), side pedestals
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

  // Wide arcs across arena floor
  if (width > 500 && avgY > 200) {
    arenaStrokes.push(pts);
  } else if (avgY < 320 && avgX > 380 && avgX < 620) {
    // Hexagon center monument
    arenaStrokes.push(pts);
  } else if (avgX < 240 && avgY < 360 && avgY < 250) {
    // Left crystal pedestal
    arenaStrokes.push(pts);
  } else if (avgX > 800 && avgY < 360) {
    // Right crystal pedestal
    arenaStrokes.push(pts);
  } else if (avgX < 450) {
    lucasStrokes.push(pts);
  } else {
    roarkStrokes.push(pts);
  }
}

console.log(`Classified: Arena=${arenaStrokes.length}, Lucas=${lucasStrokes.length}, Roark=${roarkStrokes.length}`);

// Sort strokes in human drawing order:
// Human draws:
// 1. Arena: top-down, center monument, then floor arcs
arenaStrokes.sort((a, b) => {
  const yA = Math.min(...a.map(p => p[1]));
  const yB = Math.min(...b.map(p => p[1]));
  return yA - yB;
});

// 2. Lucas: head/hair (top) -> face/glasses -> torso/hoodie -> backpack -> arms/fists -> pants -> boots -> rage mark
lucasStrokes.sort((a, b) => {
  const yA = Math.min(...a.map(p => p[1]));
  const yB = Math.min(...b.map(p => p[1]));
  return yA - yB;
});

// 3. Roark: hard hat (top) -> face/smirk -> t-shirt -> gesture arm -> pocket arm -> pants -> boots -> sparkle
roarkStrokes.sort((a, b) => {
  const yA = Math.min(...a.map(p => p[1]));
  const yB = Math.min(...b.map(p => p[1]));
  return yA - yB;
});

// Function to generate pencil strokes with natural pencil dynamics
function toPencilStrokes(strokeList, layer, baseColor = '#362d26', baseSize = 3.6, withReinforce = true) {
  const commands = [];
  for (const rawPts of strokeList) {
    const smoothPts = handJitter(catmullRomSpline(rawPts, 3), 0.22);
    // Main confident pencil stroke
    commands.push({
      type: 'stroke',
      layer,
      brush: 'pencil',
      color: baseColor,
      size: baseSize,
      opacity: 0.88,
      points: smoothPts
    });
    // For longer lines, add faint secondary sketchy pass (human sketch feel)
    if (withReinforce && smoothPts.length > 5) {
      const offsetPts = handJitter(smoothPts.map(([x, y]) => [x + 0.35, y + 0.3]), 0.35);
      commands.push({
        type: 'stroke',
        layer,
        brush: 'pencil',
        color: '#52453a',
        size: Math.max(1.8, baseSize * 0.65),
        opacity: 0.35,
        points: offsetPts
      });
    }
  }
  return commands;
}

// Diagonal graphite pencil hatching for shadows
function pencilHatch(layer, x1, y1, x2, y2, angleDeg = 48, spacing = 4.0, length = 11, { color = '#483c33', size = 1.8, opacity = 0.42 } = {}) {
  const commands = [];
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad) * length;
  const dy = Math.sin(rad) * length;
  const stepCount = Math.floor(Math.hypot(x2 - x1, y2 - y1) / spacing);
  for (let i = 0; i <= stepCount; i++) {
    const t = i / (stepCount || 1);
    const sx = x1 + (x2 - x1) * t;
    const sy = y1 + (y2 - y1) * t;
    const pts = handJitter([[sx, sy], [sx + dx, sy + dy]], 0.25);
    commands.push({ type: 'stroke', layer, brush: 'pencil', color, size, opacity, points: pts });
  }
  return commands;
}

// ==========================================
// PASS 1: Arena Architecture
// ==========================================
const pass1Commands = [
  { type: 'layer.add', id: 'arena', name: 'Arena Architecture' },
  ...toPencilStrokes(arenaStrokes, 'arena', '#42372f', 3.4, false),
  // Step riser pencil shading
  ...pencilHatch('arena', 20, 235, 255, 235, 50, 6, 8, { color: '#685c52', opacity: 0.35 }),
  ...pencilHatch('arena', 745, 235, 980, 235, 50, 6, 8, { color: '#685c52', opacity: 0.35 }),
  ...pencilHatch('arena', 446, 188, 554, 188, 60, 5, 8, { color: '#594d42', opacity: 0.38 })
];

// ==========================================
// PASS 2: Lucas & Roark Trainers
// ==========================================
const pass2Commands = [
  { type: 'layer.add', id: 'trainers', name: 'Trainers' },
  ...toPencilStrokes(lucasStrokes, 'trainers', '#2b231d', 3.6, true),
  // Lucas pencil hatching (shadows on hoodie, pants, boots, backpack)
  ...pencilHatch('trainers', 150, 480, 180, 530, 65, 4.5, 10, { color: '#382f28', opacity: 0.45 }),
  ...pencilHatch('trainers', 270, 480, 295, 530, 65, 4.5, 10, { color: '#382f28', opacity: 0.45 }),
  ...pencilHatch('trainers', 190, 298, 255, 298, 45, 4, 9, { color: '#382f28', opacity: 0.5 }),
  ...pencilHatch('trainers', 150, 340, 215, 340, 45, 4, 8, { color: '#382f28', opacity: 0.45 }),
  ...pencilHatch('trainers', 65, 660, 145, 660, 30, 4, 12, { color: '#453a32', opacity: 0.55 }),
  ...pencilHatch('trainers', 270, 658, 385, 658, 30, 4, 12, { color: '#453a32', opacity: 0.55 }),

  ...toPencilStrokes(roarkStrokes, 'trainers', '#2b231d', 3.6, true),
  // Roark pencil hatching (shadows under shirt, cargo pants, boots)
  ...pencilHatch('trainers', 720, 204, 760, 204, 45, 4.5, 10, { color: '#382f28', opacity: 0.45 }),
  ...pencilHatch('trainers', 690, 340, 755, 340, 55, 5, 10, { color: '#382f28', opacity: 0.42 }),
  ...pencilHatch('trainers', 625, 530, 650, 580, 65, 4.5, 11, { color: '#382f28', opacity: 0.45 }),
  ...pencilHatch('trainers', 740, 530, 770, 580, 65, 4.5, 11, { color: '#382f28', opacity: 0.45 }),
  ...pencilHatch('trainers', 580, 725, 630, 725, 30, 4, 12, { color: '#453a32', opacity: 0.55 }),
  ...pencilHatch('trainers', 675, 715, 725, 715, 30, 4, 12, { color: '#453a32', opacity: 0.55 })
];

// ==========================================
// PASS 3: Knocked-Out Monferno
// ==========================================
// Centered in gap between trainers: x: 440..560, y: 500..555
// Accurate Monferno anatomy: primate body, blue eye mask, red center dot,
// white neck ruff, flame crown tuft, X X eyes, curled flame tail, dizzy stars
const monfernoStrokes = [];

function addSpline(pts, color = '#2c221a', size = 3.4, opacity = 0.88) {
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
  // Faint sketchy companion stroke
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

// 1. Monferno Head & Primate Muzzle
addSpline([[456, 524], [460, 516], [472, 510], [486, 510], [496, 516], [500, 526]]); // Head dome
addSpline([[500, 526], [498, 534], [490, 538], [476, 540], [462, 538], [454, 532], [456, 524]]); // Jaw / chin slumped on floor
addSpline([[464, 536], [472, 533], [482, 533], [488, 536]]); // Muzzle line
addSpline([[474, 535], [472, 540], [478, 541], [480, 535]]); // Tongue sticking out lolling

// 2. Monferno Signature Flame Tuft on Head (Swirling Flame Crest)
addSpline([[472, 510], [468, 502], [464, 492], [468, 484], [476, 480], [482, 486], [480, 496], [484, 504], [486, 510]]); // Main flame swirl
addSpline([[476, 480], [474, 474], [478, 472], [480, 478]]); // Flame tip flick
addSpline([[468, 494], [472, 490], [476, 494]]); // Inner flame swirl

// 3. Large Primate Ears
addSpline([[458, 518], [448, 514], [442, 520], [446, 528], [456, 528]]); // Left ear
addSpline([[450, 518], [446, 522], [452, 526]]); // Left ear inner fold
addSpline([[498, 518], [508, 514], [514, 520], [510, 528], [498, 528]]); // Right ear
addSpline([[504, 518], [508, 522], [502, 526]]); // Right ear inner fold

// 4. Blue Eye Mask Marking & Red Center Brow Mark
addSpline([[462, 520], [472, 518], [480, 518], [490, 520], [488, 526], [480, 524], [472, 524], [464, 526], [462, 520]]); // Mask contour
addSpline([[475, 517], [478, 515], [480, 517], [478, 519], [475, 517]], '#82241d', 3.0); // Red brow mark

// 5. Knocked Out "X X" Eyes
addSpline([[466, 520], [472, 526]], '#18120e', 3.2); // Left X 1
addSpline([[472, 520], [466, 526]], '#18120e', 3.2); // Left X 2
addSpline([[482, 520], [488, 526]], '#18120e', 3.2); // Right X 1
addSpline([[488, 520], [482, 526]], '#18120e', 3.2); // Right X 2

// 6. Spiky White Neck Ruff / Collar
addSpline([[456, 536], [450, 542], [456, 544], [462, 542], [466, 546], [474, 543], [482, 546], [490, 542], [496, 545], [502, 538]]); // Ruff zigzag

// 7. Slumped Torso & Gold Shoulder Bands
addSpline([[464, 544], [458, 552], [462, 560], [480, 562], [504, 560], [520, 556], [526, 548], [512, 542]]); // Back / belly on floor
addSpline([[462, 546], [460, 552], [464, 556]]); // Gold band left
addSpline([[508, 544], [512, 550], [508, 556]]); // Gold band right

// 8. Limp Sprawled Primate Arms and Legs
addSpline([[458, 552], [446, 556], [434, 558], [428, 556], [426, 560], [434, 562], [448, 560]]); // Left arm sprawled
addSpline([[430, 557], [426, 558], [428, 561]]); // Finger ticks
addSpline([[516, 550], [526, 554], [538, 558], [544, 558], [542, 562], [534, 562], [522, 558]]); // Right arm sprawled
addSpline([[538, 558], [544, 560]]); // Finger tick
addSpline([[470, 562], [468, 568], [462, 572], [458, 572], [462, 568]]); // Limp foot left
addSpline([[500, 562], [504, 568], [512, 572], [516, 572], [510, 568]]); // Limp foot right

// 9. Signature Curled Tail with Red Base and Flaming Tip
addSpline([[526, 550], [538, 546], [550, 544], [560, 540], [564, 532], [560, 524], [550, 520], [542, 522], [538, 528], [542, 532]]); // Curled tail
addSpline([[528, 549], [536, 546], [540, 548]], '#82241d', 3.2); // Red tail base patch
// Flame on tail tip (active burning flame)
addSpline([[542, 530], [544, 524], [540, 516], [546, 508], [554, 514], [552, 524], [546, 530]], '#352518', 3.2); // Flame contour
addSpline([[546, 508], [548, 502], [550, 508]], '#352518', 2.8); // Flame crest
addSpline([[544, 520], [546, 514], [548, 520]], '#5a4638', 2.2); // Inner flame flick

// 10. Dizzy Stars / Spirals & Sweat Droplets
addSpline([[460, 480], [464, 474], [468, 480], [462, 477], [468, 476]], '#45382e', 2.4); // Dizzy star 1
addSpline([[486, 472], [490, 466], [494, 472], [488, 469], [494, 468]], '#45382e', 2.4); // Dizzy star 2
addSpline([[452, 502], [448, 498], [452, 494], [454, 498], [452, 502]], '#45382e', 2.2); // Sweat drop left
addSpline([[502, 502], [506, 498], [502, 494], [500, 498], [502, 502]], '#45382e', 2.2); // Sweat drop right

// Ground contact shadow under Monferno
const pass3Commands = [
  { type: 'layer.add', id: 'monferno', name: 'Knocked Out Monferno' },
  ...pencilHatch('monferno', 435, 564, 545, 564, 30, 3.5, 9, { color: '#453a32', opacity: 0.5 }),
  ...monfernoStrokes
];

// ==========================================
// PASS 4: Roark's Speech Bubble & Hand-Lettering
// ==========================================
// Pointer tail from Roark's mouth (x: 640, y: 250) leading up to comic bubble
// Box: x: 500..770, y: 75..190
// Text:
//   "I can SEE"
//   "the sweat pouring"
//   "out of your"
//   "pokeballs bro"
const bubbleCommands = [
  { type: 'layer.add', id: 'bubble', name: 'Speech Bubble' }
];

// Paper underlay fill so background lines don't collide with text
bubbleCommands.push({
  type: 'ellipse',
  layer: 'bubble',
  x: 500,
  y: 75,
  width: 270,
  height: 115,
  color: '#f7f3e8',
  opacity: 0.98
});

// Organic hand-drawn comic bubble contour
const bubbleBorderPts = [
  [510, 130], [502, 110], [512, 92], [535, 80], [580, 75], [650, 75],
  [720, 80], [755, 92], [768, 115], [765, 145], [745, 172], [700, 185],
  [650, 188], [630, 192],
  [646, 246], // Pointer tail to Roark's mouth
  [618, 192],
  [560, 188], [525, 175], [508, 155], [510, 130]
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
    points: handJitter(smoothBubble.map(([x, y]) => [x + 0.4, y + 0.3]), 0.35)
  }
);

// Hand-lettered comic font glyphs
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

function renderText(text, startX, startY, scale = 1.32) {
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

// 4 lines of hand-lettered comic text
bubbleCommands.push(
  ...renderText("I can SEE", 595, 92, 1.35),
  ...renderText("the sweat pouring", 552, 114, 1.30),
  ...renderText("out of your", 585, 136, 1.30),
  ...renderText("pokeballs bro", 572, 158, 1.30)
);

// Save passes
fs.writeFileSync('artifacts/tumblr-pass1-arena.json', JSON.stringify(pass1Commands, null, 2));
fs.writeFileSync('artifacts/tumblr-pass2-trainers.json', JSON.stringify(pass2Commands, null, 2));
fs.writeFileSync('artifacts/tumblr-pass3-monferno.json', JSON.stringify(pass3Commands, null, 2));
fs.writeFileSync('artifacts/tumblr-pass4-bubble.json', JSON.stringify(bubbleCommands, null, 2));

console.log(`PASS 1 Arena: ${pass1Commands.length} commands`);
console.log(`PASS 2 Trainers: ${pass2Commands.length} commands`);
console.log(`PASS 3 Monferno: ${pass3Commands.length} commands`);
console.log(`PASS 4 Bubble: ${bubbleCommands.length} commands`);
console.log(`TOTAL COMMANDS: ${pass1Commands.length + pass2Commands.length + pass3Commands.length + bubbleCommands.length}`);
