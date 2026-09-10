import fs from 'node:fs';

// Helper functions for smooth pencil splines
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

// ----------------------------------------------------
// BUILD MONFERNO (Accurate anatomy, passed out, behind Roark)
// Position: x: 480..630, y: 370..470
// ----------------------------------------------------
export function buildMonfernoCommands() {
  const strokes = [];
  function add(pts, color = '#2b221a', size = 3.4, opacity = 0.90, withCompanion = true) {
    const smooth = handJitter(catmullRomSpline(pts, 4), 0.25);
    strokes.push({
      type: 'stroke',
      layer: 'monferno',
      brush: 'pencil',
      color,
      size,
      opacity,
      points: smooth
    });
    if (withCompanion && smooth.length > 5) {
      strokes.push({
        type: 'stroke',
        layer: 'monferno',
        brush: 'pencil',
        color: '#55463b',
        size: Math.max(1.8, size * 0.65),
        opacity: 0.35,
        points: handJitter(smooth.map(([x, y]) => [x + 0.3, y + 0.25]), 0.3)
      });
    }
  }

  // 1. Signature Monferno Head Crest / Horn (curves backwards/up like a flame droplet)
  add([[528, 395], [520, 384], [510, 372], [498, 362], [492, 356], [498, 354], [508, 362], [518, 374], [524, 388]], '#2b221a', 3.6);
  // Crest inner ridge
  add([[502, 360], [510, 368], [516, 378]], '#4a3d33', 2.4, 0.7, false);

  // 2. Skull dome
  add([[516, 392], [524, 388], [535, 388], [546, 394], [552, 404], [550, 416]], '#2b221a', 3.6);
  // Back of head down to neck
  add([[516, 392], [508, 400], [506, 412]], '#2b221a', 3.4);

  // 3. Large Round Monkey Ears with Inner C-Cartilage
  // Left ear (viewer left, top)
  add([[508, 398], [496, 392], [488, 398], [490, 410], [502, 414]], '#2b221a', 3.4);
  add([[496, 398], [492, 404], [498, 408]], '#4a3d33', 2.4, 0.75, false); // Inner fold
  // Right ear (viewer right, back)
  add([[548, 398], [558, 394], [566, 400], [564, 410], [552, 414]], '#2b221a', 3.4);
  add([[556, 400], [560, 404], [556, 408]], '#4a3d33', 2.4, 0.75, false); // Inner fold

  // 4. Blue Brow Mask (Curved mask across eyebrows with 2 rounded lobes)
  add([[512, 404], [522, 400], [530, 402], [538, 400], [546, 405], [542, 412], [534, 410], [528, 412], [520, 410], [514, 412], [512, 404]], '#1b3b52', 3.4);
  // Red vertical nose-bridge marking
  add([[526, 402], [528, 410], [530, 402]], '#8a241b', 3.2, 0.95);

  // 5. Knocked Out "X X" Eyes (Bold cartoon X marks)
  // Left eye X
  add([[518, 404], [524, 410]], '#16110e', 3.6, 0.95, false);
  add([[524, 404], [518, 410]], '#16110e', 3.6, 0.95, false);
  // Right eye X
  add([[534, 404], [540, 410]], '#16110e', 3.6, 0.95, false);
  add([[540, 404], [534, 410]], '#16110e', 3.6, 0.95, false);

  // 6. Tan Muzzle & Open Mouth with Canine Tooth & Lolling Tongue
  // Muzzle outline
  add([[514, 414], [510, 422], [516, 430], [528, 434], [542, 432], [548, 424], [546, 416]], '#2b221a', 3.4);
  // Nostril dots
  add([[526, 420], [527, 420]], '#2b221a', 3.0, 0.9, false);
  add([[532, 420], [533, 420]], '#2b221a', 3.0, 0.9, false);
  // Mouth opening
  add([[518, 425], [528, 427], [538, 424]], '#2b221a', 3.2);
  // Pointed upper canine tooth
  add([[523, 426], [522, 430], [525, 427]], '#2b221a', 2.8, 0.9, false);
  // Tongue lolling out onto floor
  add([[527, 427], [526, 434], [532, 436], [534, 428]], '#8a2b25', 3.0, 0.9, false);

  // 7. Spiky White Neck Ruff / Collar (Jagged triangular fur points)
  add([[506, 420], [498, 428], [506, 430], [502, 438], [512, 438], [510, 446], [522, 444], [528, 452], [538, 448], [546, 452], [554, 446], [558, 438], [550, 434], [554, 426], [548, 420]], '#2b221a', 3.4);

  // 8. Slumped Orange Primate Body on Stone Step
  add([[538, 448], [550, 452], [568, 454], [586, 452], [602, 446], [612, 436], [608, 426], [594, 422], [576, 424], [558, 432]], '#2b221a', 3.6);
  // Tan belly patch outline
  add([[552, 448], [566, 450], [582, 448], [594, 442]], '#4a3d33', 2.8, 0.75, false);
  // Signature belly swirl above navel
  add([[572, 442], [576, 438], [580, 440], [578, 444], [574, 444]], '#4a3d33', 2.4, 0.8, false);

  // 9. Limp Sprawled Left Arm (Foreground, lying flat)
  add([[536, 444], [526, 452], [514, 458], [500, 460], [488, 458]], '#2b221a', 3.4);
  // Signature Yellow Bicep / Shoulder Cuff Band
  add([[530, 448], [526, 454], [530, 456]], '#8a6e18', 3.4, 0.95);
  // 5 Limp Primate Fingers sprawled on stone
  add([[488, 458], [480, 456], [476, 458]], '#2b221a', 2.8, 0.85, false); // Finger 1
  add([[486, 459], [478, 460], [475, 462]], '#2b221a', 2.8, 0.85, false); // Finger 2
  add([[487, 460], [480, 463], [478, 466]], '#2b221a', 2.8, 0.85, false); // Finger 3
  add([[489, 461], [484, 465], [482, 468]], '#2b221a', 2.8, 0.85, false); // Finger 4
  add([[492, 460], [488, 466]], '#2b221a', 2.8, 0.85, false); // Thumb

  // Right arm limp backwards
  add([[584, 424], [594, 418], [606, 414], [616, 416]], '#2b221a', 3.2);
  // Yellow band on right arm
  add([[592, 420], [594, 416]], '#8a6e18', 3.4, 0.95);
  // Fingers of right hand limp
  add([[616, 416], [622, 414], [626, 416]], '#2b221a', 2.6, 0.8, false);

  // 10. Limp Hind Legs & 3-Toed Feet
  add([[602, 444], [612, 450], [624, 452], [634, 450]], '#2b221a', 3.4);
  // 3 distinct monkey toes
  add([[634, 450], [640, 448], [644, 450]], '#2b221a', 2.8, 0.85, false); // Toe 1
  add([[634, 451], [640, 452], [643, 454]], '#2b221a', 2.8, 0.85, false); // Toe 2
  add([[633, 452], [638, 455], [640, 457]], '#2b221a', 2.8, 0.85, false); // Toe 3

  // 11. Signature Long Monkey Tail with Red Base and Crackling Flame Tip
  // S-curved tail curling upward
  add([[608, 432], [620, 424], [630, 412], [636, 396], [634, 380], [624, 370], [614, 374], [610, 384], [616, 392], [624, 392]], '#2b221a', 3.6);
  // Red ring at tail base
  add([[610, 430], [614, 428], [618, 430]], '#8a241b', 3.6, 0.95);
  // Large dramatic Fire-type flame burning at tip
  add([[618, 388], [614, 378], [604, 368], [608, 354], [618, 358], [624, 346], [630, 356], [634, 348], [638, 360], [636, 374], [628, 384], [620, 388]], '#382215', 3.4);
  // Inner flame tongues
  add([[612, 368], [614, 360], [620, 362], [624, 354], [628, 364], [624, 372]], '#8a3c1c', 2.6, 0.85, false);
  // Small smoke wisp above knocked out tail flame
  add([[626, 342], [624, 334], [628, 328]], '#655447', 2.0, 0.6, false);

  // 12. Knockout Dizzy Effects (Stars, Spirals, Sweat)
  // Dizzy star 1
  add([[516, 350], [520, 342], [524, 350], [516, 345], [524, 345]], '#45362b', 2.4, 0.9, false);
  // Dizzy star 2
  add([[536, 356], [540, 348], [544, 356], [536, 351], [544, 351]], '#45362b', 2.4, 0.9, false);
  // Dizzy spiral
  add([[528, 362], [532, 360], [534, 364], [530, 366], [526, 363], [528, 358]], '#45362b', 2.0, 0.85, false);
  // Sweat drop 1
  add([[502, 380], [498, 375], [502, 370], [505, 375], [502, 380]], '#45362b', 2.2, 0.85, false);
  // Sweat drop 2
  add([[554, 378], [558, 373], [554, 368], [551, 373], [554, 378]], '#45362b', 2.2, 0.85, false);

  return strokes;
}

