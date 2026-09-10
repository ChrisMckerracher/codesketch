import fs from 'node:fs';

// Helper: Catmull-Rom spline interpolation
function catmullRom(pts, segments = 5) {
  if (pts.length < 2) return pts;
  if (pts.length === 2) {
    const res = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      res.push([
        pts[0][0] + (pts[1][0] - pts[0][0]) * t,
        pts[0][1] + (pts[1][1] - pts[0][1]) * t
      ]);
    }
    return res;
  }
  const result = [];
  const p = [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 1; i < p.length - 2; i++) {
    const p0 = p[i - 1], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2];
    for (let t = 0; t <= segments; t++) {
      if (i > 1 && t === 0) continue;
      const t1 = t / segments;
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
      result.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
    }
  }
  return result;
}

function jitter(pts, intensity) {
  if (intensity <= 0) return pts;
  return pts.map(([x, y], i) => {
    const jx = Math.sin(x * 13.1 + y * 23.3 + i * 7.1) * intensity;
    const jy = Math.cos(x * 17.7 + y * 19.1 + i * 5.3) * intensity;
    return [Math.round((x + jx) * 10) / 10, Math.round((y + jy) * 10) / 10];
  });
}

function pencil(layer, ctrlPts, { color = '#2b2016', size = 2.4, opacity = 0.88, wobble = 0.1, smoothSegs = 6 } = {}) {
  const smooth = jitter(catmullRom(ctrlPts, smoothSegs), wobble);
  return { type: 'stroke', layer, brush: 'pencil', color, size, opacity, points: smooth };
}

function circlePts(cx, cy, r, segments = 32) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

function arcPts(cx, cy, r, startAngle, endAngle, segments = 16) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = startAngle + (i / segments) * (endAngle - startAngle);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

// Generate diagonal hatch strokes bridging two lines
function hatch(layer, p1Start, p1End, p2Start, p2End, count, { color = '#4a3d30', size = 1.4, opacity = 0.35, wobble = 0.1 } = {}) {
  const cmds = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const x1 = p1Start[0] + (p1End[0] - p1Start[0]) * t;
    const y1 = p1Start[1] + (p1End[1] - p1Start[1]) * t;
    const x2 = p2Start[0] + (p2End[0] - p2Start[0]) * t;
    const y2 = p2Start[1] + (p2End[1] - p2Start[1]) * t;
    // slightly randomize endpoints for organic feel
    const ox1 = x1 + (Math.random() - 0.5) * 2;
    const oy1 = y1 + (Math.random() - 0.5) * 2;
    const ox2 = x2 + (Math.random() - 0.5) * 2;
    const oy2 = y2 + (Math.random() - 0.5) * 2;
    cmds.push(pencil(layer, [[ox1, oy1], [ox2, oy2]], { color, size, opacity, wobble, smoothSegs: 1 }));
  }
  return cmds;
}

