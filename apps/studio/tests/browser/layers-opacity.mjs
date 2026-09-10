async (page) => {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`layers-opacity: ${message}`);
  };
  const problems = [];
  const layerUpdates = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });
  page.on('response', (response) => { if (response.status() >= 400) problems.push(`http ${response.status()}: ${response.url()}`); });
  page.on('request', (request) => {
    if (request.url().includes('/api/commands') && request.method() === 'POST') {
      try {
        const body = JSON.parse(request.postData() ?? '{}');
        if (body.commands?.[0]?.type === 'layer.update') layerUpdates.push(body);
      } catch {}
    }
  });
  const state = async () => page.evaluate(async () => (await (await fetch('/api/state')).json()));
  const pixel = (x, y) => page.evaluate(([px, py]) => {
    const d = document.getElementById('painting-canvas').getContext('2d').getImageData(px, py, 1, 1).data;
    return `${d[0]},${d[1]},${d[2]}`;
  }, [x, y]);
  const background = '247,243,232';
  const backgroundRgb = [247, 243, 232];
  const inkRgb = [37, 61, 56];
  const brushAlpha = 1 - Math.pow(0.84, 5);
  const expectedPixel = (layerOpacity) => {
    const a = layerOpacity * brushAlpha;
    return `${Math.round(inkRgb[0] * a + backgroundRgb[0] * (1 - a))},${Math.round(inkRgb[1] * a + backgroundRgb[1] * (1 - a))},${Math.round(inkRgb[2] * a + backgroundRgb[2] * (1 - a))}`;
  };
  const nearPixel = (value, expected) => {
    const got = value.split(',').map(Number);
    const want = expected.split(',').map(Number);
    return got.every((channel, index) => Math.abs(channel - want[index]) <= 3);
  };
  const waitForPixel = async (x, y, expected, label) => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const value = await pixel(x, y);
      if (nearPixel(value, expected)) return value;
      await page.waitForTimeout(100);
    }
    throw new Error(`layers-opacity: pixel never ${expected} (${label}): ${await pixel(x, y)}`);
  };
  const waitFor = async (predicate, label, attempts = 30) => {
    let latest = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      latest = await state();
      if (predicate(latest)) return latest;
      await page.waitForTimeout(100);
    }
    throw new Error(`layers-opacity: never ${label}; state=${JSON.stringify(latest).slice(0, 200)}`);
  };
  const drain = async () => { for (let index = 0; index < 4; index += 1) await Promise.resolve(); };
  const panel = '#right-inspector .cs-insp-panel:not([hidden])';
  const numberInput = () => page.locator(`${panel} input[aria-label="Layer opacity percent"]`);
  const rangeInput = () => page.locator(`${panel} input[aria-label="Layer opacity"]`);
  const badge = () => page.textContent('.cs-layer-row >> nth=0 >> .cs-layer-opacity');

  await page.setViewportSize({ width: 1200, height: 800 });
  await page.waitForSelector('.cs-dock', { timeout: 15000 });
  await page.waitForTimeout(600);
  await page.mouse.move(560, 300);
  await page.mouse.down();
  await page.mouse.move(700, 400, { steps: 5 });
  await page.mouse.up();
  let snap = await waitFor((s) => s.document.marks.length === 1, 'ink stroke');
  const inkAt = snap.document.marks[0].points[0].map(Math.round);
  assert((await pixel(inkAt[0], inkAt[1])) !== background, 'stroke painted before opacity changes');

  await page.click('.cs-layer-name');
  await page.waitForSelector(`${panel} .cs-insp-name`, { timeout: 5000 });
  const generationAtStart = (await state()).docGeneration;

  await numberInput().fill('100');
  await numberInput().press('Enter');
  await waitFor((s) => s.document.layers[0].opacity === 1, 'opacity 100 committed');
  const fullInk = await waitForPixel(inkAt[0], inkAt[1], expectedPixel(1), 'opacity 100 full ink');
  assert((await badge()) === '100%', 'badge shows 100%');

  await numberInput().fill('0');
  await numberInput().press('Enter');
  await waitFor((s) => s.document.layers[0].opacity === 0, 'opacity 0 committed');
  assert((await waitForPixel(inkAt[0], inkAt[1], background, 'opacity 0')) === background, 'opacity 0 hides the stroke pixels');
  assert((await badge()) === '0%', `badge shows 0%: ${await badge()}`);

  await numberInput().fill('50');
  await numberInput().press('Enter');
  await waitFor((s) => s.document.layers[0].opacity === 0.5, 'opacity 50 committed');
  assert((await rangeInput().inputValue()) === '50', 'slider reflects the committed value');
  const blended = await waitForPixel(inkAt[0], inkAt[1], expectedPixel(0.5), 'opacity 50 blend');
  assert(blended !== background && blended !== fullInk, `opacity 50 blends pixels: ${blended}`);
  const [fr, fg, fb] = fullInk.split(',').map(Number);
  const [br, bg2, bb] = blended.split(',').map(Number);
  const deltas = [Math.abs(br - (backgroundRgb[0] + Math.round((fr - backgroundRgb[0]) / 2))), Math.abs(bg2 - (backgroundRgb[1] + Math.round((fg - backgroundRgb[1]) / 2))), Math.abs(bb - (backgroundRgb[2] + Math.round((fb - backgroundRgb[2]) / 2)))];
  assert(deltas.every((delta) => delta <= 3), `50% is the midpoint of background and the observed full ink: ${blended} deltas ${deltas}`);
  assert((await badge()) === '50%', 'badge shows 50%');

  await page.click(`${panel} .cs-insp-visibility`);
  await waitFor((s) => s.document.layers[0].visible === false, 'visibility hidden');
  assert((await pixel(inkAt[0], inkAt[1])) === background, 'hidden layer hides pixels');
  await page.click(`${panel} .cs-insp-visibility`);
  await waitFor((s) => s.document.layers[0].visible === true, 'visibility shown');
  assert(nearPixel(await waitForPixel(inkAt[0], inkAt[1], expectedPixel(0.5), 'shown repaint at 50% layer opacity'), expectedPixel(0.5)), 'shown layer repaints at its layer opacity');

  const updatesBefore = layerUpdates.length;
  await numberInput().focus();
  await numberInput().fill('4');
  await page.waitForTimeout(700);
  assert((await numberInput().inputValue()) === '4', 'held partial input survives polling');
  await numberInput().fill('40');
  await numberInput().press('Enter');
  await waitFor((s) => s.document.layers[0].opacity === 0.4, 'opacity 40 committed');
  assert(layerUpdates.length === updatesBefore + 1, `held edit committed exactly once: +${layerUpdates.length - updatesBefore}`);
  assert(layerUpdates[layerUpdates.length - 1].expectedDocGeneration === generationAtStart, 'commit carried the frozen generation');
  assert(await page.locator('.cs-insp-pending').isHidden(), 'pending indicator cleared after acceptance');

  const generationBefore = (await state()).docGeneration;
  await numberInput().focus();
  await numberInput().fill('9');
  await page.evaluate(async (generation) => {
    await fetch('/api/project', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: { format: 'codesketch', version: 2, commands: [], cursor: 0, queue: [], comments: [] }, source: 'human', expectedDocGeneration: generation }) });
  }, generationBefore);
  await waitFor((s) => s.document.marks.length === 0 && s.docGeneration !== generationBefore, 'server generation reset to a replacement document');
  await page.waitForFunction(() => {
    const input = document.querySelector('#right-inspector .cs-insp-panel:not([hidden]) input[aria-label="Layer opacity percent"]');
    return input && input.value === '100';
  }, { timeout: 5000 });
  await drain();
  assert(layerUpdates.length === updatesBefore + 1, 'held edit cancelled: no mutation reached the replacement document');
  assert((await numberInput().inputValue()) === '100', 'cancellation restores the replacement layer value (old edit text does not survive)');
  const commandsBefore = layerUpdates.length;
  await numberInput().press('Enter');
  await drain();
  await page.waitForTimeout(300);
  assert(layerUpdates.length === commandsBefore, 'stale held edit cannot mutate the replacement document');
  assert((await state()).docGeneration !== generationBefore, 'replacement document generation untouched');
  await drain();

  assert(problems.length === 0, `no runtime problems: ${JSON.stringify(problems)}`);
  return { success: true, layerUpdates: layerUpdates.length, background: (await state()).document.background };
}