// ----------------------------------------------------
// BUILD SPEECH BUBBLE (Exact direction user drew in green)
// Center around x: 505, y: 135. Tail to Roark's mouth [625, 180]!
// ----------------------------------------------------
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

export function buildBubbleCommands() {
  const cmds = [];

  // Opaque paper underlay ellipse to hide background architecture behind text
  // Bounding box of user green bubble: x: 420..610, y: 70..200
  cmds.push({
    type: 'ellipse',
    layer: 'bubble',
    x: 420,
    y: 72,
    width: 200,
    height: 130,
    color: '#f7f3e8',
    opacity: 0.98
  });

  // Hand-drawn comic balloon contour tracing the user's green suggestion
  // Balloon body: x: 430..600, y: 75..195
  // Pointer tail: comes out from bottom-right of balloon at [575, 175],
  // curves down-right directly to Roark's mouth at [625, 180]!
  const borderPts = [
    [435, 130], [428, 105], [442, 85], [475, 75], [525, 72], [570, 76],
    [598, 92], [608, 115], [605, 142], [590, 168], [568, 182],
    // Pointer tail directly to Roark's mouth
    [578, 178],
    [602, 178],
    [624, 180], // Tip right at Roark's mouth/smirk!
    [595, 185],
    [550, 192],
    [495, 195], [455, 182], [436, 160], [435, 130]
  ];

  const smooth = handJitter(catmullRomSpline(borderPts, 3), 0.3);
  cmds.push(
    {
      type: 'stroke',
      layer: 'bubble',
      brush: 'pencil',
      color: '#261e19',
      size: 3.6,
      opacity: 0.92,
      points: smooth
    },
    {
      type: 'stroke',
      layer: 'bubble',
      brush: 'pencil',
      color: '#55463b',
      size: 2.2,
      opacity: 0.4,
      points: handJitter(smooth.map(([x, y]) => [x + 0.35, y + 0.3]), 0.35)
    }
  );

  // Text lines centered in the bubble: x: ~515
  cmds.push(
    ...renderText("I can SEE", 488, 92, 1.25),
    ...renderText("the sweat pouring", 450, 113, 1.20),
    ...renderText("out of your", 478, 134, 1.20),
    ...renderText("pokeballs bro", 468, 155, 1.20)
  );

  return cmds;
}

