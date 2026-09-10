async (page) => {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`studio.mjs check failed: ${message}`);
  };
  const problems = [];
  const commandBodies = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });
  page.on('requestfailed', (request) => problems.push(`requestfailed: ${request.url()}`));
  page.on('response', (response) => { if (response.status() >= 400) problems.push(`http ${response.status()}: ${response.url()}`); });
  page.on('request', (request) => {
    if (request.url().includes('/api/commands') && request.method() === 'POST') {
      try { commandBodies.push(JSON.parse(request.postData() ?? '{}')); } catch {}
    }
  });

  await page.setViewportSize({ width: 1200, height: 800 });
  await page.waitForSelector('.cs-dock', { timeout: 15000 });
  await page.waitForTimeout(600);
  const state = async () => page.evaluate(async () => (await (await fetch('/api/state')).json()));
  const box = async () => page.locator('#painting-canvas').boundingBox();
  const scaleOf = async () => (await box()).width / 1000;
  const drag = async (from, to, steps = 4) => {
    const bounds = await box();
    const s = bounds.width / 1000;
    await page.mouse.move(bounds.x + from[0] * s, bounds.y + from[1] * s);
    await page.mouse.down();
    await page.mouse.move(bounds.x + to[0] * s, bounds.y + to[1] * s, { steps });
    await page.mouse.up();
  };
  const waitForMarks = async (count) => {
    let latest = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      latest = await state();
      if (latest.document.marks.length === count) return latest;
      await page.waitForTimeout(100);
    }
    throw new Error(`marks never reached ${count}; at ${latest?.document.marks.length}; tool=${latest?.tool}; draft=${JSON.stringify(latest?.draft)?.slice(0, 100)}`);
  };
  const openDocumentMenu = async () => {
    await page.click('#global-header button[popovertarget="cs-document-menu"]');
    await page.waitForTimeout(150);
  };

  // 1. Fresh in-memory session: initial layers and the paintbrush active by default
  const base = await state();
  assert(base.document.layers.length >= 1, 'initial document has layers');
  assert(await page.locator('.cs-dock-btn[aria-pressed="true"][aria-label="Paintbrush (B)"]').count() === 1, 'paintbrush active by default');
  assert((await page.textContent('.cs-layer-name'))?.length > 0, 'layer rows render');

  // 2. Fit keeps the whole artboard visible inside the stage
  await page.click('#global-header button:has-text("Fit")');
  await page.waitForTimeout(250);
  const fitted = await box();
  assert(fitted.width < 1000 && fitted.height < 700, `fit scales down: ${fitted.width}x${fitted.height}`);
  const fittedAspect = (fitted.width / fitted.height).toFixed(3);
  assert(Math.abs(fitted.width / fitted.height - 10 / 7) < 0.01, `true 10:7 preserved: ${fittedAspect}`);

  // 3. Native brush stroke: real pixels and a stroke command at the live generation
  const hudBeforeStroke = await page.locator('#director-hud').boundingBox();
  const canvasBeforeStroke = await box();
  await drag([150, 150], [230, 210], 6);
  let snap = await waitForMarks(1);
  const hudAfterStroke = await page.locator('#director-hud').boundingBox();
  const canvasAfterStroke = await box();
  assert(Math.abs(hudAfterStroke.height - hudBeforeStroke.height) < 0.5
    && Math.abs(hudAfterStroke.width - hudBeforeStroke.width) < 0.5,
    `HUD dimensions stable through pending pause: before ${JSON.stringify(hudBeforeStroke)} after ${JSON.stringify(hudAfterStroke)}`);
  assert(Math.abs(canvasAfterStroke.x - canvasBeforeStroke.x) < 0.5
    && Math.abs(canvasAfterStroke.y - canvasBeforeStroke.y) < 0.5,
    `canvas box stable during stroke: before ${JSON.stringify(canvasBeforeStroke)} after ${JSON.stringify(canvasAfterStroke)}`);
  const strokeMark = snap.document.marks[0];
  assert((strokeMark.type) === ('stroke'), 'stroke mark');
  assert((strokeMark.layer) === ('paint'), 'stroke targets the painting layer');
  assert(strokeMark.points.length >= 2, 'stroke captured multiple points');
  const strokePixel = await page.evaluate(([x, y]) => {
    const d = document.getElementById('painting-canvas').getContext('2d').getImageData(x, y, 1, 1).data;
    return `${d[0]},${d[1]},${d[2]}`;
  }, [Math.round(strokeMark.points[0][0]), Math.round(strokeMark.points[0][1])]);
  assert(strokePixel !== '247,243,232', `stroke pixel painted: ${strokePixel}`);
  const points = strokeMark.points;
  assert(JSON.stringify(points[0]) === JSON.stringify([150, 150]), `stroke starts at the requested point: ${JSON.stringify(points[0])}`);
  const lastPoint = points[points.length - 1];
  assert(JSON.stringify(lastPoint) === JSON.stringify([230, 210]), `stroke ends at the requested point: ${JSON.stringify(lastPoint)}`);
  for (const point of points) {
    const lineDistance = Math.abs((point[0] - 150) * 60 - (point[1] - 150) * 80) / 100;
    assert(lineDistance <= 2, `stroke point stays on the drag line: ${JSON.stringify(point)} off by ${lineDistance.toFixed(2)}`);
  }
  assert((commandBodies.length) === (1), 'one command post');
  assert((commandBodies[0].expectedDocGeneration) === (base.docGeneration), 'stroke used the live generation');
  assert((commandBodies[0].source) === ('human'), 'human source');
  assert((commandBodies[0].immediate) === (true), 'immediate commit');
  assert((commandBodies[0].play) === (false), 'no auto play');

  // 4. Rectangle and ellipse paint normalized shapes with exact pixels
  await page.click('.cs-dock-btn[aria-label="Rectangle (R)"]');
  await drag([400, 100], [700, 300]);
  snap = await waitForMarks(2);
  const rectMark = snap.document.marks[1];
  assert((rectMark.type) === ('rect'), 'rect mark');
  assert(JSON.stringify([rectMark.x, rectMark.y, rectMark.width, rectMark.height].map(Math.round)) === JSON.stringify([400, 100, 300, 200]), 'rect normalized to canvas coordinates');
  await page.click('.cs-dock-btn[aria-label="Ellipse (O)"]');
  await drag([100, 450], [400, 650]);
  snap = await waitForMarks(3);
  assert((snap.document.marks[2].type) === ('ellipse'), 'ellipse mark');
  const pixels = await page.evaluate(() => {
    const context = document.getElementById('painting-canvas').getContext('2d');
    const sample = (x, y) => { const d = context.getImageData(x, y, 1, 1).data; return `${d[0]},${d[1]},${d[2]}`; };
    return { rectIn: sample(550, 200), ellipseIn: sample(250, 550), ellipseOut: sample(250, 440) };
  });
  assert(pixels.rectIn !== '247,243,232', `rect pixel painted: ${pixels.rectIn}`);
  assert(pixels.ellipseIn !== '247,243,232', `ellipse pixel painted: ${pixels.ellipseIn}`);
  assert(pixels.ellipseOut === '247,243,232', `outside the ellipse stays background: ${pixels.ellipseOut}`);

  // 5. 100% transform check only, then back to Fit for painting
  await page.click('#global-header button:has-text("100%")');
  await page.waitForTimeout(250);
  const full = await box();
  assert(Math.abs(full.width - 1000) < 0.5 && Math.abs(full.height - 700) < 0.5, '100% restores exact 1000x700');
  await page.click('#global-header button:has-text("Fit")');
  await page.waitForTimeout(250);

  // 6. Hand pans without mutation; a stroke at a fixed screen point maps through the transform
  await page.click('.cs-dock-btn[aria-label="Hand (H)"]');
  const before = await box();
  const s = before.width / 1000;
  const fixedScreen = { x: before.x + 400 * s, y: before.y + 300 * s };
  await page.mouse.move(fixedScreen.x, fixedScreen.y);
  await page.mouse.down();
  await page.mouse.move(fixedScreen.x + 120, fixedScreen.y + 80, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const after = await box();
  assert(Math.abs(after.x - before.x - 120) < 1.5 && Math.abs(after.y - before.y - 80) < 1.5, 'hand drag pans the canvas');
  const marksBefore = (await state()).document.marks.length;
  await page.click('.cs-dock-btn[aria-label="Paintbrush (B)"]');
  await page.mouse.move(fixedScreen.x, fixedScreen.y);
  await page.mouse.down();
  await page.mouse.move(fixedScreen.x + 60 * s, fixedScreen.y + 50 * s, { steps: 3 });
  await page.mouse.up();
  snap = await waitForMarks(marksBefore + 1);
  const pannedStroke = snap.document.marks[snap.document.marks.length - 1];
  const expectedStart = [Math.round(400 - 120 / s), Math.round(300 - 80 / s)];
  assert(JSON.stringify(pannedStroke.points[0].map(Math.round)) === JSON.stringify(expectedStart), `panned stroke maps through the transform: ${JSON.stringify(pannedStroke.points[0])} vs ${JSON.stringify(expectedStart)}`);

  // 7. Inspecting a layer returns to brush on canvas pointerdown
  await page.click('.cs-layer-name');
  await page.waitForTimeout(200);
  const layerTitle = await page.textContent('.cs-insp-title');
  assert(/layer/i.test(layerTitle), `layer properties open: ${layerTitle}`);
  const marksBeforeReturn = (await state()).document.marks.length;
  await drag([500, 100], [620, 180], 3);
  snap = await waitForMarks(marksBeforeReturn + 1);
  assert((snap.document.marks[snap.document.marks.length - 1].type) === ('stroke'), 'canvas pointerdown paints');
  const returnTitle = await page.textContent('.cs-insp-title');
  assert(/brush/i.test(returnTitle), `inspector returned to brush: ${returnTitle}`);

  // 8. Undo and redo
  await page.click('#global-header button:has-text("Undo")');
  snap = await waitForMarks(marksBeforeReturn);
  await page.click('#global-header button:has-text("Redo")');
  snap = await waitForMarks(marksBeforeReturn + 1);

  // 9. Save the v2 project, undo to empty, and open restores the exact artwork
  await page.fill('.cs-filename', 'project');
  await page.keyboard.press('Enter');
  const savedMarks = snap.document.marks.map((mark) => JSON.parse(JSON.stringify(mark)));
  await openDocumentMenu();
  const [jsonDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button:has-text("Save Project JSON")'),
  ]);
  await jsonDownload.saveAs('artifacts/browser-check/project.json');
  await page.waitForTimeout(300);
  let count = (await state()).document.marks.length;
  while (count > 0) {
    await page.click('#global-header button:has-text("Undo")');
    count -= 1;
    await waitForMarks(count);
  }
  await openDocumentMenu();
  const openItem = page.locator('.cs-menu-item', { hasText: 'Open Project JSON…' });
  assert(await openItem.isVisible(), 'Open Project JSON menu item visible');
  assert(await openItem.isEnabled(), 'Open Project JSON menu item enabled');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  assert(await openItem.isHidden(), 'document menu closed after Escape');
  await page.setInputFiles('#global-header input[type="file"]', 'artifacts/browser-check/project.json');
  snap = await waitForMarks(savedMarks.length);
  assert(JSON.stringify(JSON.parse(JSON.stringify(snap.document.marks))) === JSON.stringify(savedMarks), 'open restores the exact saved v2 artwork');

  // 10. Export the committed artwork as a 1000x700 PNG
  await page.fill('.cs-filename', 'artwork');
  await page.keyboard.press('Enter');
  const [pngDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.click('button[aria-label="Export PNG (committed artwork)"]'),
  ]);
  const pngSuggested = pngDownload.suggestedFilename();
  assert(pngSuggested.endsWith('.png'), `png download suggested: ${pngSuggested}`);
  await pngDownload.saveAs('artifacts/browser-check/artwork.png');

  assert(problems.length === 0, `no runtime problems: ${JSON.stringify(problems)}`);
  return { success: true, marks: snap.document.marks.length, png: pngSuggested };
}
