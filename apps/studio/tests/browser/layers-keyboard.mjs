async (page) => {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`layers-keyboard: ${message}`);
  };
  const problems = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });
  page.on('response', (response) => { if (response.status() >= 400) problems.push(`http ${response.status()}: ${response.url()}`); });
  const state = async () => page.evaluate(async () => (await (await fetch('/api/state')).json()));
  const box = async () => page.locator('#painting-canvas').boundingBox();
  const drag = async (from, to, steps = 4) => {
    const bounds = await box();
    const s = bounds.width / 1000;
    await page.mouse.move(bounds.x + from[0] * s, bounds.y + from[1] * s);
    await page.mouse.down();
    await page.mouse.move(bounds.x + to[0] * s, bounds.y + to[1] * s, { steps });
    await page.mouse.up();
  };
  const pixel = (x, y) => page.evaluate(([px, py]) => {
    const d = document.getElementById('painting-canvas').getContext('2d').getImageData(px, py, 1, 1).data;
    return `${d[0]},${d[1]},${d[2]}`;
  }, [x, y]);
  const waitFor = async (predicate, label, attempts = 30) => {
    let latest = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      latest = await state();
      if (predicate(latest)) return latest;
      await page.waitForTimeout(100);
    }
    throw new Error(`layers-keyboard: never ${label}; state=${JSON.stringify(latest).slice(0, 200)}`);
  };
  const pressedTool = () => page.locator('.cs-dock-btn[aria-pressed="true"]').getAttribute('aria-label');
  const panel = '#right-inspector .cs-insp-panel:not([hidden])';
  const background = '247,243,232';

  await page.setViewportSize({ width: 1200, height: 800 });
  await page.waitForSelector('.cs-dock', { timeout: 15000 });
  await page.waitForTimeout(600);
  assert((await state()).document.layers.length === 1, 'fresh session has one layer');

  await drag([150, 150], [230, 210]);
  await waitFor((s) => s.document.marks.length === 1, 'paint stroke');
  assert((await pixel(190, 180)) !== background, 'paint stroke pixel painted');

  await page.focus('.cs-layers-add');
  await page.keyboard.press('Enter');
  let snap = await waitFor((s) => s.document.layers.length === 2, 'keyboard layer add');
  assert(snap.document.layers[1].id === 'layer-2', 'generated layer id');
  assert(snap.document.layers[1].name === 'Layer 2', 'generated layer name');
  assert(await page.locator('.cs-layer-row').count() === 2, 'two layer rows');

  await page.focus('.cs-layer-row >> nth=0 >> .cs-layer-name');
  await page.keyboard.press('Enter');
  await page.waitForSelector(`${panel} .cs-insp-name`, { timeout: 5000 });
  assert((await page.inputValue(`${panel} .cs-insp-name`)) === 'Layer 2', 'keyboard select opened layer properties');

  await page.focus('.cs-layer-row >> nth=0 >> .cs-layer-name');
  await page.keyboard.press('F2');
  await page.waitForSelector('.cs-layer-rename', { timeout: 5000 });
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Ink Lines');
  await page.keyboard.press('Enter');
  snap = await waitFor((s) => s.document.layers[1].name === 'Ink Lines', 'keyboard rename commit');
  assert((await page.textContent('.cs-layer-row >> nth=0 >> .cs-layer-name')) === 'Ink Lines', 'row shows renamed layer');

  await page.keyboard.press('Shift+p');
  await drag([600, 300], [640, 330]);
  snap = await waitFor((s) => s.document.marks.length === 2, 'pencil stroke');
  assert(snap.document.marks[1].brush === 'pencil', 'pencil brush metadata');
  assert(snap.document.marks[1].layer === 'layer-2', 'pencil on target layer');
  await page.keyboard.press('m');
  await drag([620, 380], [660, 410]);
  snap = await waitFor((s) => s.document.marks.length === 3, 'marker stroke');
  assert(snap.document.marks[2].brush === 'marker', 'marker brush metadata');

  await page.keyboard.press('b');
  await page.waitForSelector(`${panel} input[aria-label="Brush size in pixels"]`, { timeout: 5000 });
  await page.fill(`${panel} input[aria-label="Brush size in pixels"]`, '33');
  await page.keyboard.press('Enter');
  await drag([400, 400], [460, 450]);
  snap = await waitFor((s) => s.document.marks.length === 4, 'target layer stroke');
  await page.waitForTimeout(250);
  assert((await pixel(430, 425)) !== background, 'target stroke painted at the erased location before erasing');

  await page.keyboard.press('e');
  await drag([400, 400], [460, 450]);
  snap = await waitFor((s) => s.document.marks.length === 5, 'eraser stroke');
  assert(snap.document.marks[4].brush === 'eraser', 'eraser brush metadata');
  assert(snap.document.marks[4].layer === 'layer-2', 'eraser stayed on target layer');
  await page.waitForTimeout(250);
  assert((await pixel(430, 425)) === background, 'eraser cleared the target layer stroke');
  assert((await pixel(190, 180)) !== background, 'eraser left the other layer painted');
  const pencilPixel = await pixel(620, 315);
  assert(pencilPixel !== background, `eraser left other target strokes painted: ${pencilPixel}; pencil points ${JSON.stringify(snap.document.marks[1].points)}`);

  await page.click('.cs-layer-row >> nth=0 >> .cs-layer-name');
  await page.waitForTimeout(200);
  assert.match(await page.textContent('.cs-insp-title'), /Layer Properties/i, 'inspecting layer');
  await drag([300, 500], [360, 550]);
  snap = await waitFor((s) => s.document.marks.length === 6, 'post-return stroke');
  const returned = snap.document.marks[5];
  assert(returned.brush === 'brush', 'canvas pointerdown returned to brush');
  assert(returned.layer === 'layer-2', 'target preserved through inspect/return');
  assert(returned.size === 33, 'brush size parameter preserved');
  assert.match(await page.textContent('.cs-insp-title'), /Brush Properties/i, 'inspector back on brush');

  await page.focus('.cs-filename');
  await page.keyboard.press('e');
  assert((await page.inputValue('.cs-filename')) === 'e', 'editable input keeps native typing');
  assert((await pressedTool()) === 'Paintbrush (B)', 'typing in an input never runs tool shortcuts');
  await page.focus('.cs-dock-btn[aria-label="Marker (M)"]');
  await page.keyboard.press(' ');
  await page.waitForTimeout(200);
  assert((await pressedTool()) === 'Marker (M)', 'space on a focused button natively activates it, not the eraser shortcut');

  assert(problems.length === 0, `no runtime problems: ${JSON.stringify(problems)}`);
  return { success: true, layers: snap.document.layers.length, marks: snap.document.marks.length };
}