// Generate files
const pass1 = JSON.parse(fs.readFileSync('artifacts/tumblr-pass1-arena.json'));
const pass2 = JSON.parse(fs.readFileSync('artifacts/tumblr-pass2-trainers.json'));
const pass3 = [
  { type: 'layer.add', id: 'monferno', name: 'Knocked Out Monferno' },
  ...buildMonfernoCommands()
];
const pass4 = [
  { type: 'layer.add', id: 'bubble', name: 'Speech Bubble' },
  ...buildBubbleCommands()
];

fs.writeFileSync('artifacts/tumblr-pass3-monferno.json', JSON.stringify(pass3, null, 2));
fs.writeFileSync('artifacts/tumblr-pass4-bubble.json', JSON.stringify(pass4, null, 2));

console.log("PASS 3 Monferno commands:", pass3.length);
console.log("PASS 4 Bubble commands:", pass4.length);

// Generate combined preview HTML
const allMarks = [
  ...pass1.filter(c => c.type !== 'layer.add'),
  ...pass2.filter(c => c.type !== 'layer.add'),
  ...pass3.filter(c => c.type !== 'layer.add'),
  ...pass4.filter(c => c.type !== 'layer.add')
];

import { createPreviewHtml } from './render-preview.mjs';
fs.writeFileSync('artifacts/preview-accurate.html', createPreviewHtml(allMarks));
console.log("Written preview-accurate.html with", allMarks.length, "marks");
