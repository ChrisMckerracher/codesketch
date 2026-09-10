import fs from 'node:fs';

const marks = [];
let layer = 'paint';
let seed = 937;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const ink = '#192731', paper = '#e9e4cb';

function L(id, name) {
  layer = id;
  marks.push({ type: 'layer.add', id, name });
}

function stroke(points, color = ink, width = 2, opacity = 1, brush = 'pencil') {
  points = points.map(([x, y]) => [+Math.max(1, Math.min(999, x)).toFixed(2), +Math.max(1, Math.min(699, y)).toFixed(2)]);
  if (points.length > 1) {
    marks.push({ type: 'stroke', layer, brush, size: brush === 'pencil' ? width / 0.35 : width, color, opacity, points });
  }
}

function path(s) {
  const t = s.match(/[MLQCZ]|-?\d*\.?\d+/g);
  let i = 0, p = [], cur = [0, 0], start;
  const pt = () => [+t[i++], +t[i++]];
  while (i < t.length) {
    let cmd = t[i++];
    if (cmd === 'M' || cmd === 'L') { cur = pt(); p.push(cur); start ??= cur; }
    else if (cmd === 'Q') {
      let a = cur, b = pt(), c = pt();
      for (let j = 1; j <= 16; j++) {
        let v = j / 16, u = 1 - v;
        p.push([u * u * a[0] + 2 * u * v * b[0] + v * v * c[0], u * u * a[1] + 2 * u * v * b[1] + v * v * c[1]]);
      }
      cur = c;
    } else if (cmd === 'C') {
      let a = cur, b = pt(), c = pt(), d = pt();
      for (let j = 1; j <= 20; j++) {
        let v = j / 20, u = 1 - v;
        p.push([u * u * u * a[0] + 3 * u * u * v * b[0] + 3 * u * v * v * c[0] + v * v * v * d[0], u * u * u * a[1] + 3 * u * u * v * b[1] + 3 * u * v * v * c[1] + v * v * v * d[1]]);
      }
      cur = d;
    } else if (cmd === 'Z') { p.push(start); cur = start; }
  }
  return p;
}

const line = (s, c = ink, w = 2, o = 1) => {
  for (const sub of s.match(/M[^M]+/g) ?? []) stroke(path(sub), c, w, o);
};

