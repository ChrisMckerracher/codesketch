import fs from 'node:fs';

// 1. Load authentic Pass 1 (Arena) and Pass 2 (Trainers) from project artifacts
const pass1 = JSON.parse(fs.readFileSync('artifacts/tumblr-pass1-arena.json', 'utf8'));
const pass2 = JSON.parse(fs.readFileSync('artifacts/tumblr-pass2-trainers.json', 'utf8'));

// Smooth Catmull-Rom spline with human hand jitter for authentic pencil feel
function catmullRomSpline(ctrlPoints, pointsPerSegment = 4) {
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

function handJitter(pts, intensity = 0.20) {
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

function pencilHatch(layer, x1, y1, x2, y2, angleDeg = 30, spacing = 3.8, length = 9, { color = '#453a32', size = 1.8, opacity = 0.45 } = {}) {
  const commands = [];
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad) * length;
  const dy = Math.sin(rad) * length;
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.floor(dist / spacing);
  for (let i = 0; i <= steps; i++) {
    const t = i / (steps || 1);
    const sx = x1 + (x2 - x1) * t;
    const sy = y1 + (y2 - y1) * t;
    commands.push({
      type: 'stroke',
      layer,
      brush: 'pencil',
      color,
      size,
      opacity,
      points: [[Math.round(sx * 10) / 10, Math.round(sy * 10) / 10], [Math.round((sx + dx) * 10) / 10, Math.round((sy + dy) * 10) / 10]]
    });
  }
  return commands;
}

// ====================================================
// PASS 3: Knocked-Out Monferno (Accurate Pokémon Anatomy, Pure Graphite)
// ====================================================
export function buildPass3() {
  const commands = [
    { type: 'layer.add', id: 'monferno', name: 'Knocked Out Monferno' },
    // Solid opaque paper underlay under Monferno head & body so the horizontal arena line at y=460 does NOT show through
    {
      type: 'ellipse',
      layer: 'monferno',
      x: 432,
      y: 424,
      width: 82,
      height: 56,
      color: '#f7f3e8',
      opacity: 1.0
    },
    {
      type: 'ellipse',
      layer: 'monferno',
      x: 480,
      y: 450,
      width: 95,
      height: 38,
      color: '#f7f3e8',
      opacity: 1.0
    }
  ];

  const strokes = [];
  function add(pts, { color = '#261e19', size = 3.5, opacity = 0.92, companion = true } = {}) {
    const smooth = handJitter(catmullRomSpline(pts, 4), 0.20);
    strokes.push({
      type: 'stroke',
      layer: 'monferno',
      brush: 'pencil',
      color,
      size,
      opacity,
      points: smooth
    });
    if (companion && smooth.length > 4) {
      strokes.push({
        type: 'stroke',
        layer: 'monferno',
        brush: 'pencil',
        color: '#55463b',
        size: Math.max(1.8, size * 0.65),
        opacity: 0.35,
        points: handJitter(smooth.map(([x, y]) => [x + 0.35, y + 0.25]), 0.28)
      });
    }
  }

  // 1. Ground contact shadow hatching beneath Monferno along stone step
  commands.push(...pencilHatch('monferno', 422, 486, 582, 486, 25, 3.5, 9, { color: '#453a32', opacity: 0.5 }));

  // 2. Monferno Flame Crown Tuft on Head (Curves dynamically backward like a flame crest)
  add([[466, 426], [472, 414], [480, 402], [490, 394], [502, 392], [494, 404], [486, 414], [480, 426]], { color: '#261e19', size: 3.6 });
  add([[476, 412], [484, 404], [494, 398]], { color: '#4a3d33', size: 2.2, opacity: 0.7, companion: false });

  // 3. Skull Dome & Profile resting on stone
  add([[458, 430], [468, 424], [482, 424], [494, 430], [502, 442], [498, 456]], { color: '#261e19', size: 3.6 });
  add([[458, 430], [450, 436], [446, 448]], { color: '#261e19', size: 3.4 });

  // 4. Large Primate Ears with inner C-fold
  // Left ear (top)
  add([[450, 434], [438, 428], [428, 434], [430, 446], [444, 450]], { color: '#261e19', size: 3.4 });
  add([[438, 434], [432, 440], [438, 444]], { color: '#4a3d33', size: 2.2, opacity: 0.75, companion: false });
  // Right ear (back)
  add([[496, 434], [508, 430], [518, 436], [516, 448], [502, 452]], { color: '#261e19', size: 3.4 });
  add([[508, 436], [512, 442], [506, 446]], { color: '#4a3d33', size: 2.2, opacity: 0.75, companion: false });

  // 5. Signature Blue Brow Mask (Distinct curved two-lobed mask across eyes)
  add([[452, 442], [462, 438], [472, 440], [482, 437], [492, 442], [488, 450], [478, 448], [472, 450], [462, 448], [454, 450], [452, 442]], { color: '#261e19', size: 3.4 });
  // Delicate graphite pencil shading inside mask
  commands.push(...pencilHatch('monferno', 454, 444, 490, 444, 50, 2.8, 5, { color: '#453a32', opacity: 0.40 }));
  // Center forehead/brow mark
  add([[470, 439], [472, 447], [474, 439]], { color: '#261e19', size: 3.2, opacity: 0.95 });

  // 6. KNOCKED OUT "X X" EYES (Bold cartoon X marks)
  // Left eye X
  add([[458, 442], [466, 450]], { color: '#16110e', size: 3.8, opacity: 0.95, companion: false });
  add([[466, 442], [458, 450]], { color: '#16110e', size: 3.8, opacity: 0.95, companion: false });
  // Right eye X
  add([[478, 442], [486, 450]], { color: '#16110e', size: 3.8, opacity: 0.95, companion: false });
  add([[486, 442], [478, 450]], { color: '#16110e', size: 3.8, opacity: 0.95, companion: false });

  // 7. Muzzle & Slack Dazed Mouth with Lolling Tongue
  add([[452, 452], [448, 462], [456, 470], [472, 474], [488, 472], [496, 462], [494, 454]], { color: '#261e19', size: 3.4 });
  // Nostrils
  add([[466, 458], [467, 458]], { color: '#261e19', size: 3.0, opacity: 0.9, companion: false });
  add([[474, 458], [475, 458]], { color: '#261e19', size: 3.0, opacity: 0.9, companion: false });
  // Slack mouth opening
  add([[456, 464], [468, 466], [482, 463]], { color: '#261e19', size: 3.2 });
  // Pointed upper canine tooth
  add([[462, 465], [461, 469], [464, 466]], { color: '#261e19', size: 2.8, opacity: 0.9, companion: false });
  // Comical lolling tongue touching stone floor
  add([[467, 466], [466, 474], [474, 476], [476, 467]], { color: '#261e19', size: 3.0, opacity: 0.95, companion: false });

  // 8. Spiky White Neck Ruff / Collar (Jagged fur points framing neck)
  add([
    [446, 458], [436, 466], [446, 468], [440, 476], [452, 476],
    [450, 484], [464, 482], [472, 490], [484, 486], [494, 490],
    [504, 484], [508, 476], [498, 472], [504, 464], [496, 458]
  ], { color: '#261e19', size: 3.4 });

  // 9. Slumped Primate Torso on Stone Step
  add([[486, 484], [502, 486], [524, 488], [546, 486], [564, 478], [572, 468], [568, 458], [552, 454], [532, 456], [512, 466]], { color: '#261e19', size: 3.6 });
  // Tan belly patch outline & belly swirl
  add([[506, 484], [522, 486], [540, 484], [554, 476]], { color: '#4a3d33', size: 2.8, opacity: 0.75, companion: false });
  add([[528, 476], [532, 472], [536, 474], [534, 478], [530, 478]], { color: '#4a3d33', size: 2.4, opacity: 0.8, companion: false });

  // 10. Limp Sprawled Left Arm & 5 Fingers on Stone Floor
  add([[476, 480], [464, 488], [450, 494], [436, 496], [422, 494]], { color: '#261e19', size: 3.4 });
  // Signature yellow bicep band
  add([[468, 484], [464, 490], [468, 492]], { color: '#261e19', size: 3.4, opacity: 0.95 });
  // 5 Limp Primate Fingers flat on stone
  add([[422, 494], [412, 492], [406, 494]], { color: '#261e19', size: 2.8, opacity: 0.85, companion: false });
  add([[420, 495], [410, 496], [405, 498]], { color: '#261e19', size: 2.8, opacity: 0.85, companion: false });
  add([[421, 496], [412, 499], [408, 502]], { color: '#261e19', size: 2.8, opacity: 0.85, companion: false });
  add([[423, 497], [416, 501], [412, 504]], { color: '#261e19', size: 2.8, opacity: 0.85, companion: false });
  add([[426, 496], [420, 502]], { color: '#261e19', size: 2.8, opacity: 0.85, companion: false });

  // Right arm limp backwards
  add([[542, 456], [554, 450], [568, 446], [578, 448]], { color: '#261e19', size: 3.2 });
  add([[552, 452], [554, 448]], { color: '#261e19', size: 3.4, opacity: 0.95 });
  add([[578, 448], [584, 446], [588, 448]], { color: '#261e19', size: 2.6, opacity: 0.8, companion: false });

  // 11. Limp Hind Legs & Monkey Toes
  add([[562, 476], [574, 482], [588, 484], [598, 482]], { color: '#261e19', size: 3.4 });
  add([[598, 482], [604, 480], [608, 482]], { color: '#261e19', size: 2.8, opacity: 0.85, companion: false });
  add([[598, 483], [604, 484], [607, 486]], { color: '#261e19', size: 2.8, opacity: 0.85, companion: false });
  add([[597, 484], [602, 487], [604, 489]], { color: '#261e19', size: 2.8, opacity: 0.85, companion: false });

  // 12. Signature Long Monkey Tail with Red Base & Flame Tip
  // S-curved tail curling upward
  add([[566, 464], [578, 456], [588, 444], [594, 428], [592, 412], [582, 402], [572, 406], [568, 416], [574, 424], [582, 424]], { color: '#261e19', size: 3.6 });
  // Tail base ring
  add([[568, 462], [572, 460], [576, 462]], { color: '#261e19', size: 3.6, opacity: 0.95 });
  // Burning Fire-type flame at tip
  add([[576, 420], [572, 410], [562, 400], [566, 386], [576, 390], [582, 378], [588, 388], [592, 380], [596, 392], [594, 406], [586, 416], [578, 420]], { color: '#261e19', size: 3.4 });
  add([[570, 400], [572, 392], [578, 394], [582, 386], [586, 396], [582, 404]], { color: '#4a3d33', size: 2.6, opacity: 0.85, companion: false });
  // Smoke wisp above tail
  add([[584, 374], [582, 366], [586, 360]], { color: '#5a4c41', size: 2.0, opacity: 0.6, companion: false });

  // 13. Knockout Comic FX (Dizzy Stars, Spirals, Sweat)
  add([[458, 380], [462, 372], [466, 380], [458, 375], [466, 375]], { color: '#382f28', size: 2.4, opacity: 0.9, companion: false });
  add([[486, 384], [490, 376], [494, 384], [486, 379], [494, 379]], { color: '#382f28', size: 2.4, opacity: 0.9, companion: false });
  add([[470, 392], [474, 390], [476, 394], [472, 396], [468, 393], [470, 388]], { color: '#382f28', size: 2.0, opacity: 0.85, companion: false });
  add([[442, 410], [438, 405], [442, 400], [445, 405], [442, 410]], { color: '#382f28', size: 2.2, opacity: 0.85, companion: false });

  commands.push(...strokes);
  return commands;
}

// ====================================================
// PASS 4: Speech Bubble & Comic Hand-Lettering
// ====================================================
const GLYPHS = {
  ' ': { width: 5.5, strokes: [] },
  'I': { width: 5.0, strokes: [[[2.5, 0], [2.5, 10]], [[0.8, 0], [4.2, 0]], [[0.8, 10], [4.2, 10]]] },
  'S': { width: 6.8, strokes: [[[6.0, 1.5], [4.0, 0], [1.8, 1.2], [2.2, 4.5], [5.8, 6.2], [5.5, 9.8], [1.5, 9.2]]] },
  'E': { width: 6.0, strokes: [[[1.2, 0], [1.2, 10]], [[1.2, 0], [5.6, 0]], [[1.2, 5], [4.5, 5]], [[1.2, 10], [5.6, 10]]] },
  'c': { width: 5.6, strokes: [[[5.2, 4.8], [3.4, 3.8], [1.2, 6.5], [3.4, 10.0], [5.2, 9.0]]] },
  'a': { width: 5.8, strokes: [[[5.0, 5.0], [3.0, 3.8], [1.2, 6.5], [3.0, 10.0], [5.0, 9.0]], [[5.0, 4.0], [5.0, 10.0]]] },
  'n': { width: 5.8, strokes: [[[1.2, 3.8], [1.2, 10.0]], [[1.2, 5.2], [3.2, 3.8], [5.2, 5.0], [5.2, 10.0]]] },
  't': { width: 4.8, strokes: [[[2.5, 1.0], [2.5, 9.0], [4.2, 10.0]], [[0.8, 3.8], [4.4, 3.8]]] },
  'h': { width: 5.8, strokes: [[[1.2, 0.0], [1.2, 10.0]], [[1.2, 5.2], [3.2, 3.8], [5.2, 5.0], [5.2, 10.0]]] },
  'e': { width: 5.8, strokes: [[[1.2, 6.5], [5.2, 6.5], [4.6, 3.8], [3.0, 3.8], [1.2, 6.5], [3.0, 10.0], [5.2, 9.2]]] },
  's': { width: 5.2, strokes: [[[4.8, 4.8], [3.2, 3.8], [1.4, 5.0], [4.4, 6.8], [4.8, 8.8], [2.8, 10.0], [1.2, 9.0]]] },
  'w': { width: 8.5, strokes: [[[1.0, 3.8], [2.6, 10.0], [4.5, 6.0], [6.2, 10.0], [8.0, 3.8]]] },
  'p': { width: 5.8, strokes: [[[1.2, 3.8], [1.2, 13.5]], [[1.2, 4.8], [3.5, 3.8], [5.4, 5.8], [3.8, 9.2], [1.2, 8.8]]] },
  'o': { width: 6.0, strokes: [[[3.2, 3.8], [1.2, 6.8], [3.2, 10.0], [5.4, 6.8], [3.2, 3.8]]] },
  'u': { width: 5.8, strokes: [[[1.2, 3.8], [1.2, 8.5], [3.2, 10.0], [5.2, 8.5], [5.2, 3.8]], [[5.2, 5.5], [5.2, 10.0]]] },
  'r': { width: 5.0, strokes: [[[1.2, 3.8], [1.2, 10.0]], [[1.2, 5.5], [3.2, 3.8], [4.8, 4.8]]] },
  'i': { width: 3.2, strokes: [[[1.6, 4.0], [1.6, 10.0]], [[1.6, 1.2], [1.6, 2.0]]] },
  'g': { width: 5.8, strokes: [[[5.0, 4.8], [3.0, 3.8], [1.2, 6.8], [3.0, 9.2], [5.0, 8.8]], [[5.0, 3.8], [5.0, 12.0], [3.2, 13.5], [1.5, 12.5]]] },
  'f': { width: 5.0, strokes: [[[4.4, 0.8], [3.2, 0.0], [1.8, 1.8], [1.8, 10.0]], [[0.8, 3.8], [4.2, 3.8]]] },
  'y': { width: 5.8, strokes: [[[1.2, 3.8], [3.4, 9.0]], [[5.0, 3.8], [3.4, 9.0], [1.8, 13.5]]] },
  'k': { width: 6.0, strokes: [[[1.2, 0.0], [1.2, 10.0]], [[5.0, 3.8], [1.2, 6.8]], [[2.8, 6.2], [5.4, 10.0]]] },
  'b': { width: 5.8, strokes: [[[1.2, 0.0], [1.2, 10.0]], [[1.2, 5.5], [3.5, 3.8], [5.4, 6.5], [3.5, 9.8], [1.2, 10.0]]] },
  'l': { width: 3.6, strokes: [[[1.8, 0.0], [1.8, 9.2], [3.4, 10.0]]] },
};

function renderTextStrokes(text, startX, startY, scale = 1.35) {
  const cmds = [];
  let cx = startX;
  for (const ch of text) {
    const glyph = GLYPHS[ch] || { width: 5.0, strokes: [] };
    for (const strokePts of glyph.strokes) {
      const scaled = strokePts.map(([gx, gy]) => [cx + gx * scale, startY + gy * scale]);
      const smoothed = handJitter(catmullRomSpline(scaled, 3), 0.20);
      cmds.push({
        type: 'stroke',
        layer: 'bubble',
        brush: 'pencil',
        color: '#1a1410',
        size: 3.4,
        opacity: 0.95,
        points: smoothed
      });
    }
    cx += glyph.width * scale;
  }
  return cmds;
}

function measureTextWidth(text, scale = 1.35) {
  let w = 0;
  for (const ch of text) {
    const glyph = GLYPHS[ch] || { width: 5.0 };
    w += glyph.width * scale;
  }
  return w;
}

export function buildPass4() {
  const commands = [
    { type: 'layer.add', id: 'bubble', name: 'Speech Bubble' }
  ];

  // Paper underlay fill to occlude background architecture
  // Main oval underlay: x: 440..680, y: 35..170
  commands.push({
    type: 'ellipse',
    layer: 'bubble',
    x: 440,
    y: 35,
    width: 240,
    height: 135,
    color: '#f7f3e8',
    opacity: 0.98
  });

  // Paper underlay strokes inside pointer tail so background hexagon line is hidden
  for (let t = 0; t <= 1; t += 0.12) {
    const p1x = 635 + (595 - 635) * t;
    const p1y = 160 + (172 - 160) * t;
    commands.push({
      type: 'stroke',
      layer: 'bubble',
      brush: 'pencil',
      color: '#f7f3e8',
      size: 14,
      opacity: 1.0,
      points: [[p1x, p1y], [712, 184]]
    });
  }

  // Organic hand-drawn comic speech balloon contour
  // Tail sweeps down-right directly toward Roark's smirk [724, 184], stopping just before at [712, 184]!
  const borderPts = [
    [455, 105], [448, 80], [460, 58], [490, 42], [540, 36], [600, 38],
    [648, 50], [674, 72], [682, 98], [676, 126], [655, 150], [635, 160],
    // Pointer tail to Roark's mouth!
    [645, 162],
    [678, 172],
    [712, 184], // Tip right in front of Roark's smirk!
    [672, 182],
    [624, 176],
    [585, 174], [525, 172], [480, 160], [458, 138], [455, 105]
  ];

  const smooth = handJitter(catmullRomSpline(borderPts, 3), 0.25);
  commands.push(
    {
      type: 'stroke',
      layer: 'bubble',
      brush: 'pencil',
      color: '#261e19',
      size: 3.6,
      opacity: 0.94,
      points: smooth
    },
    {
      type: 'stroke',
      layer: 'bubble',
      brush: 'pencil',
      color: '#55463b',
      size: 2.2,
      opacity: 0.40,
      points: handJitter(smooth.map(([x, y]) => [x + 0.35, y + 0.3]), 0.30)
    }
  );

  // EXACT TEXT:
  // "I can SEE"
  // "the sweat pouring"
  // "out of your"
  // "pokeballs bro"
  const lines = [
    { text: 'I can SEE', y: 55, scale: 1.35 },
    { text: 'the sweat pouring', y: 77, scale: 1.25 },
    { text: 'out of your', y: 99, scale: 1.27 },
    { text: 'pokeballs bro', y: 121, scale: 1.27 },
  ];

  const bubbleCenterX = 560;

  for (const line of lines) {
    const textW = measureTextWidth(line.text, line.scale);
    const startX = Math.round(bubbleCenterX - textW / 2);
    commands.push(...renderTextStrokes(line.text, startX, line.y, line.scale));
  }

  return commands;
}

// Build combined array
export function buildFullScene() {
  const p3 = buildPass3();
  const p4 = buildPass4();
  return [...pass1, ...pass2, ...p3, ...p4];
}

const full = buildFullScene();
console.log(`Full scene commands: ${full.length}`);
fs.writeFileSync('/tmp/codesketch-tumblr-art-paint7ma/scene_deliverable.json', JSON.stringify(full, null, 2));
