async (page) => {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`layers-opacity: ${message}`);
  };
  const problems = [];
  const updates = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });
  page.on('response', (response) => { if (response.status() >= 400) problems.push(`http ${response.status()}: ${response.url()}`); });
  page.on('request', (request) => {
    if (!request.url().includes('/api/commands') || request.method() !== 'POST') return;
    try {
      const body = JSON.parse(request.postData() ?? '{}');
      if (body.commands?.[0]?.type === 'layer.update') updates.push(body.commands[0]);
    } catch {}
  });
  const state = async () => page.evaluate(async () => (await (await fetch('/api/state')).json()));
  const waitFor = async (predicate, label) => {
    let latest;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      latest = await state();
      if (predicate(latest)) return latest;
      await page.waitForTimeout(75);
    }
    throw new Error(`layers-opacity: never ${label}; state=${JSON.stringify(latest).slice(0, 240)}`);
  };
  const pixel = (x, y) => page.evaluate(([px, py]) => {
    const data = document.querySelector('#painting-canvas').getContext('2d').getImageData(px, py, 1, 1).data;
    return [...data].slice(0, 3);
  }, [x, y]);
  const dragCanvas = async (from, to) => {
    const box = await page.locator('#painting-canvas').boundingBox();
    const scale = box.width / 1000;
    await page.mouse.move(box.x + from[0] * scale, box.y + from[1] * scale);
    await page.mouse.down();
    await page.mouse.move(box.x + to[0] * scale, box.y + to[1] * scale, { steps: 5 });
    await page.mouse.up();
  };
  const near = (actual, expected, tolerance = 4) => actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance);

  await page.setViewportSize({ width: 1200, height: 800 });
  await page.waitForSelector('#control-host button[aria-label="Painting"]', { timeout: 15000 });
  await dragCanvas([120, 160], [320, 220]);
  let snap = await waitFor((value) => value.document.marks.length === 1, 'stroke');
  const point = snap.document.marks[0].points[Math.floor(snap.document.marks[0].points.length / 2)].map(Math.round);
  const painted = await pixel(point[0], point[1]);
  assert(!near(painted, [247, 243, 232], 1), `stroke changes artwork pixels: ${painted}`);

  await page.getByRole('button', { name: 'Painting', exact: true }).click({ force: true, position: { x: 20, y: 6 } });
  const opacity = page.getByRole('slider', { name: 'Painting opacity' });
  await opacity.waitFor({ state: 'attached' });
  assert((await opacity.inputValue()) === '100', `active layer starts at 100%: control=${await opacity.inputValue()} state=${(await state()).document.layers[0].opacity}`);
  const before = updates.length;
  await opacity.focus();
  await page.keyboard.press('Home');
  for (let value = 0; value < 65; value += 1) await page.keyboard.press('ArrowRight');
  snap = await waitFor((value) => value.document.layers[0].opacity === 0.65, 'rapid opacity final value');
  assert((await opacity.inputValue()) === '65', 'polling preserves final range value');
  assert(updates.length > before && updates.length <= before + 65, `rapid edit stays bounded: ${updates.length - before}`);
  assert(updates.at(-1)?.opacity === 0.65, 'latest opacity write carries the final value');
  const faded = await pixel(point[0], point[1]);
  assert(!near(faded, painted, 2), `opacity changes rendered pixels: ${painted} to ${faded}`);

  const rangeBox = await opacity.boundingBox();
  await page.mouse.move(rangeBox.x + rangeBox.width * 0.25, rangeBox.y + rangeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(rangeBox.x + rangeBox.width + 300, rangeBox.y + rangeBox.height / 2, { steps: 3 });
  await page.mouse.up();
  snap = await waitFor((value) => value.document.layers[0].opacity === 1, 'captured opacity drag');
  assert((await opacity.inputValue()) === '100', 'range keeps pointer capture and clamps rightward to 100%');

  const eye = page.getByRole('button', { name: 'Painting visibility' });
  await eye.click({ force: true });
  await waitFor((value) => value.document.layers[0].visible === false, 'visibility off');
  assert(near(await pixel(point[0], point[1]), [247, 243, 232], 1), 'hidden layer removes its pixels');
  await eye.click({ force: true });
  await waitFor((value) => value.document.layers[0].visible === true, 'visibility on');
  assert(!near(await pixel(point[0], point[1]), [247, 243, 232], 1), 'visible layer repaints its pixels');
  assert(problems.length === 0, `no runtime problems: ${JSON.stringify(problems)}`);
  return { success: true, opacity: (await state()).document.layers[0].opacity, updates: updates.length };
}