export function generate() {
  const commands = [];
  commands.push({ type: 'fill', color: '#f8f5ee' });

  // 1. ARMATURE (Faint skeleton, NO face crosshairs)
  commands.push({ type: 'layer.add', id: 'armature', name: 'Armature' });
  const fStyle = { color: '#b5a99d', size: 1.2, opacity: 0.15, wobble: 0.2 };
  // Head oval
  commands.push(pencil('armature', circlePts(465, 145, 45, 24), fStyle));
  // Line of action (spine)
  commands.push(pencil('armature', [[465, 190], [455, 300], [455, 400]], fStyle));
  // Shoulders & Pelvis
  commands.push(pencil('armature', [[410, 240], [530, 220]], fStyle));
  commands.push(pencil('armature', [[420, 395], [510, 385]], fStyle));
  // Limbs
  commands.push(pencil('armature', [[530, 220], [570, 180], [620, 115]], fStyle)); // Left arm
  commands.push(pencil('armature', [[410, 240], [360, 280], [350, 245]], fStyle)); // Right arm
  commands.push(pencil('armature', [[420, 395], [380, 490], [375, 580]], fStyle)); // Right leg
  commands.push(pencil('armature', [[510, 385], [570, 480], [600, 580]], fStyle)); // Left leg

  // 2. CONTOURS (Bold, continuous, overlapping anatomy)
  commands.push({ type: 'layer.add', id: 'contours', name: 'Contours' });
  const pMain = (pts, s = 2.8, op = 0.92) => pencil('contours', pts, { color: '#241b14', size: s, opacity: op, wobble: 0.08 });
  const pBold = (pts, s = 3.6, op = 0.96) => pencil('contours', pts, { color: '#160e08', size: s, opacity: op, wobble: 0.05 });
  const pFine = (pts, s = 2.0, op = 0.85) => pencil('contours', pts, { color: '#241b14', size: s, opacity: op, wobble: 0.05 });

  // FACE & HEAD -------------------------------------------------------------
  // Cap dome
  commands.push(pMain([[420, 145], [435, 115], [465, 100], [500, 110], [525, 135]], 3.2));
  commands.push(pMain(circlePts(465, 98, 4, 12), 2.2)); // Button
  commands.push(pMain([[465, 98], [455, 145]], 2.0)); // Seam
  commands.push(pMain([[465, 98], [510, 128]], 2.0)); // Seam
  
  // Visor (curved forward and slightly right)
  commands.push(pBold([[420, 145], [450, 140], [490, 143], [525, 153]]));
  commands.push(pMain([[420, 145], [440, 155], [480, 158], [520, 155], [525, 153]], 3.0));
  commands.push(pFine([[430, 153], [480, 155], [515, 151]])); // Visor thickness
  
  // Cap logo arch
  commands.push(pMain(arcPts(468, 138, 10, 1.1*Math.PI, 1.9*Math.PI), 2.5));
  commands.push(pMain([[460, 138], [476, 138]], 2.5));
  commands.push(pMain(arcPts(468, 138, 4, Math.PI, 2*Math.PI), 2.0));

  // Hair (Flowing spikes, no jagged sawteeth)
  // Front bangs
  commands.push(pBold([[435, 145], [445, 160], [452, 145]]));
  commands.push(pBold([[455, 143], [465, 165], [475, 145]]));
  commands.push(pBold([[478, 145], [490, 162], [498, 148]]));
  // Left side (viewer's left)
  commands.push(pBold([[420, 145], [390, 155], [410, 165]]));
  commands.push(pBold([[410, 165], [385, 180], [408, 190]]));
  commands.push(pBold([[408, 190], [395, 205], [415, 208]]));
  commands.push(pMain([[415, 208], [410, 218], [425, 212]], 2.5));
  // Right side (viewer's right, behind ear/neck)
  commands.push(pBold([[525, 145], [550, 155], [532, 170]]));
  commands.push(pBold([[532, 170], [560, 185], [540, 200]]));
  commands.push(pBold([[540, 200], [555, 215], [530, 225]]));

  // Face outline (Clean, curved jaw)
  commands.push(pMain([[418, 170], [410, 185], [420, 195], [428, 200]], 2.5)); // Ear
  commands.push(pFine([[418, 182], [422, 190]])); // Inner ear
  commands.push(pMain([[428, 200], [445, 218], [462, 225], [485, 215], [505, 195]], 3.2)); // Jawline

  // Eyes (Classic anime, bold upper lashes, rounded pupils)
  // Left eye (viewer's left)
  commands.push(pBold([[430, 170], [445, 162], [458, 168]])); // Upper lash
  commands.push(pMain([[432, 172], [436, 183], [455, 183], [458, 170]], 2.2)); // Socket
  commands.push(pBold([[430, 158], [445, 153], [458, 156]])); // Eyebrow
  commands.push(pencil('contours', [[446, 178], [444, 166], [452, 166], [454, 178]], { color: '#241a12', size: 5, opacity: 0.95 })); // Iris fill
  commands.push(pFine([[448, 168], [448, 168]], 4.0)); // Pupil highlight (white simulated by empty space or just small dot)
  // White catchlight dot
  commands.push(pencil('contours', [[446, 168], [446, 168]], { color: '#ffffff', size: 4, opacity: 1 }));
  
  // Right eye (viewer's right, 3/4 perspective)
  commands.push(pBold([[475, 168], [488, 162], [502, 168]])); // Upper lash
  commands.push(pMain([[477, 170], [480, 183], [498, 183], [502, 170]], 2.2)); // Socket
  commands.push(pBold([[475, 155], [490, 155], [505, 160]])); // Eyebrow
  commands.push(pencil('contours', [[488, 178], [486, 166], [494, 166], [496, 178]], { color: '#241a12', size: 5, opacity: 0.95 })); // Iris fill
  commands.push(pencil('contours', [[488, 168], [488, 168]], { color: '#ffffff', size: 4, opacity: 1 }));

  // Nose & Mouth (Cheerful expression)
  commands.push(pFine([[464, 178], [466, 185], [463, 187]], 2.5)); // Nose
  commands.push(pBold([[450, 198], [465, 196], [475, 198]])); // Upper lip
  commands.push(pBold([[450, 198], [458, 215], [465, 218], [472, 212], [475, 198]])); // Open mouth
  commands.push(pFine([[453, 202], [473, 202]])); // Teeth line
  commands.push(pFine([[457, 213], [465, 210], [470, 213]])); // Tongue curve
  
  // Cheek zigzags (Z marks)
  commands.push(pMain([[428, 188], [435, 192], [428, 197], [436, 201]], 2.5));
  commands.push(pMain([[492, 190], [500, 194], [493, 199], [501, 203]], 2.5));

  // TORSO & NECK ------------------------------------------------------------
  // Neck & undershirt collar
  commands.push(pMain([[442, 222], [440, 245]]));
  commands.push(pMain([[476, 220], [480, 245]]));
  commands.push(pMain([[440, 245], [460, 255], [480, 245]], 3.0)); // Dark collar base
  
  // White lapels (collars of vest)
  commands.push(pBold([[435, 230], [412, 250], [432, 270], [442, 250]])); // Left lapel
  commands.push(pBold([[485, 230], [512, 245], [488, 270], [478, 250]])); // Right lapel

  // Blue Vest Body
  commands.push(pBold([[435, 230], [395, 250]])); // Left shoulder seam
  commands.push(pBold([[485, 230], [530, 215]])); // Right shoulder seam connecting to raised arm
  // Left vest panel (viewer's left)
  commands.push(pBold([[432, 270], [428, 325], [415, 385]])); // Inner edge
  commands.push(pBold([[388, 275], [382, 330], [402, 388]])); // Outer edge
  commands.push(pBold([[402, 388], [415, 385]])); // Hem
  // Right vest panel (viewer's right) - Dynamically fluttering outward
  commands.push(pBold([[488, 270], [500, 325], [525, 378]])); // Inner edge
  commands.push(pBold([[530, 245], [565, 290], [575, 330], [565, 380]])); // Fluttering outer edge
  commands.push(pBold([[525, 378], [545, 382], [565, 380]])); // Fluttering hem
  // Inside lining of fluttered vest
  commands.push(pFine([[500, 325], [530, 350], [550, 375]]));
  // Pocket & buttons
  commands.push(pMain([[495, 340], [525, 345], [524, 350], [494, 345], [495, 340]])); // Yellow pocket welt
  commands.push(pMain(circlePts(438, 290, 4), 2.5)); // Snap 1
  commands.push(pMain(circlePts(482, 290, 4), 2.5)); // Snap 2

  // Visible undershirt down to belt
  commands.push(pFine([[435, 290], [430, 385]]));
  commands.push(pFine([[485, 290], [490, 380]]));

  // Belt & Buckle
  commands.push(pBold([[405, 385], [460, 390], [520, 385]])); // Top belt edge
  commands.push(pBold([[405, 400], [460, 405], [520, 400]])); // Bottom belt edge
  commands.push(pBold([[446, 387], [472, 387], [472, 403], [446, 403], [446, 387]])); // Buckle outer
  commands.push(pMain([[452, 390], [466, 390], [466, 400], [452, 400], [452, 390]])); // Buckle inner
  commands.push(pMain([[425, 386], [425, 401]], 2.5)); // Belt loop
  commands.push(pMain([[495, 386], [495, 401]], 2.5)); // Belt loop

  // ARMS & HANDS ------------------------------------------------------------
  // Right Arm (viewer's left) - Clenched fist
  // White sleeve covering shoulder
  commands.push(pMain([[395, 250], [378, 265], [375, 275]], 3.0));
  commands.push(pMain([[410, 260], [395, 278], [375, 275]], 3.0));
  // Forearm extending from sleeve, bending up at elbow
  commands.push(pBold([[375, 275], [352, 285], [342, 295]])); // Outer elbow
  commands.push(pBold([[342, 295], [338, 275], [340, 248]])); // Outer forearm
  commands.push(pBold([[395, 278], [375, 285], [365, 265], [362, 246]])); // Inner forearm
  // Glove cuff (thick rolled band)
  commands.push(pBold([[340, 248], [352, 250], [362, 246]]));
  commands.push(pMain([[338, 252], [352, 255], [364, 250]], 2.5));
  // Clenched Fist (Solid overlapping knuckles, not a blob)
  commands.push(pBold([[362, 246], [370, 235], [368, 226]])); // Palm heel
  // Knuckles arc
  commands.push(pBold([[335, 230], [345, 220], [356, 222], [368, 226]]));
  // Folded fingers lines
  commands.push(pMain([[335, 230], [340, 240], [348, 242]])); // Index
  commands.push(pMain([[345, 220], [350, 236], [356, 240]])); // Middle
  commands.push(pMain([[356, 222], [360, 235], [364, 238]])); // Ring
  // Thumb crossing over
  commands.push(pBold([[335, 246], [336, 236], [342, 238], [354, 238]]));

  // Left Arm (viewer's right) - Hero arm holding Poké Ball
  // Flared white sleeve opening around arm base
  commands.push(pBold([[530, 215], [546, 206], [556, 202]])); // Top sleeve contour
  commands.push(pBold([[528, 238], [540, 230], [550, 222]])); // Bottom sleeve contour
  commands.push(pMain([[556, 202], [554, 212], [550, 222]])); // Cuff ellipse
  // Continuous upper arm & deltoid
  commands.push(pBold([[556, 202], [576, 172]])); // Outer upper arm
  commands.push(pBold([[550, 222], [568, 192], [580, 178]])); // Inner bicep/tricep
  // Forearm angling up to ball
  commands.push(pBold([[576, 172], [600, 140], [620, 110]])); // Outer forearm
  commands.push(pBold([[580, 178], [610, 146], [630, 120]])); // Inner forearm
  // Glove cuff (thick rolled band at wrist)
  commands.push(pBold([[620, 110], [625, 115], [630, 120]]));
  commands.push(pMain([[616, 113], [622, 118], [627, 123]], 2.5));

  // Poké Ball (Drawn before fingers so fingers overlap cleanly!)
  // Perfect circle
  commands.push(pBold(circlePts(645, 78, 28), 3.8));
  // Equator band
  commands.push(pBold([[618, 76], [645, 76], [673, 80]], 3.2));
  commands.push(pBold([[618, 80], [645, 80], [673, 84]], 3.2));
  // Button
  commands.push(pBold(circlePts(645, 79, 8.5), 3.2));
  commands.push(pMain(circlePts(645, 79, 4.5), 2.5));
  commands.push(pMain(circlePts(645, 79, 2.0), 2.0));
  // Specular highlight arc
  commands.push(pencil('contours', arcPts(645, 78, 24, 1.15*Math.PI, 1.6*Math.PI), { color: '#ffffff', size: 3.5, opacity: 0.95 }));

  // Grasping Hand (Overlapping the ball with clear finger volume)
  commands.push(pBold([[630, 120], [638, 112], [644, 102]])); // Palm heel behind ball
  // Thumb (grips bottom-left)
  commands.push(pBold([[620, 110], [622, 98], [626, 88], [632, 82]]));
  commands.push(pMain([[628, 92], [634, 84]])); // Thumb inner pad
  // Index finger (arches over top-left)
  commands.push(pBold([[626, 94], [628, 76], [634, 60], [642, 54]]));
  commands.push(pMain([[632, 62], [640, 56], [644, 60]])); // Pad thickness
  // Middle finger (arches over apex)
  commands.push(pBold([[634, 98], [638, 70], [646, 52], [654, 52]]));
  commands.push(pMain([[644, 54], [652, 54], [656, 58]])); // Pad thickness
  // Ring finger (arches over top-right)
  commands.push(pBold([[640, 100], [650, 72], [660, 60], [666, 64]]));
  // Pinky finger (curls along right flank)
  commands.push(pBold([[644, 102], [658, 76], [668, 78]]));
  // Glove finger seams (where green fabric ends and skin begins)
  commands.push(pFine([[624, 92], [629, 94]])); // Thumb seam
  commands.push(pFine([[629, 72], [635, 74]])); // Index seam
  commands.push(pFine([[640, 66], [646, 68]])); // Middle seam

  // LEGS & SNEAKERS ---------------------------------------------------------
  // Crotch and Fly
  commands.push(pBold([[444, 401], [444, 428], [440, 440]])); // Fly seam
  commands.push(pFine([[444, 412], [450, 424], [444, 434]])); // Fly placket curve
  commands.push(pFine([[398, 396], [406, 408], [414, 418]])); // Right pocket
  commands.push(pFine([[482, 394], [476, 406], [466, 416]])); // Left pocket

  // Right Leg (Weight-bearing forward stance, viewer's left)
  // Continuous outer hip to calf contour
  commands.push(pBold([[390, 388], [378, 435], [368, 480], [362, 520], [356, 554]]));
  // Inseam contour
  commands.push(pBold([[440, 440], [426, 480], [416, 520], [410, 554]]));
  // Organic denim knee folds
  commands.push(pFine([[366, 492], [386, 496], [418, 492]]));
  commands.push(pFine([[364, 508], [384, 512], [414, 508]]));
  // Cylindrical rolled cuff wrapping ankle
  commands.push(pBold([[356, 554], [383, 557], [410, 554]])); // Top ellipse
  commands.push(pBold([[356, 568], [383, 571], [410, 568]])); // Bottom ellipse
  commands.push(pBold([[356, 554], [356, 568]])); // Outer side
  commands.push(pBold([[410, 554], [410, 568]])); // Inner side
  commands.push(pFine([[358, 566], [383, 569], [408, 566]])); // Hem thickness

  // Right Ankle connecting continuously into Sneaker collar
  // Ankle lines emerge from INSIDE the cuff
  commands.push(pMain([[362, 568], [366, 584]])); // Outer ankle
  commands.push(pMain([[404, 568], [396, 584]])); // Inner ankle
  // Sneaker collar rim wrapping ankle
  commands.push(pBold([[366, 584], [381, 587], [396, 584]])); 

  // Right Sneaker (Dynamic 3/4 Frontal profile)
  commands.push(pBold([[318, 630], [357, 630], [396, 630]])); // Flat sole bottom
  commands.push(pBold([[318, 623], [357, 623], [396, 623]])); // Midsole line
  commands.push(pFine([[338, 630], [338, 623]])); // Tread 1
  commands.push(pFine([[358, 630], [358, 623]])); // Tread 2
  commands.push(pFine([[378, 630], [378, 623]])); // Tread 3
  // White rubber toe cap
  commands.push(pBold([[318, 623], [324, 610], [338, 604], [350, 606], [350, 623]]));
  // Tongue/instep rising to collar
  commands.push(pBold([[350, 606], [360, 592], [370, 582]]));
  // Laces (criss-cross)
  commands.push(pMain([[350, 604], [360, 596]]));
  commands.push(pMain([[360, 604], [350, 596]]));
  commands.push(pMain([[356, 594], [366, 586]]));
  commands.push(pMain([[366, 594], [356, 586]]));
  // Side wave panel & badge
  commands.push(pBold([[350, 614], [370, 606], [392, 620]]));
  commands.push(pMain(circlePts(380, 598, 5, 12), 2.2));
  // Heel counter
  commands.push(pBold([[396, 630], [394, 606], [396, 584]]));

  // Left Leg (Outstretched dynamic kick, viewer's right)
  commands.push(pBold([[516, 382], [540, 430], [572, 485], [602, 535], [622, 570]])); // Outer contour
  commands.push(pBold([[440, 440], [484, 480], [526, 525], [560, 564], [578, 584]])); // Inseam contour
  // Action tension folds radiating from crotch stretch
  commands.push(pFine([[450, 448], [487, 474], [520, 498]]));
  commands.push(pFine([[480, 484], [518, 514], [546, 536]]));
  commands.push(pFine([[567, 494], [584, 510], [596, 528]])); // Knee fold
  // Cylindrical rolled cuff at angle
  commands.push(pBold([[578, 584], [600, 578], [622, 570]])); // Top ellipse
  commands.push(pBold([[578, 596], [600, 590], [622, 582]])); // Bottom ellipse
  commands.push(pBold([[578, 584], [578, 596]])); // Outer side
  commands.push(pBold([[622, 570], [622, 582]])); // Inner side

  // Left Ankle & Sneaker Connection
  // Ankle emerging from cuff seamlessly
  commands.push(pMain([[582, 596], [572, 614]])); // Heel ankle line
  commands.push(pMain([[616, 583], [610, 604]])); // Front ankle line
  // Sneaker collar rim
  commands.push(pBold([[572, 614], [590, 608], [610, 604]]));

  // Left Sneaker (Dynamic profile / 3/4 stride view)
  // Firmly planted angled sole
  commands.push(pBold([[548, 650], [588, 658], [634, 666]])); // Sole bottom
  commands.push(pBold([[548, 644], [588, 652], [634, 660]])); // Midsole line
  commands.push(pFine([[568, 648], [568, 642]])); // Tread
  commands.push(pFine([[598, 654], [598, 648]])); // Tread
  // Toe cap
  commands.push(pBold([[634, 660], [630, 646], [618, 644], [618, 656]]));
  // Tongue/instep and laces
  commands.push(pBold([[618, 644], [604, 626], [590, 608]]));
  commands.push(pMain([[586, 614], [596, 622]]));
  commands.push(pMain([[596, 614], [586, 622]]));
  commands.push(pMain([[598, 624], [608, 632]]));
  commands.push(pMain([[608, 624], [598, 632]]));
  // Side wave and badge
  commands.push(pBold([[556, 634], [584, 626], [612, 642]]));
  commands.push(pMain(circlePts(574, 620, 5, 12), 2.2));
  // Heel counter
  commands.push(pBold([[548, 650], [550, 632], [572, 614]]));

  // 3. SHADING (Controlled, deliberate hatch marks)
  commands.push({ type: 'layer.add', id: 'shading', name: 'Shading' });
  
  // Cast shadows
  // Under visor (soft horizontal-diagonal strokes)
  commands.push(...hatch('shading', [438, 148], [512, 150], [442, 158], [508, 160], 12, { color: '#4a3d30', size: 1.5, opacity: 0.35 }));
  // Under chin / on neck
  commands.push(...hatch('shading', [445, 226], [478, 226], [445, 240], [478, 240], 9, { color: '#4a3d30', size: 1.5, opacity: 0.4 }));
  
  // Depth tones (using closer hatching)
  // Mouth interior
  commands.push(...hatch('shading', [455, 202], [470, 202], [460, 210], [468, 210], 8, { color: '#241a12', size: 2.0, opacity: 0.8 }));
  // Undershirt depth tone (filling the V-neck cleanly)
  commands.push(...hatch('shading', [442, 260], [486, 260], [438, 310], [490, 310], 18, { color: '#3a2d22', size: 1.8, opacity: 0.4 }));
  commands.push(...hatch('shading', [435, 310], [492, 310], [430, 382], [492, 382], 20, { color: '#3a2d22', size: 1.8, opacity: 0.4 }));
  
  // Shadow inside fluttering right vest panel
  commands.push(...hatch('shading', [502, 325], [530, 325], [546, 370], [558, 370], 14, { color: '#4a3d30', size: 1.6, opacity: 0.35 }));

  // Shadow on fist palm
  commands.push(...hatch('shading', [344, 230], [360, 230], [344, 240], [360, 240], 6, { color: '#4a3d30', size: 1.5, opacity: 0.35 }));

  // Denim folds shading
  commands.push(...hatch('shading', [424, 436], [438, 436], [418, 460], [432, 460], 6, { color: '#4a3d30', size: 1.5, opacity: 0.35 }));
  commands.push(...hatch('shading', [484, 470], [500, 470], [508, 495], [524, 495], 6, { color: '#4a3d30', size: 1.5, opacity: 0.35 }));

  // Poké Ball lower hemisphere shading (curving cross-hatch)
  commands.push(...hatch('shading', [626, 88], [662, 88], [636, 102], [652, 102], 8, { color: '#56483a', size: 1.6, opacity: 0.35 }));

  // Ground Contact Cast Shadows (Soft horizontal strokes anchoring the feet)
  // Right foot ground shadow
  commands.push(...hatch('shading', [320, 634], [400, 634], [340, 638], [380, 638], 4, { color: '#382a1e', size: 2.5, opacity: 0.4 }));
  commands.push(...hatch('shading', [330, 636], [390, 636], [350, 640], [370, 640], 3, { color: '#382a1e', size: 2.0, opacity: 0.3 }));
  // Left foot ground shadow
  commands.push(...hatch('shading', [540, 660], [640, 668], [560, 668], [620, 674], 5, { color: '#382a1e', size: 2.5, opacity: 0.4 }));
  commands.push(...hatch('shading', [550, 664], [630, 672], [570, 672], [610, 678], 4, { color: '#382a1e', size: 2.0, opacity: 0.3 }));

  return commands;
}

const commands = generate();
console.log("Coherent review sketch commands count:", commands.length);
let pts = 0;
for (const c of commands) if (c.points) pts += c.points.length;
console.log("Total points:", pts);

fs.writeFileSync('/tmp/codesketch-ash-art-p6lX49/coherent-sketch-commands.json', JSON.stringify(commands, null, 2));
