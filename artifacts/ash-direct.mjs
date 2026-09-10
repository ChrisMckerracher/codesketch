import fs from 'node:fs';

// Spline & natural tremor helpers
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

function jitter(pts, intensity = 0.22) {
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

function stroke(layer, pts, { color = '#28201a', size = 3.5, opacity = 0.90, wobble = 0.22, companion = true } = {}) {
  const smooth = jitter(catmullRomSpline(pts, 3), wobble);
  const cmds = [{
    type: 'stroke',
    layer,
    brush: 'pencil',
    color,
    size,
    opacity,
    points: smooth
  }];
  if (companion && smooth.length > 5) {
    cmds.push({
      type: 'stroke',
      layer,
      brush: 'pencil',
      color: '#55463b',
      size: Math.max(1.8, size * 0.65),
      opacity: 0.35,
      points: jitter(smooth.map(([x, y]) => [x + 0.3, y + 0.25]), wobble * 1.3)
    });
  }
  return cmds;
}

// Circle generator
function circlePts(cx, cy, r, segments = 24) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

// Arc generator
function arcPts(cx, cy, r, startAngle, endAngle, segments = 16) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = startAngle + (i / segments) * (endAngle - startAngle);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

// =========================================================================
// DIRECT ART CREATION: ASH KETCHUM (CHALLENGER POSE HOLDING POKEBALL)
// =========================================================================

export function buildAshDirectPasses() {
  // PASS 1: Rough Construction Guidelines & Underdrawing
  const pass1 = [
    { type: 'layer.add', id: 'underdrawing', name: 'Underdrawing & Armature' },
    // Head circle guideline
    ...stroke('underdrawing', circlePts(480, 190, 48), { color: '#8c7d70', size: 1.8, opacity: 0.35, companion: false }),
    // Jaw guide
    ...stroke('underdrawing', [[436, 198], [450, 235], [480, 258], [510, 235], [524, 198]], { color: '#8c7d70', size: 1.8, opacity: 0.35, companion: false }),
    // Shoulder axis
    ...stroke('underdrawing', [[375, 290], [480, 280], [585, 275]], { color: '#8c7d70', size: 1.8, opacity: 0.35, companion: false }),
    // Spine / torso line
    ...stroke('underdrawing', [[480, 260], [482, 360], [480, 460]], { color: '#8c7d70', size: 1.8, opacity: 0.35, companion: false }),
    // Right arm armature (reaching forward)
    ...stroke('underdrawing', [[570, 280], [645, 305], [705, 270]], { color: '#8c7d70', size: 1.8, opacity: 0.35, companion: false }),
    // Poke Ball circle guideline
    ...stroke('underdrawing', circlePts(730, 255, 26), { color: '#8c7d70', size: 1.8, opacity: 0.35, companion: false }),
    // Left arm armature (hand on hip)
    ...stroke('underdrawing', [[390, 290], [335, 370], [405, 435]], { color: '#8c7d70', size: 1.8, opacity: 0.35, companion: false }),
    // Pikachu armature on left shoulder
    ...stroke('underdrawing', circlePts(355, 235, 30), { color: '#8c7d70', size: 1.8, opacity: 0.35, companion: false })
  ];

  // PASS 2: Primary Ink (Ash Ketchum Figure)
  const pass2 = [
    { type: 'layer.add', id: 'ash', name: 'Ash Ketchum' }
  ];

  // 1. Ash's Iconic Cap (Turned Backwards for serious battle!)
  // Cap dome rounded top
  pass2.push(
    ...stroke('ash', [[432, 185], [440, 148], [460, 132], [485, 130], [510, 134], [528, 152], [532, 185]], { size: 3.8 }),
    // Cap seam lines
    ...stroke('ash', [[485, 130], [484, 182]], { size: 2.6, opacity: 0.7 }),
    // Cap top button
    ...stroke('ash', circlePts(485, 128, 5), { size: 3.0, companion: false }),
    // Backward visor brim curved over nape of neck
    ...stroke('ash', [[520, 175], [545, 170], [568, 176], [558, 188], [530, 188]], { size: 3.6 }),
    // Green underside of visor
    ...stroke('ash', [[530, 188], [552, 185], [568, 176]], { color: '#2e7d32', size: 3.2, companion: false }),
    // Poke Ball logo on front forehead panel (facing us!)
    ...stroke('ash', circlePts(480, 158, 13), { size: 3.2 }),
    ...stroke('ash', [[467, 158], [493, 158]], { size: 3.0 }),
    ...stroke('ash', circlePts(480, 158, 4), { size: 2.8, companion: false })
  );

  // 2. Spiky Messy Hair Framing Face
  pass2.push(
    // Left hair tufts
    ...stroke('ash', [[432, 180], [412, 192], [428, 202]], { size: 3.6 }),
    ...stroke('ash', [[428, 202], [408, 218], [425, 226]], { size: 3.6 }),
    ...stroke('ash', [[425, 226], [416, 242], [435, 238]], { size: 3.6 }),
    // Right hair tufts under cap
    ...stroke('ash', [[530, 185], [548, 198], [534, 210]], { size: 3.6 }),
    ...stroke('ash', [[534, 210], [552, 220], [535, 228]], { size: 3.6 }),
    ...stroke('ash', [[535, 228], [548, 240], [530, 242]], { size: 3.6 }),
    // Forehead bangs
    ...stroke('ash', [[446, 182], [455, 196], [464, 184]], { size: 3.4 }),
    ...stroke('ash', [[464, 184], [476, 202], [484, 182]], { size: 3.4 }),
    ...stroke('ash', [[484, 182], [498, 200], [506, 184]], { size: 3.4 }),
    ...stroke('ash', [[506, 184], [518, 194], [524, 182]], { size: 3.4 })
  );

  // 3. Face & Features (Anime eyes, Z-cheek marks, confident grin)
  pass2.push(
    // Jawline from ears to chin
    ...stroke('ash', [[432, 225], [440, 242], [460, 258], [480, 264], [500, 258], [518, 242], [526, 225]], { size: 3.6 }),
    // Left ear
    ...stroke('ash', [[430, 215], [420, 220], [422, 234], [432, 236]], { size: 3.2 }),
    ...stroke('ash', [[423, 224], [428, 226], [426, 232]], { size: 2.4, companion: false }),
    // Right ear
    ...stroke('ash', [[526, 215], [536, 220], [534, 234], [524, 236]], { size: 3.2 }),
    ...stroke('ash', [[533, 224], [528, 226], [530, 232]], { size: 2.4, companion: false }),
    // Confident angled eyebrows
    ...stroke('ash', [[444, 202], [468, 198]], { size: 3.6, color: '#16110e' }),
    ...stroke('ash', [[492, 198], [516, 202]], { size: 3.6, color: '#16110e' }),
    // Left Eye
    ...stroke('ash', [[448, 208], [466, 207]], { size: 3.4, color: '#16110e' }),
    ...stroke('ash', [[448, 208], [450, 222], [464, 222], [466, 207]], { size: 3.2, color: '#16110e' }),
    ...stroke('ash', circlePts(458, 215, 4), { size: 3.0, color: '#16110e', companion: false }),
    // Right Eye
    ...stroke('ash', [[494, 207], [512, 208]], { size: 3.4, color: '#16110e' }),
    ...stroke('ash', [[494, 207], [496, 222], [510, 222], [512, 208]], { size: 3.2, color: '#16110e' }),
    ...stroke('ash', circlePts(502, 215, 4), { size: 3.0, color: '#16110e', companion: false }),
    // Nose
    ...stroke('ash', [[480, 226], [482, 232], [477, 233]], { size: 2.8 }),
    // Confident open grin with teeth showing
    ...stroke('ash', [[464, 240], [480, 245], [498, 240]], { size: 3.6, color: '#16110e' }),
    ...stroke('ash', [[464, 240], [472, 252], [490, 252], [498, 240]], { size: 3.2, color: '#16110e' }),
    ...stroke('ash', [[470, 246], [492, 246]], { size: 2.4, opacity: 0.65, companion: false }), // Teeth line
    // Signature "Z" lightning markings on cheeks!
    ...stroke('ash', [[438, 230], [445, 233], [439, 237], [446, 240]], { size: 3.2, color: '#16110e', companion: false }),
    ...stroke('ash', [[522, 230], [515, 233], [521, 237], [514, 240]], { size: 3.2, color: '#16110e', companion: false })
  );

  // 4. Neck & Upturned Vest Collar
  pass2.push(
    // Neck
    ...stroke('ash', [[465, 262], [465, 285]], { size: 3.4 }),
    ...stroke('ash', [[495, 262], [495, 285]], { size: 3.4 }),
    // Collar flaps (white upturned high collar)
    ...stroke('ash', [[460, 280], [448, 262], [435, 266], [442, 290]], { size: 3.6 }),
    ...stroke('ash', [[500, 280], [512, 262], [525, 266], [518, 290]], { size: 3.6 }),
    ...stroke('ash', [[442, 290], [480, 298], [518, 290]], { size: 3.4 })
  );

  // 5. Classic Blue Vest & Undershirt
  pass2.push(
    // Vest open edges
    ...stroke('ash', [[442, 290], [440, 350], [432, 420], [428, 442]], { size: 3.8 }),
    ...stroke('ash', [[518, 290], [520, 350], [528, 420], [532, 442]], { size: 3.8 }),
    // Outer vest sides
    ...stroke('ash', [[385, 305], [392, 370], [405, 435], [428, 442]], { size: 3.8 }),
    ...stroke('ash', [[575, 295], [568, 365], [555, 435], [532, 442]], { size: 3.8 }),
    // Vest pockets
    ...stroke('ash', [[405, 385], [425, 383], [425, 410], [405, 412], [405, 385]], { size: 3.0 }),
    ...stroke('ash', [[535, 383], [555, 385], [555, 412], [535, 410], [535, 383]], { size: 3.0 }),
    // Yellow stripe / pocket trim
    ...stroke('ash', [[405, 385], [425, 383]], { color: '#c49000', size: 3.2, companion: false }),
    ...stroke('ash', [[535, 383], [555, 385]], { color: '#c49000', size: 3.2, companion: false }),
    // Undershirt chest & collar
    ...stroke('ash', [[455, 292], [480, 302], [505, 292]], { size: 3.2 }),
    ...stroke('ash', [[455, 350], [480, 355], [505, 350]], { size: 2.8, opacity: 0.65, companion: false })
  );

  // 6. Belt & Poke Ball Buckle
  pass2.push(
    ...stroke('ash', [[426, 442], [480, 445], [534, 442]], { size: 3.8 }),
    ...stroke('ash', [[428, 460], [480, 464], [532, 460]], { size: 3.8 }),
    // Belt loops
    ...stroke('ash', [[445, 440], [445, 462]], { size: 3.0, companion: false }),
    ...stroke('ash', [[515, 440], [515, 462]], { size: 3.0, companion: false }),
    // Pokeball Belt Buckle
    ...stroke('ash', circlePts(480, 452, 14), { size: 3.6 }),
    ...stroke('ash', [[466, 452], [494, 452]], { size: 3.2 }),
    ...stroke('ash', circlePts(480, 452, 5), { size: 3.0, companion: false })
  );

  // 7. Jeans (Upper legs & fly)
  pass2.push(
    // Waistband
    ...stroke('ash', [[410, 455], [428, 460]], { size: 3.6 }),
    ...stroke('ash', [[532, 460], [550, 455]], { size: 3.6 }),
    // Jeans fly
    ...stroke('ash', [[480, 466], [480, 510], [472, 515]], { size: 3.4 }),
    // Left leg contour
    ...stroke('ash', [[410, 455], [398, 520], [390, 590], [385, 660]], { size: 3.8 }),
    ...stroke('ash', [[465, 525], [455, 590], [448, 660]], { size: 3.6 }),
    // Right leg contour
    ...stroke('ash', [[495, 525], [508, 590], [518, 660]], { size: 3.6 }),
    ...stroke('ash', [[550, 455], [562, 520], [572, 590], [580, 660]], { size: 3.8 }),
    // Crotch seam
    ...stroke('ash', [[472, 515], [480, 526], [495, 525]], { size: 3.4 }),
    // Denim wrinkle creases
    ...stroke('ash', [[412, 485], [435, 492]], { size: 2.8, opacity: 0.7, companion: false }),
    ...stroke('ash', [[548, 485], [525, 492]], { size: 2.8, opacity: 0.7, companion: false }),
    ...stroke('ash', [[420, 560], [445, 568]], { size: 2.8, opacity: 0.7, companion: false }),
    ...stroke('ash', [[540, 560], [515, 568]], { size: 2.8, opacity: 0.7, companion: false })
  );

  // 8. Right Arm & Outstretched Hand Grasping Poké Ball
  pass2.push(
    // Shoulder sleeve (short sleeve vest)
    ...stroke('ash', [[570, 280], [612, 290], [618, 318], [580, 315]], { size: 3.8 }),
    ...stroke('ash', [[580, 315], [575, 295]], { size: 3.4 }),
    // White sleeve trim cuff
    ...stroke('ash', [[612, 290], [618, 318]], { size: 3.6 }),
    // Bare forearm reaching forward towards viewer
    ...stroke('ash', [[616, 305], [655, 298], [690, 280]], { size: 3.8 }),
    ...stroke('ash', [[595, 318], [640, 322], [680, 298]], { size: 3.8 }),
    // Green fingerless glove cuff (red trim)
    ...stroke('ash', [[678, 298], [686, 276]], { size: 3.6 }),
    ...stroke('ash', [[678, 298], [685, 302], [694, 282], [686, 276]], { color: '#2e7d32', size: 3.4 }),
    // Red glove wristband stripe
    ...stroke('ash', [[674, 296], [682, 274]], { color: '#c62828', size: 3.2, companion: false }),
    // Hand fingers gripping Poké Ball: thumb, index, middle wrapped over sphere
    ...stroke('ash', [[686, 276], [698, 260], [712, 255]], { size: 3.6 }), // Thumb
    ...stroke('ash', [[705, 240], [720, 235], [736, 242]], { size: 3.6 }), // Index finger tip
    ...stroke('ash', [[732, 242], [744, 250], [748, 262]], { size: 3.6 }), // Middle finger
    ...stroke('ash', [[690, 282], [710, 285], [724, 280]], { size: 3.6 }), // Palm edge
    // THE POKÉ BALL (Held forward prominently!)
    ...stroke('ash', circlePts(730, 262, 26), { size: 4.0, color: '#16110e' }),
    // Center horizontal divide line & band
    ...stroke('ash', [[705, 262], [755, 262]], { size: 3.8, color: '#16110e' }),
    // Center button mechanism
    ...stroke('ash', circlePts(730, 262, 8), { size: 3.6, color: '#16110e' }),
    ...stroke('ash', circlePts(730, 262, 4), { size: 3.0, color: '#16110e', companion: false }),
    // Top red half accent
    ...stroke('ash', arcPts(730, 262, 24, Math.PI, 2 * Math.PI), { color: '#c62828', size: 3.4, companion: false })
  );

  // 9. Left Arm & Hand Resting on Hip
  pass2.push(
    // Sleeve
    ...stroke('ash', [[390, 290], [352, 305], [358, 335], [392, 328]], { size: 3.8 }),
    ...stroke('ash', [[352, 305], [358, 335]], { size: 3.6 }),
    // Forearm down to hip
    ...stroke('ash', [[360, 330], [335, 380], [350, 420]], { size: 3.8 }),
    ...stroke('ash', [[385, 328], [365, 380], [378, 415]], { size: 3.6 }),
    // Glove cuff
    ...stroke('ash', [[350, 420], [378, 415]], { size: 3.6 }),
    ...stroke('ash', [[350, 420], [358, 430], [384, 424], [378, 415]], { color: '#2e7d32', size: 3.4 }),
    ...stroke('ash', [[346, 418], [374, 413]], { color: '#c62828', size: 3.2, companion: false }),
    // Hand clenched on hip
    ...stroke('ash', [[358, 430], [370, 445], [390, 446], [402, 438], [395, 426]], { size: 3.6 }),
    ...stroke('ash', [[372, 436], [382, 442]], { size: 2.8, companion: false }),
    ...stroke('ash', [[382, 436], [392, 440]], { size: 2.8, companion: false })
  );

  // PASS 3: Pikachu Partner on Shoulder & Final Accents
  const pass3 = [
    { type: 'layer.add', id: 'pikachu', name: 'Pikachu Partner' }
  ];

  // Pikachu Head & Body
  pass3.push(
    // Head dome
    ...stroke('pikachu', [[335, 235], [330, 215], [342, 195], [365, 190], [385, 202], [392, 225]], { size: 3.6 }),
    // Chubby cheeks
    ...stroke('pikachu', [[335, 235], [332, 252], [345, 264], [365, 268], [385, 262], [392, 245], [392, 225]], { size: 3.6 }),
    // Left Ear (pointed with black tip)
    ...stroke('pikachu', [[336, 202], [320, 160], [315, 130], [328, 145], [346, 192]], { size: 3.6 }),
    // Black tip on left ear
    ...stroke('pikachu', [[315, 130], [320, 142], [328, 145]], { size: 3.4, color: '#16110e' }),
    // Right Ear (pointed with black tip)
    ...stroke('pikachu', [[375, 192], [395, 155], [412, 130], [408, 155], [385, 202]], { size: 3.6 }),
    // Black tip on right ear
    ...stroke('pikachu', [[412, 130], [402, 145], [408, 155]], { size: 3.4, color: '#16110e' }),
    // Cute Pikachu Eyes (sparkling oval eyes)
    ...stroke('pikachu', circlePts(346, 218, 5), { size: 3.2, color: '#16110e', companion: false }),
    ...stroke('pikachu', circlePts(376, 222, 5), { size: 3.2, color: '#16110e', companion: false }),
    // Cute tiny nose
    ...stroke('pikachu', [[360, 228], [361, 228]], { size: 3.0, color: '#16110e', companion: false }),
    // Happy open cat-mouth (^w^ smile)
    ...stroke('pikachu', [[352, 234], [360, 238], [368, 234]], { size: 3.2, color: '#16110e' }),
    ...stroke('pikachu', [[354, 237], [360, 246], [366, 237]], { size: 3.0, color: '#16110e' }),
    // Rosy Red Cheeks (circular electric pouches)
    ...stroke('pikachu', circlePts(338, 242, 8), { color: '#c62828', size: 3.2 }),
    ...stroke('pikachu', circlePts(384, 245, 8), { color: '#c62828', size: 3.2 }),
    // Chubby Pikachu Body perched on Ash shoulder
    ...stroke('pikachu', [[335, 258], [320, 280], [325, 305], [355, 312], [375, 305]], { size: 3.6 }),
    // Cute waving paw
    ...stroke('pikachu', [[324, 275], [308, 270], [305, 260], [314, 258], [324, 266]], { size: 3.4 }),
    // Resting paw on Ash collar
    ...stroke('pikachu', [[368, 275], [372, 290], [380, 288]], { size: 3.2 }),
    // Lightning Bolt Tail zig-zagging up behind shoulder!
    ...stroke('pikachu', [[320, 302], [295, 295], [292, 270], [265, 260], [260, 230], [230, 215]], { size: 3.8, color: '#16110e' }),
    ...stroke('pikachu', [[325, 305], [302, 300], [300, 275], [275, 265], [270, 235], [230, 215]], { size: 3.6, color: '#16110e' })
  );

  return { pass1, pass2, pass3 };
}

const { pass1, pass2, pass3 } = buildAshDirectPasses();

fs.writeFileSync('artifacts/ash-direct-pass1.json', JSON.stringify(pass1, null, 2));
fs.writeFileSync('artifacts/ash-direct-pass2.json', JSON.stringify(pass2, null, 2));
fs.writeFileSync('artifacts/ash-direct-pass3.json', JSON.stringify(pass3, null, 2));

console.log("Pass 1 Underdrawing:", pass1.length);
console.log("Pass 2 Ash Ink:", pass2.length);
console.log("Pass 3 Pikachu & Accents:", pass3.length);
console.log("Total commands:", pass1.length + pass2.length + pass3.length);
