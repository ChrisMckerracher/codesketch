// artifacts/tumblr-refinement.mjs
// Enrichment and detailing pass for the Tumblr reaction artwork.

import { writeFileSync, mkdirSync } from 'node:fs';

function makeStroke(layer, points, { color = '#241b17', size = 3, opacity = 1.0, brush = 'pencil' } = {}) {
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

export function generateRefinementCommands() {
  const commands = [];

  // 1. REFINED MONFERNO DETAILS
  // Give Monferno more vibrant body and prominent X X eyes & flame
  // Cream belly & muzzle fill
  commands.push(
    { type: 'ellipse', layer: 'monferno', x: 440, y: 446, width: 16, height: 10, color: '#fef3c7', opacity: 0.95 },
    { type: 'ellipse', layer: 'monferno', x: 472, y: 450, width: 38, height: 12, color: '#fef3c7', opacity: 0.9 },
    // Blue eye mask patches
    { type: 'ellipse', layer: 'monferno', x: 435, y: 438, width: 14, height: 10, color: '#2563eb', opacity: 0.95 },
    { type: 'ellipse', layer: 'monferno', x: 447, y: 437, width: 13, height: 10, color: '#2563eb', opacity: 0.95 }
  );

  // Bold black cartoon X X eyes
  commands.push(
    // Left eye X (bold)
    makeStroke('monferno', [[436, 440], [445, 448]], { color: '#0f172a', size: 3.6, opacity: 1.0, brush: 'pencil' }),
    makeStroke('monferno', [[445, 440], [436, 448]], { color: '#0f172a', size: 3.6, opacity: 1.0, brush: 'pencil' }),
    // Right eye X (bold)
    makeStroke('monferno', [[448, 439], [457, 447]], { color: '#0f172a', size: 3.6, opacity: 1.0, brush: 'pencil' }),
    makeStroke('monferno', [[457, 439], [448, 447]], { color: '#0f172a', size: 3.6, opacity: 1.0, brush: 'pencil' }),
    // Dazed wavy slack mouth with comical tongue
    makeStroke('monferno', smoothCurve([[441, 452], [446, 456], [452, 453]]), { color: '#0f172a', size: 2.8, opacity: 1.0, brush: 'pencil' }),
    makeStroke('monferno', smoothCurve([[446, 455], [448, 458], [450, 455]]), { color: '#ef4444', size: 2.2, opacity: 1.0, brush: 'pencil' })
  );

  // Monferno head contours & ears
  commands.push(
    makeStroke('monferno', smoothCurve([[432, 436], [424, 432], [422, 442], [430, 444]]), { color: '#1e1b18', size: 3.2, opacity: 1.0, brush: 'pencil' }), // left ear
    makeStroke('monferno', smoothCurve([[458, 434], [466, 430], [468, 440], [460, 442]]), { color: '#1e1b18', size: 3.2, opacity: 1.0, brush: 'pencil' }), // right ear
    makeStroke('monferno', smoothCurve([[442, 424], [445, 418], [448, 424]]), { color: '#1e1b18', size: 3.0, opacity: 1.0, brush: 'pencil' }) // crown tuft
  );

  // Monferno tail flame vibrant enhancement
  commands.push(
    // Inner bright yellow flame
    makeStroke('monferno', smoothCurve([[568, 410], [564, 396], [572, 384], [578, 394], [576, 412]]), { color: '#fde047', size: 4.5, opacity: 1.0, brush: 'brush' }),
    // Outer fiery tips
    makeStroke('monferno', smoothCurve([[564, 414], [556, 398], [566, 382], [576, 374], [584, 386], [588, 405], [576, 418]]), { color: '#ea580c', size: 3.0, opacity: 1.0, brush: 'pencil' }),
    makeStroke('monferno', smoothCurve([[574, 380], [578, 368], [580, 380]]), { color: '#f97316', size: 2.5, opacity: 1.0, brush: 'pencil' })
  );

  // Comical dizzy swirl stars over Monferno
  const stars = [
    smoothCurve([[438, 418], [444, 422], [440, 426], [436, 420]]),
    smoothCurve([[452, 414], [458, 418], [454, 422], [450, 416]]),
    smoothCurve([[464, 416], [470, 420], [466, 424], [462, 418]]),
  ];
  for (const pts of stars) {
    commands.push(makeStroke('monferno', pts, { color: '#eab308', size: 2.5, opacity: 1.0, brush: 'pencil' }));
  }

  // Ground shadow under Monferno
  commands.push(
    makeStroke('monferno', [[420, 464], [530, 464]], { color: '#3d342d', size: 4.0, opacity: 0.45, brush: 'pencil' }),
    makeStroke('monferno', [[430, 466], [520, 466]], { color: '#3d342d', size: 2.5, opacity: 0.35, brush: 'pencil' })
  );

  // 2. REFINED LUCAS (LEFT TRAINER) DETAILS
  // Spiky anime hair tufts - deep charcoal building volume
  const extraHair = [
    smoothCurve([[205, 230], [186, 218], [198, 204]]),
    smoothCurve([[198, 204], [182, 190], [196, 178]]),
    smoothCurve([[196, 178], [188, 158], [206, 150]]),
    smoothCurve([[206, 150], [210, 134], [228, 132]]),
    smoothCurve([[228, 132], [240, 126], [254, 136]]),
    smoothCurve([[254, 136], [272, 132], [284, 146]]),
    smoothCurve([[284, 146], [302, 154], [296, 170]]),
    smoothCurve([[296, 170], [314, 180], [302, 194]]),
    smoothCurve([[302, 194], [318, 204], [298, 216]]),
    // Internal hair locks
    smoothCurve([[220, 145], [226, 175]]),
    smoothCurve([[245, 138], [248, 180]]),
    smoothCurve([[265, 148], [264, 190]]),
    smoothCurve([[285, 158], [282, 196]]),
  ];
  for (const pts of extraHair) {
    commands.push(makeStroke('characters', pts, { color: '#0f172a', size: 3.5, opacity: 1.0, brush: 'pencil' }));
  }

  // Lucas glasses bold frame & fierce side-glare eye
  commands.push(
    makeStroke('characters', smoothCurve([[284, 214], [316, 218], [314, 236], [284, 232], [284, 214]]), { color: '#09090b', size: 3.8, opacity: 1.0, brush: 'pencil' }),
    makeStroke('characters', [[284, 222], [266, 228]], { color: '#09090b', size: 3.2, opacity: 1.0, brush: 'pencil' }), // temple arm
    makeStroke('characters', [[292, 224], [298, 226]], { color: '#09090b', size: 3.5, opacity: 1.0, brush: 'pencil' }), // dark pupil glare
    makeStroke('characters', [[286, 218], [300, 222]], { color: '#09090b', size: 3.6, opacity: 1.0, brush: 'pencil' })  // heavy angry brow
  );

  // Clenched teeth highlight
  commands.push(
    makeStroke('characters', [[284, 244], [288, 244]], { color: '#ffffff', size: 3.0, opacity: 1.0, brush: 'pencil' }),
    makeStroke('characters', [[283, 244], [289, 245]], { color: '#09090b', size: 2.2, opacity: 1.0, brush: 'pencil' })
  );

  // Lucas Hoodie bunched folds & collar
  const hoodFolds = [
    smoothCurve([[184, 290], [202, 308], [236, 312], [270, 298]]),
    smoothCurve([[190, 278], [222, 292], [266, 282]]),
    smoothCurve([[210, 308], [218, 324], [236, 322], [240, 310]]),
    smoothCurve([[170, 328], [185, 340], [180, 360]]), // left shoulder fold
    smoothCurve([[265, 328], [250, 340], [252, 360]]), // right shoulder fold
  ];
  for (const pts of hoodFolds) {
    commands.push(makeStroke('characters', pts, { color: '#1e293b', size: 3.4, opacity: 1.0, brush: 'pencil' }));
  }

  // Backpack Pokeball details & straps
  commands.push(
    // Deep black dividing line across Pokeball
    makeStroke('characters', [[138, 376], [226, 376]], { color: '#09090b', size: 4.5, opacity: 1.0, brush: 'pencil' }),
    // Outer Pokeball rim bolding
    makeStroke('characters', smoothCurve([[140, 360], [138, 376], [144, 400], [160, 416], [182, 420], [204, 416], [220, 400], [226, 376], [224, 360]]), { color: '#09090b', size: 3.8, opacity: 1.0, brush: 'pencil' }),
    // Center button white highlight
    { type: 'ellipse', layer: 'characters', x: 178, y: 372, width: 8, height: 8, color: '#ffffff', opacity: 1.0 }
  );

  // Clenched fists muscle tension
  commands.push(
    // Left fist knuckle lines
    makeStroke('characters', [[115, 434], [122, 432]], { color: '#09090b', size: 2.8, opacity: 1.0, brush: 'pencil' }),
    makeStroke('characters', [[122, 432], [130, 432]], { color: '#09090b', size: 2.8, opacity: 1.0, brush: 'pencil' }),
    makeStroke('characters', [[130, 432], [138, 435]], { color: '#09090b', size: 2.8, opacity: 1.0, brush: 'pencil' }),
    // Right fist knuckle lines
    makeStroke('characters', [[316, 434], [324, 432]], { color: '#09090b', size: 2.8, opacity: 1.0, brush: 'pencil' }),
    makeStroke('characters', [[324, 432], [332, 432]], { color: '#09090b', size: 2.8, opacity: 1.0, brush: 'pencil' }),
    makeStroke('characters', [[332, 432], [342, 435]], { color: '#09090b', size: 2.8, opacity: 1.0, brush: 'pencil' })
  );

  // Popping vein '#' in bright angry red with white tick highlight
  commands.push(
    makeStroke('shading', [[266, 172], [284, 172]], { color: '#dc2626', size: 4.2, opacity: 1.0, brush: 'pencil' }),
    makeStroke('shading', [[266, 182], [284, 182]], { color: '#dc2626', size: 4.2, opacity: 1.0, brush: 'pencil' }),
    makeStroke('shading', [[270, 168], [270, 188]], { color: '#dc2626', size: 4.2, opacity: 1.0, brush: 'pencil' }),
    makeStroke('shading', [[278, 168], [278, 188]], { color: '#dc2626', size: 4.2, opacity: 1.0, brush: 'pencil' }),
    makeStroke('shading', [[272, 174], [276, 174]], { color: '#ffffff', size: 2.2, opacity: 1.0, brush: 'pencil' })
  );

  // Extra sweat drops
  commands.push(
    makeStroke('shading', smoothCurve([[318, 152], [326, 146], [324, 140], [318, 152]]), { color: '#38bdf8', size: 2.8, opacity: 1.0, brush: 'pencil' }),
    makeStroke('shading', smoothCurve([[330, 172], [338, 168], [336, 162], [330, 172]]), { color: '#38bdf8', size: 2.8, opacity: 1.0, brush: 'pencil' })
  );

  // 3. REFINED ROARK (RIGHT TRAINER) DETAILS
  // Miner helmet rim & crest bolding
  commands.push(
    makeStroke('characters', smoothCurve([[680, 154], [706, 150], [742, 148], [774, 146], [788, 150]]), { color: '#09090b', size: 4.2, opacity: 1.0, brush: 'pencil' }),
    makeStroke('characters', smoothCurve([[684, 152], [696, 116], [724, 94], [754, 102], [780, 130], [786, 150]]), { color: '#09090b', size: 4.2, opacity: 1.0, brush: 'pencil' }),
    makeStroke('characters', smoothCurve([[724, 94], [730, 115], [734, 148]]), { color: '#09090b', size: 3.5, opacity: 1.0, brush: 'pencil' })
  );

  // Headlamp fixture rim & bright brass reflector
  const lampRim = [];
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    lampRim.push([706 + Math.cos(a) * 13, 126 + Math.sin(a) * 13]);
  }
  commands.push(
    makeStroke('characters', lampRim, { color: '#09090b', size: 4.0, opacity: 1.0, brush: 'pencil' }),
    makeStroke('characters', [[703, 126], [709, 126]], { color: '#f59e0b', size: 3.2, opacity: 1.0, brush: 'pencil' }),
    makeStroke('characters', [[706, 123], [706, 129]], { color: '#f59e0b', size: 3.2, opacity: 1.0, brush: 'pencil' })
  );

  // Roark spiky messy bangs under helmet
  const bangs = [
    smoothCurve([[704, 150], [708, 170], [714, 152]]),
    smoothCurve([[714, 152], [722, 174], [728, 152]]),
    smoothCurve([[728, 152], [738, 170], [746, 150]]),
    smoothCurve([[764, 148], [770, 178], [774, 150]]),
  ];
  for (const pts of bangs) {
    commands.push(makeStroke('characters', pts, { color: '#1e293b', size: 3.8, opacity: 1.0, brush: 'pencil' }));
  }

  // Roark smug smirk & cocky half-lidded eyes bolding
  commands.push(
    // Smug horizontal half-lidded eyes
    makeStroke('characters', smoothCurve([[715, 166], [727, 164]]), { color: '#09090b', size: 3.8, opacity: 1.0, brush: 'pencil' }),
    makeStroke('characters', smoothCurve([[737, 163], [749, 162]]), { color: '#09090b', size: 3.8, opacity: 1.0, brush: 'pencil' }),
    // Sly pupils looking down-left
    makeStroke('characters', [[720, 167], [722, 167]], { color: '#09090b', size: 4.0, opacity: 1.0, brush: 'pencil' }),
    makeStroke('characters', [[742, 165], [744, 165]], { color: '#09090b', size: 4.0, opacity: 1.0, brush: 'pencil' }),
    // Raised cocky right eyebrow
    makeStroke('characters', smoothCurve([[735, 154], [746, 150], [754, 155]]), { color: '#09090b', size: 3.5, opacity: 1.0, brush: 'pencil' }),
    // Relaxed left eyebrow
    makeStroke('characters', smoothCurve([[715, 158], [727, 158]]), { color: '#09090b', size: 3.0, opacity: 1.0, brush: 'pencil' }),
    // SMUG SMIRK (bold curve up into cheek)
    makeStroke('characters', smoothCurve([[724, 184], [736, 184], [752, 174]]), { color: '#09090b', size: 3.8, opacity: 1.0, brush: 'pencil' }),
    makeStroke('characters', [[750, 172], [754, 176]], { color: '#09090b', size: 3.2, opacity: 1.0, brush: 'pencil' })
  );

  // Sparkle glint `✦` near smirk with white center
  commands.push(
    makeStroke('shading', [[646, 166], [670, 166]], { color: '#09090b', size: 3.5, opacity: 1.0, brush: 'pencil' }),
    makeStroke('shading', [[658, 154], [658, 178]], { color: '#09090b', size: 3.5, opacity: 1.0, brush: 'pencil' }),
    makeStroke('shading', [[654, 162], [662, 170]], { color: '#09090b', size: 2.5, opacity: 1.0, brush: 'pencil' }),
    makeStroke('shading', [[662, 162], [654, 170]], { color: '#09090b', size: 2.5, opacity: 1.0, brush: 'pencil' })
  );

  // Roark Left Gesturing Arm & open fingers
  const gesturingHand = [
    smoothCurve([[648, 236], [624, 238], [620, 246], [638, 252]]), // index
    smoothCurve([[638, 252], [622, 254], [626, 260], [644, 258]]), // middle
    smoothCurve([[644, 258], [630, 264], [636, 268], [646, 262]]), // ring
    smoothCurve([[656, 254], [648, 245], [654, 238], [648, 236]]), // thumb
  ];
  for (const pts of gesturingHand) {
    commands.push(makeStroke('characters', pts, { color: '#09090b', size: 3.2, opacity: 1.0, brush: 'pencil' }));
  }

  // 4. SPEECH BUBBLE BOLDING & TEXT CRISPNESS
  // Reinforce text strokes for maximum readability
  // Lines:
  // "I can SEE"
  // "the sweat pouring"
  // "out of your"
  // "pokeballs bro"
  // Re-run the lettering pass with rich dark ink for crisp hand-drawn comic lettering
  commands.push(
    // Bubble outline crisp reinforcement
    makeStroke('speech', smoothCurve([
      [420, 26], [555, 24], [690, 26], [705, 42],
      [708, 80], [704, 120], [688, 132],
      [680, 132], [730, 178], [664, 136],
      [555, 138], [420, 138], [406, 122],
      [404, 80], [406, 42], [420, 26]
    ]), { color: '#0f172a', size: 3.5, opacity: 1.0, brush: 'pencil' })
  );

  return commands;
}

const refCommands = generateRefinementCommands();
console.log(`Generated ${refCommands.length} refinement commands.`);

const BATCH_SIZE = 18;
const refBatches = [];
for (let i = 0; i < refCommands.length; i += BATCH_SIZE) {
  refBatches.push(refCommands.slice(i, i + BATCH_SIZE));
}

for (let i = 0; i < refBatches.length; i++) {
  const filename = `artifacts/tumblr-batches/refine-${String(i + 1).padStart(2, '0')}.json`;
  writeFileSync(filename, JSON.stringify(refBatches[i], null, 2));
}

writeFileSync('artifacts/tumblr-refinement-all.json', JSON.stringify(refCommands, null, 2));
console.log(`Saved ${refBatches.length} refinement batches.`);