function poly(p, c, outline = ink, w = 2) {
  if (typeof p === 'string') p = path(p);
  let chains = [], active = [];
  let lo = Math.max(2, Math.min(...p.map(a => a[1]))), hi = Math.min(698, Math.max(...p.map(a => a[1])));
  for (let y = lo + 0.65; y < hi; y += 1.25) {
    let xx = [];
    for (let j = 0; j < p.length; j++) {
      let a = p[j], b = p[(j + 1) % p.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xx.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
    }
    xx.sort((a, b) => a - b);
    let next = [];
    let used = new Set();
    for (let j = 0; j + 1 < xx.length; j += 2) {
      let left = xx[j], right = xx[j + 1];
      let chain = active.find(a => !used.has(a) && a.right >= left && a.left <= right);
      if (!chain) { chain = { points: [], flip: false }; chains.push(chain); }
      used.add(chain);
      let a = [left, y], b = [right, y];
      chain.points.push(...(chain.flip ? [b, a] : [a, b]));
      chain.flip = !chain.flip;
      chain.left = left; chain.right = right;
      next.push(chain);
    }
    active = next;
  }
  for (const { points } of chains) {
    for (let i = 0; i < points.length; i += 1800) {
      for (let pass = 0; pass < 3; pass++) stroke(points.slice(i, i + 1800), c, 2.45);
    }
  }
  if (outline) stroke([...p, p[0]], outline, w);
}

function ell(x, y, rx, ry, c, outline = null, w = 2) {
  marks.push({ type: 'ellipse', layer, x: x - rx, y: y - ry, width: rx * 2, height: ry * 2, color: c, opacity: 1 });
  if (outline) {
    const p = [];
    for (let i = 0; i <= 80; i++) {
      let t = i * Math.PI / 40;
      p.push([x + rx * Math.cos(t), y + ry * Math.sin(t)]);
    }
    stroke(p, outline, w);
  }
}

function leaf(x, y, dx, dy, c, w = 1) {
  poly([[x, y], [x + dx * 0.23 - dy * 0.16, y + dy * 0.23 + dx * 0.16], [x + dx, y + dy], [x + dx * 0.63 + dy * 0.1, y + dy * 0.63 - dx * 0.1]], c, null);
  if (w) stroke([[x, y], [x + dx * 0.84, y + dy * 0.84]], '#203f42', w, 0.55);
}

// Global background fill
marks.push({ type: 'fill', color: '#476b75' });

// Layer 1: Woods (Forest)
L('woods', '01 · Forest color study');
poly('M 0 188 Q 196 95 380 164 Q 645 213 1000 105 L 1000 562 Q 685 489 458 534 L 0 586 Z', '#64858a', null);
poly('M 0 373 Q 199 300 428 395 Q 670 367 1000 312 L 1000 700 L 0 700 Z', '#385b5d', null);
for (let i = 0; i < 25; i++) {
  let x = i * 44 - 15, w = 8 + rnd() * 10;
  let y = 60 + rnd() * 100;
  let bottom = 404 + rnd() * 112;
  let lean = (rnd() - 0.5) * 60;
  let c = ['#4c747b', '#537d80', '#41666e'][i % 3];
  poly([[x, y], [x + w, y], [x + w + lean, bottom], [x + lean, bottom + 8]], c, null);
  stroke([[x + lean, bottom - 12], [x + w * 0.6, y + 150], [x - 25, y + 86]], c, 5, 0.8);
  stroke([[x + w * 0.6, y + 155], [x + 40, y + 107], [x + 62, y + 45]], c, 3, 0.8);
}
for (let i = 0; i < 94; i++) {
  let x = rnd() * 1000, y = rnd() * 175;
  stroke([[x - 20, y + 8], [x, y], [x + 30, y + 5]], ['#26494f', '#355c60', '#3c6469', '#52767b'][i % 4], 22 + rnd() * 30, 0.65, 'brush');
}
poly('M 0 603 Q 145 515 332 550 Q 484 490 565 477 Q 593 521 550 552 Q 474 595 449 700 L 0 700 Z', '#6b7870', null);
poly('M 448 700 Q 474 618 579 571 Q 701 531 1000 580 L 1000 700 Z', '#2c494c', null);

// Framing trunks: taper, bark planes and roots
poly('M 43 0 L 161 0 Q 139 101 132 215 Q 119 373 142 465 L 193 529 L 148 514 L 128 490 L 129 540 L 108 506 L 68 544 L 83 485 Q 87 338 81 237 Q 77 134 43 0 Z', '#30484b', ink, 2.5);
poly('M 67 0 L 113 0 Q 121 101 104 251 L 105 432 L 91 486 L 87 289 Q 91 181 67 0 Z', '#647365', null);
poly('M 112 0 L 142 0 L 127 186 L 118 349 L 129 453 L 114 482 L 102 360 L 110 157 Z', '#495c53', null);
poly('M 883 0 L 976 0 Q 930 174 938 343 Q 937 467 995 540 L 949 526 L 923 496 L 914 557 L 898 515 L 859 548 L 881 489 Q 896 309 882 198 Z', '#263f45', ink, 3);
poly('M 889 0 L 921 0 L 915 185 Q 903 361 911 450 L 898 495 L 899 306 Z', '#5c7064', null);
poly('M 133 132 Q 207 90 231 0 L 255 0 Q 219 114 132 167 Z', '#344d4e', ink, 1.6);
poly('M 891 188 Q 815 132 805 31 L 818 18 Q 839 122 896 148 Z', '#354e50', ink, 1.6);
for (let i = 0; i < 47; i++) {
  let side = i % 2, x = (side ? 892 : 90) + rnd() * 29, y = rnd() * 486;
  stroke([[x, y], [x - 5 + rnd() * 10, y + 17], [x - 3, y + 29 + rnd() * 29]], i % 3 ? '#203b42' : '#82917a', 0.7 + rnd() * 1.4, 0.65);
}
for (let i = 0; i < 95; i++) {
  let x = rnd() * 1000, y = 395 + rnd() * 190;
  if (x > 265 && x < 525) continue;
  stroke([[x - 12, y + 3], [x, y - 7], [x + 12, y]], ['#345653', '#496b5c', '#627c66', '#294d4e'][i % 4], 15 + rnd() * 19, 0.85, 'brush');
}
for (let i = 0; i < 24; i++) {
  let x = rnd() * 1000, y = 490 + rnd() * 175;
  line(`M ${x} ${y} Q ${x + 12} ${y - 8} ${x + 27} ${y - 3}`, '#9caa87', 1, 0.35);
}

// Canopy & shrubs
poly('M 0 14 L 260 14 Q 249 29 228 34 Q 238 53 211 58 Q 212 80 184 77 Q 178 105 153 91 Q 133 120 109 101 Q 91 123 75 107 Q 54 142 34 119 Q 12 144 0 130 Z', '#294b50', null);
poly('M 452 14 L 845 14 Q 835 44 808 36 Q 805 64 782 57 Q 778 86 747 70 Q 729 95 704 77 Q 681 102 665 78 Q 639 93 621 63 Q 603 82 581 63 Q 555 79 545 48 Q 514 64 502 40 Q 479 56 452 14 Z', '#31575a', null);
poly('M 15 470 Q 31 453 51 462 Q 44 435 68 440 Q 70 413 91 425 Q 100 393 121 411 Q 143 383 160 408 Q 189 389 197 421 Q 222 409 230 442 Q 255 433 262 457 L 256 550 Q 213 551 190 534 Q 150 546 121 520 Q 86 540 67 518 L 13 537 Z', '#294c4c', null);
poly('M 486 473 Q 495 444 522 450 Q 517 419 543 427 Q 555 397 574 418 Q 588 393 611 415 Q 639 401 648 430 Q 670 416 683 445 Q 719 425 742 448 Q 766 423 782 441 Q 803 414 829 428 Q 852 410 866 438 Q 896 421 906 451 Q 930 432 943 458 Q 969 445 987 470 L 987 571 Q 934 562 888 576 Q 839 551 800 567 Q 751 543 720 559 Q 681 541 651 548 Q 610 518 571 543 Q 534 520 485 530 Z', '#305553', null);
const foliageCenters = [[29, 93], [76, 76], [148, 57], [205, 34], [516, 26], [580, 40], [655, 45], [711, 41], [768, 31], [814, 19], [44, 477], [96, 458], [139, 440], [188, 466], [224, 500], [514, 484], [557, 459], [603, 466], [663, 486], [718, 484], [775, 479], [829, 468], [883, 480], [949, 487]];
for (let i = 0; i < 125; i++) {
  let [cx, cy] = foliageCenters[i % foliageCenters.length], x = cx + (rnd() - 0.5) * 55, y = cy + (rnd() - 0.5) * 35;
  let d = 7 + rnd() * 12, h = 4 + rnd() * 8;
  poly(`M ${x - d} ${y} Q ${x - d * 0.7} ${y - h} ${x - d * 0.15} ${y - h * 0.5} Q ${x + d * 0.25} ${y - h * 1.5} ${x + d * 0.55} ${y - h * 0.2} Q ${x + d * 1.1} ${y - h * 0.4} ${x + d} ${y + h * 0.3} Q ${x} ${y + h * 0.8} ${x - d} ${y} Z`, ['#3b635b', '#456e62', '#557a67', '#284d4d'][i % 4], null);
  if (i % 4 === 0) line(`M ${x - d * 0.4} ${y} Q ${x} ${y - 3} ${x + d * 0.3} ${y - 2}`, '#8a9e7e', 0.8, 0.55);
}
for (const [x, y] of [[183, 400], [522, 413], [855, 415], [959, 431]]) {
  line(`M ${x} ${y + 103} Q ${x + 4} ${y + 46} ${x - 15} ${y} M ${x + 1} ${y + 65} L ${x + 26} ${y + 35} M ${x - 4} ${y + 39} L ${x - 34} ${y + 13}`, '#223f46', 2.5, 0.9);
  for (let j = 0; j < 6; j++) leaf(x - 4 + j * 3, y + 68 - j * 11, j % 2 ? 24 : -27, -15, ['#69866b', '#597b64'][j % 2], 0.5);
}
for (const [x, y] of [[106, 106], [111, 210], [98, 331], [118, 409], [911, 65], [918, 291], [907, 415]]) {
  line(`M ${x} ${y - 22} Q ${x - 13} ${y - 5} ${x - 8} ${y + 19} Q ${x - 3} ${y + 33} ${x - 7} ${y + 51}`, '#233e42', 2, 0.85);
  line(`M ${x + 3} ${y - 16} Q ${x - 5} ${y + 4} ${x + 1} ${y + 18} Q ${x + 7} ${y + 37} ${x + 2} ${y + 52}`, '#84917a', 1.25, 0.7);
  line(`M ${x + 1} ${y + 2} Q ${x - 5} ${y + 10} ${x + 1} ${y + 18} Q ${x + 7} ${y + 8} ${x + 1} ${y + 2}`, '#233e42', 1.3, 0.8);
}

// Layer 2: Gas (Gastly vapor)
L('gas', '02 · Gastly vapor gesture');
const vapor = 'M 594 210 Q 560 197 583 171 Q 565 143 603 136 Q 604 101 640 121 Q 664 91 689 116 Q 721 79 747 106 Q 777 84 789 116 Q 832 101 827 139 Q 872 124 868 165 Q 905 164 883 201 Q 927 218 902 249 Q 930 284 901 303 Q 923 348 884 356 Q 902 396 857 393 Q 864 432 823 423 Q 799 461 769 433 Q 729 470 706 435 Q 669 452 657 424 Q 608 441 613 401 Q 564 402 581 363 Q 550 346 570 316 Q 540 285 567 263 Q 548 230 594 210 Z';
poly(vapor, '#82749e', '#c3b3ce', 2.4);
poly('M 601 204 Q 579 165 624 153 Q 634 124 669 153 Q 698 116 723 139 Q 757 111 781 147 Q 826 129 819 169 Q 872 166 856 215 Q 895 231 873 268 Q 902 301 870 323 Q 879 373 835 369 Q 839 415 797 398 Q 774 433 746 404 Q 709 433 683 402 Q 637 416 640 377 Q 592 384 604 346 Q 573 319 597 290 Q 577 258 609 241 Z', '#9c8cae', null);
for (const s of ['M 589 185 Q 591 158 614 159 Q 637 167 617 190', 'M 640 130 Q 655 112 670 138', 'M 836 190 Q 851 176 862 186 Q 872 202 852 217', 'M 864 300 Q 891 290 890 314 Q 887 333 866 340', 'M 625 381 Q 608 407 636 411', 'M 718 421 Q 730 438 746 421', 'M 783 116 Q 797 128 788 145']) {
  line(s, '#d0bdd6', 2.2, 0.8);
}
poly('M 928 270 Q 956 232 956 272 Q 952 300 926 308 Q 942 290 928 270 Z', '#9e8bad', '#c7b4ce', 1.8);
poly('M 663 76 Q 658 48 681 58 Q 698 66 693 89 Q 680 71 663 76 Z', '#88779c', '#c2b1c8', 1.4);
poly('M 791 474 Q 806 445 830 455 Q 850 474 826 489 Q 830 467 808 475 Z', '#9380a1', '#bdacc5', 1.5);
poly('M 556 380 Q 529 364 537 339 Q 545 327 554 340 Q 540 349 556 380 Z', '#9d8bad', null);

// Layer 3: Figure (Character Cel Sketch - with anatomically sound shoulders, arms, forearms, wrists, and clenched fists)
L('figure', '03 · Character cel sketch');

// 1. Backpack (behind body)
poly('M 252 425 Q 206 418 200 476 L 207 639 L 290 659 L 304 479 Z', '#a98259', ink, 3);
poly('M 230 447 Q 211 489 218 568 L 237 631 L 262 633 L 250 469 Z', '#685e4c', null);
line('M 216 492 Q 233 481 253 491 L 260 585 Q 239 598 221 587 Z', ink, 1.8);
line('M 221 513 L 249 510 M 236 511 L 239 525', ink, 1.6);

// 2. Torso Coat Base & Shading (Behind Arms)
// Natural shoulder slope: neck (323, 395) -> slope (270, 412) -> side (252, 450) -> hem (252, 698)
poly('M 323 395 Q 285 404 268 412 Q 248 424 252 458 L 256 550 L 252 698 L 472 698 L 468 550 Q 476 462 468 424 Q 450 404 411 395 Z', '#698873', ink, 3);
poly('M 268 412 Q 248 435 252 465 L 265 560 L 255 698 L 278 698 L 285 560 Q 272 475 278 440 Z', '#3f625d', null);
poly('M 450 404 Q 472 425 468 465 L 452 560 L 448 698 L 472 698 L 468 550 Q 476 462 468 424 Z', '#496962', null);

// 3. Neck & Shirt Collar
poly('M 324 393 L 410 391 L 423 444 L 397 480 L 362 470 L 332 433 Z', '#e1dbc2', ink, 2);
poly('M 324 352 L 402 352 L 411 404 Q 392 429 361 437 L 326 409 Z', '#e6b796', ink, 2.5);
poly('M 324 352 L 398 370 L 388 401 L 361 420 L 328 405 Z', '#b48274', null);
poly('M 327 400 L 360 438 L 343 465 L 319 439 L 313 453 L 292 420 Z', '#94a188', ink, 2.4);
poly('M 409 398 L 431 415 L 421 445 L 403 440 L 379 471 L 366 443 Z', '#9eaa90', ink, 2.4);

// Placket and buttons down chest
line('M 365 470 L 365 696', ink, 2.2);
line('M 372 472 L 372 686', '#b8bea0', 2, 0.8);
for (let y = 504; y < 670; y += 52) ell(365, y, 2.8, 2.8, '#b8bca0', ink, 1);

// Backpack strap on left chest
poly('M 277 421 L 292 414 Q 285 465 296 512 L 282 521 Q 269 468 277 421 Z', '#b7a680', ink, 2);
line('M 280 433 Q 276 476 285 503', '#dfd0a2', 2);

// Right chest pocket
poly('M 407 496 L 441 494 L 439 548 L 407 551 Z', '#688272', ink, 1.5);
line('M 407 507 L 440 503 M 413 541 L 433 539', ink, 1.3);
ell(425, 510, 2, 2, '#d0c69e', ink, 0.8);

// 4. Head, Face, Eyes, Glasses, Hair
// Elongated head in three-quarter view
poly('M 286 175 Q 312 132 374 142 Q 429 145 442 194 L 448 239 Q 449 256 465 266 Q 475 274 456 280 L 454 316 Q 449 353 426 372 L 391 399 Q 378 406 363 396 L 315 365 Q 297 349 290 307 L 277 269 Z', '#efc5a3', ink, 3.2);
poly('M 286 195 L 305 211 L 303 274 Q 306 340 331 359 L 389 398 L 364 397 L 315 365 Q 296 347 290 307 L 281 269 Z', '#c4937d', null);
poly('M 427 183 L 441 204 L 450 252 L 462 270 L 451 278 L 451 304 L 436 322 L 440 270 Z', '#ddb18f', null);
poly('M 283 253 Q 261 236 257 264 Q 259 289 279 301 L 294 293 L 292 265 Z', '#e2ad8e', ink, 2.4);
line('M 279 262 Q 267 250 265 267 Q 266 282 279 286 L 280 275 L 273 271', ink, 1.5);

// Big open eyes
poly('M 307 242 Q 306 210 327 203 Q 345 200 357 221 Q 365 242 355 265 Q 332 277 312 261 Z', '#f6eedc', ink, 2);
poly('M 381 218 Q 389 194 408 197 Q 430 205 431 232 L 426 253 Q 407 266 386 251 Z', '#f6eedc', ink, 2);
ell(341, 237, 10.5, 24, '#314948', ink, 1.3); ell(344, 238, 5.8, 19, '#182a31'); ell(344, 221, 4.5, 7, '#fff4d7'); ell(337, 246, 2, 3, '#c7d7b9');
ell(418, 226, 9, 22, '#344c46', ink, 1.2); ell(420, 229, 5, 16, '#192a2d'); ell(420, 212, 3.5, 6, '#fff4d7');
line('M 308 232 Q 307 210 328 203 M 383 218 Q 390 196 405 198', ink, 2.8);
line('M 308 193 Q 327 179 350 195 M 382 190 Q 400 175 420 186', ink, 3.3);

// Glasses
line('M 296 220 Q 313 207 351 213 Q 366 218 366 241 Q 365 270 343 276 Q 315 281 303 261 Q 297 249 296 220 Z', ink, 4);
line('M 377 211 Q 398 196 426 203 Q 440 210 437 237 Q 434 257 416 264 Q 394 270 381 253 Q 375 238 377 211 Z', ink, 3.8);
line('M 366 232 Q 370 226 378 229 M 297 231 L 280 248 M 438 216 L 443 210', ink, 3);
line('M 303 223 Q 320 214 338 216 M 383 212 Q 396 205 408 205', '#8f9290', 1, 0.7);
line('M 317 217 L 309 237 M 324 219 L 311 249 M 392 209 L 385 226', '#fff8e7', 1.6, 0.6);

// Mouth, Cheeks, Sweat drop
line('M 370 247 L 369 267 L 377 272 L 372 276', ink, 1.7);
line('M 448 260 L 460 270 L 451 273', ink, 1.4);
poly('M 366 304 Q 385 290 402 304 Q 414 321 407 346 Q 402 365 386 367 Q 369 364 363 348 Q 356 322 366 304 Z', '#563a43', ink, 2.8);
poly('M 367 338 Q 386 327 407 341 Q 402 365 386 367 Q 370 363 367 338 Z', '#d38583', null);
poly('M 368 306 Q 385 296 399 306 L 397 313 Q 380 309 367 316 Z', '#f7dfc1', null);
line('M 369 303 Q 385 294 400 303 M 381 378 Q 390 381 397 376', '#b07b6c', 1.4);
line('M 316 284 Q 330 279 341 282 M 417 280 Q 431 273 439 275', '#b97973', 1.8);
for (let i = 0; i < 6; i++) {
  stroke([[313 + i * 5, 283], [316 + i * 5, 294]], '#b66f71', 1.1, 0.75);
  stroke([[412 + i * 4, 278], [414 + i * 4, 287]], '#b66f71', 1, 0.65);
}
poly('M 300 299 Q 288 318 292 325 Q 298 334 305 326 Q 308 317 300 299 Z', '#c2d6cb', ink, 1.4);
line('M 297 312 Q 292 324 299 325', '#f8f0d7', 1.5);

// Hair silhouette & locks
poly('M 278 260 L 264 239 L 270 216 L 251 223 L 261 187 L 244 192 L 269 160 L 253 155 L 282 132 L 278 113 L 314 119 L 321 91 L 348 109 L 371 85 L 383 107 L 413 96 L 415 116 L 444 120 L 435 135 Q 460 150 459 177 L 472 187 L 447 195 L 445 228 L 427 207 L 415 177 L 401 198 L 375 172 L 382 206 Q 348 184 336 166 Q 325 190 298 209 L 289 243 L 281 238 Z', '#273b44', ink, 3.4);
poly('M 277 157 L 302 140 L 292 136 L 320 138 L 324 113 L 348 128 L 366 107 L 369 128 L 404 114 L 396 135 Q 431 128 443 157 L 427 151 L 432 177 L 413 159 L 396 168 L 377 147 L 371 170 L 335 145 L 308 178 L 287 201 L 292 176 L 272 190 Z', '#435560', null);
poly('M 281 173 Q 306 150 330 146 L 315 159 L 293 182 L 278 205 Z', '#566672', null);
line('M 335 147 Q 345 170 369 188 M 375 147 L 398 177 M 405 141 Q 427 145 436 169 M 306 173 L 286 216 M 275 210 L 275 234', ink, 1.8);
line('M 310 141 L 326 136 M 341 130 L 356 139 M 381 125 L 394 124', '#77828a', 1.1, 0.65);

// 5. Anatomical Left Arm: Solid folded sleeve with realistic flexion
const leftArmSleeve = 'M 323 395 Q 285 404 266 412 Q 248 424 246 445 Q 244 480 248 518 Q 252 536 268 536 Q 284 534 298 478 L 326 462 Q 312 444 286 440 Q 302 414 323 395 Z';
poly(leftArmSleeve, '#698873', ink, 2.8);
poly('M 266 412 Q 248 424 246 445 Q 244 480 248 518 Q 252 536 268 536 L 272 516 Q 262 476 262 436 Z', '#3f625d', null);
// Inner elbow fold crease & sleeve wrinkles
line('M 286 440 Q 278 480 270 515', ink, 1.8);
line('M 248 474 Q 262 480 278 472', ink, 1.4);
line('M 252 506 Q 266 512 282 502', ink, 1.4);
line('M 264 528 Q 276 532 290 520', '#b2bca0', 1.2, 0.8);

// Anatomical Right Arm: Solid folded sleeve with realistic flexion
const rightArmSleeve = 'M 407 395 Q 445 404 464 412 Q 482 424 484 445 Q 486 480 482 518 Q 478 536 462 536 Q 446 534 432 478 L 404 462 Q 418 444 444 440 Q 428 414 407 395 Z';
poly(rightArmSleeve, '#698873', ink, 2.8);
poly('M 464 412 Q 482 424 484 445 Q 486 480 482 518 Q 478 536 462 536 L 458 516 Q 468 476 468 436 Z', '#496962', null);
// Inner elbow fold crease & sleeve wrinkles
line('M 444 440 Q 452 480 460 515', ink, 1.8);
line('M 482 474 Q 468 480 452 472', ink, 1.4);
line('M 478 506 Q 464 512 448 502', ink, 1.4);
line('M 466 528 Q 454 532 440 520', '#b2bca0', 1.2, 0.8);

// 6. Wrist Cuffs (Solidly encircling the wrists)
const leftCuff = 'M 290 466 L 332 454 L 326 476 L 284 488 Z';
poly(leftCuff, '#97a58b', ink, 2.4);
for (let i = 0; i < 5; i++) {
  stroke([[292 + i * 7.5, 466 - i * 2.2], [286 + i * 7.5, 486 - i * 2.2]], ink, 1, 0.75);
}

const rightCuff = 'M 440 466 L 398 454 L 404 476 L 446 488 Z';
poly(rightCuff, '#9bab90', ink, 2.4);
for (let i = 0; i < 5; i++) {
  stroke([[438 - i * 7.5, 466 - i * 2.2], [444 - i * 7.5, 486 - i * 2.2]], ink, 1, 0.75);
}

// 7. Convincing Clenched Fists (Derived from Focused Study)
// Left Fist
const leftFistPath = 'M 324.0 467.2 Q 310.3 474.4 299.5 467.2 Q 292.3 462.2 289.4 448.5 L 282.2 425.5 Q 280.8 418.3 287.2 414.7 Q 288.7 408.2 295.2 410.4 Q 298.8 403.2 305.2 407.5 Q 310.3 400.3 318.2 404.6 L 326.1 408.2 Q 332.6 411.1 332.6 416.8 L 335.5 421.9 L 337.6 429.1 L 337.6 436.3 Q 336.2 452.8 324.0 467.2 Z';
poly(leftFistPath, '#ebbd9a', ink, 2.6);
poly('M 324.0 467.2 Q 310.3 472.0 300.0 467.2 L 296 450 Q 308 456 322 446 L 332 448 Q 334 456 324.0 467.2 Z', '#c38f79', null);
// Knuckle divisions between the 4 curled fingers
line('M 316 408 L 314 430 M 304 410 L 302 432 M 294 414 L 292 434', ink, 1.5);
// Left thumb
const leftThumbPath = 'M 336.9 429.1 L 326.1 427.6 L 326.8 418.3 Q 326.1 409.6 318.2 406.0 L 312.4 411.8 M 325.4 432.0 L 324.7 424.8';
line(leftThumbPath, ink, 2);
line('M 326 427 L 316 414', '#e1b897', 1.4);

// Right Fist
const rightFistPath = 'M 406.0 467.2 Q 419.7 474.4 430.5 467.2 Q 437.7 462.2 440.6 448.5 L 447.8 425.5 Q 449.2 418.3 442.8 414.7 Q 441.3 408.2 434.8 410.4 Q 431.2 403.2 424.8 407.5 Q 419.7 400.3 411.8 404.6 L 403.9 408.2 Q 397.4 411.1 397.4 416.8 L 394.5 421.9 L 392.4 429.1 L 392.4 436.3 Q 393.8 452.8 406.0 467.2 Z';
poly(rightFistPath, '#edbf9d', ink, 2.6);
poly('M 406.0 467.2 Q 420.0 472.0 430.0 467.2 L 434 450 Q 422 456 408 446 L 398 448 Q 396 456 406.0 467.2 Z', '#c69380', null);
// Knuckle divisions between the 4 curled fingers
line('M 414 408 L 416 430 M 426 410 L 428 432 M 436 414 L 438 434', ink, 1.5);
// Right thumb
const rightThumbPath = 'M 393.1 429.1 L 403.9 427.6 L 403.2 418.3 Q 403.9 409.6 411.8 406.0 L 417.6 411.8 M 404.6 432.0 L 405.3 424.8';
line(rightThumbPath, ink, 2);
line('M 404 427 L 414 414', '#e3ba99', 1.4);

// Layer 4: Gastly
L('gastly', '04 · Gastly expression');
ell(737, 285, 112, 110, '#302b43', ink, 3.4);
poly('M 635 263 Q 640 205 701 184 Q 661 218 658 269 Q 656 321 691 358 Q 647 341 635 302 Z', '#494056', null);
line('M 651 231 Q 676 193 713 187', '#796380', 2, 0.55);

// Original-series wedge eyes
poly('M 643 231 Q 683 248 728 278 Q 724 315 698 316 Q 663 314 648 279 Q 642 260 643 231 Z', '#e5e7d4', ink, 2.3);
poly('M 744 275 Q 776 248 826 220 Q 832 257 817 283 Q 801 309 775 309 Q 751 306 744 275 Z', '#ecebd9', ink, 2.3);
poly('M 646 239 Q 654 282 681 299 Q 702 311 716 301 Q 706 321 686 312 Q 652 300 646 270 Z', '#c3cfc5', null);
poly('M 822 228 Q 827 265 806 286 Q 787 306 765 294 Q 777 316 800 303 Q 829 283 829 250 Z', '#c8d2cb', null);
ell(710, 290, 3.5, 8, '#252b39'); ell(763, 284, 3.2, 8, '#252b39');
line('M 731 262 L 735 274 M 743 255 L 740 269', '#ae94ae', 1.8, 0.8);

// Open mouth with fangs
poly('M 670 325 Q 735 354 807 315 Q 787 363 741 369 Q 697 371 670 325 Z', '#674354', ink, 2.2);
poly('M 701 358 Q 740 340 775 359 Q 739 379 701 358 Z', '#a46b7f', null);
poly('M 678 329 L 702 338 L 691 354 Z', '#f4ebd4', ink, 1.5);
poly('M 782 329 L 802 320 L 792 345 Z', '#f6ecd6', ink, 1.5);
line('M 671 325 Q 735 352 807 315', '#c49baf', 1.4);
line('M 666 320 L 662 327 M 808 309 L 812 316', ink, 1.8);

// Layer 5: Accents (Vibrations adapted to new anatomy, pencil hatching, foliage, layout frame)
L('accents', '05 · Tremble, pencil accents, foliage');

// Tremble / vibration lines adapting to new anatomical arms, shoulders, and head
for (const [x, y, h] of [
  [236, 420, 95],   // Left shoulder & deltoid
  [228, 495, 60],   // Left elbow
  [492, 420, 95],   // Right shoulder & deltoid
  [500, 495, 60],   // Right elbow
  [269, 304, 64],   // Left head
  [470, 305, 57],   // Right head
  [246, 575, 85],   // Lower left jacket
  [480, 578, 79]    // Lower right jacket
]) {
  line(`M ${x} ${y} Q ${x - 4} ${y + h * 0.2} ${x} ${y + h * 0.4} Q ${x + 3} ${y + h * 0.6} ${x - 1} ${y + h}`, '#d3d8bd', 3, 0.8);
  line(`M ${x + 3} ${y + 2} Q ${x - 1} ${y + h * 0.3} ${x + 3} ${y + h * 0.55} L ${x + 1} ${y + h}`, ink, 1.2, 0.7);
}

// Head vibration accents
for (const s of ['M 256 122 L 243 103 M 270 110 L 265 88', 'M 467 123 L 483 110 M 475 139 L 500 130', 'M 471 215 Q 480 205 476 193', 'M 244 298 Q 238 289 241 281']) {
  line(s, '#e3dec3', 2, 0.85);
}

// Hand vibration accents
line('M 276 414 Q 272 424 274 436', '#d3d8bd', 2.5, 0.8);
line('M 342 414 Q 346 424 344 436', '#d3d8bd', 2.5, 0.8);
line('M 388 414 Q 384 424 386 436', '#d3d8bd', 2.5, 0.8);
line('M 454 414 Q 458 424 456 436', '#d3d8bd', 2.5, 0.8);

// Pencil searching lines and hatching
for (let i = 0; i < 15; i++) {
  let y = 160 + i * 10;
  stroke([[280 + (y > 220 ? 6 : 0), y], [284 + (y > 220 ? 5 : 0), y + 7]], '#e1b897', 0.75, 0.5);
}
for (let i = 0; i < 9; i++) {
  stroke([[316 + i * 5, 355 + i * 3], [311 + i * 5, 361 + i * 3]], ink, 0.85, 0.4);
  stroke([[265 + i * 2, 554 + i * 8], [275 + i * 2, 547 + i * 8]], ink, 0.8, 0.4);
}
for (let i = 0; i < 16; i++) {
  let a = (i * 9 + 115) * Math.PI / 180;
  let x = 737 + 101 * Math.cos(a), y = 285 + 100 * Math.sin(a);
  stroke([[x, y], [x + 6, y - 5]], '#c1a7c3', 0.8, 0.5);
}

// Foreground ferns and grass clusters
for (const [x, y, scale] of [[47, 671, 1.25], [144, 617, 0.82], [832, 664, 1.15], [961, 631, 1.05], [581, 682, 0.8]]) {
  for (let k = 0; k < 7; k++) {
    let a = (-155 + k * 21) * Math.PI / 180, dx = Math.cos(a) * 75 * scale, dy = -Math.abs(Math.sin(a)) * 95 * scale - 20;
    leaf(x, y, dx, dy, k % 2 ? '#547660' : '#779276');
  }
  line(`M ${x} ${y} Q ${x - 8} ${y - 63 * scale} ${x + 16} ${y - 105 * scale}`, '#9bae86', 1.6);
  for (let j = 1; j < 6; j++) {
    let yy = y - j * 15 * scale, xx = x - 4 + j * 2;
    leaf(xx, yy, -(42 - j * 5) * scale, -19 * scale, '#537862', 0.7);
    leaf(xx, yy, (43 - j * 5) * scale, -22 * scale, '#7d9675', 0.7);
  }
}
for (let i = 0; i < 72; i++) {
  let x = rnd() * 1000, y = 596 + rnd() * 104;
  if (x > 222 && x < 506) continue;
  stroke([[x, y], [x - 5 + rnd() * 10, y - 8 - rnd() * 17]], i % 3 ? '#172f38' : '#9ba583', 0.7 + rnd() * 1.3, 0.8);
}
for (let i = 0; i < 30; i++) {
  let x = rnd() * 1000, y = 50 + rnd() * 590;
  if ((x > 240 && x < 480) || (x > 572 && x < 893 && y < 455)) continue;
  stroke([[x, y], [x + 2, y - 4]], '#cbd3a9', 1.3, 0.55);
}

// Thin inset frame
for (const [x, y, w, h] of [[0, 0, 1000, 12], [0, 688, 1000, 12], [0, 0, 12, 700], [988, 0, 12, 700]]) {
  marks.push({ type: 'rect', layer, x, y, width: w, height: h, color: paper, opacity: 1 });
}
line('M 13 13 L 987 13 L 987 687 L 13 687 Z', '#35494c', 1.5);

const totalPoints = marks.reduce((n, m) => n + (m.points?.length ?? 0), 0);
console.log(JSON.stringify({
  commands: marks.length,
  points: totalPoints,
  withinCommandLimit: marks.length <= 3000,
  withinPointLimit: totalPoints <= 150000
}));

fs.writeFileSync('/tmp/codesketch-gastly-art-lq5/gastly-completed-marks.json', JSON.stringify(marks));
