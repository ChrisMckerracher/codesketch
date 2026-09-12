async (page) => {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`layers-keyboard: ${message}`);
  };
  const problems = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });
  page.on('response', (response) => { if (response.status() >= 400) problems.push(`http ${response.status()}: ${response.url()}`); });
  const state = async () => page.evaluate(async () => (await (await fetch('/api/state')).json()));
  const waitFor = async (predicate, label) => {
    let latest;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      latest = await state();
      if (predicate(latest)) return latest;
      await page.waitForTimeout(75);
    }
    throw new Error(`layers-keyboard: never ${label}; state=${JSON.stringify(latest).slice(0, 240)}`);
  };
  const button = (label) => page.locator(`#control-host button[aria-label="${label}"]`);
  const range = (label) => page.locator(`#control-host input[type="range"][aria-label="${label}"]`);
  const dragCanvas = async (from, to) => {
    const box = await page.locator('#painting-canvas').boundingBox();
    const scale = box.width / 1000;
    await page.mouse.move(box.x + from[0] * scale, box.y + from[1] * scale);
    await page.mouse.down();
    await page.mouse.move(box.x + to[0] * scale, box.y + to[1] * scale, { steps: 4 });
    await page.mouse.up();
  };

  await page.setViewportSize({ width: 1200, height: 800 });
  await page.waitForSelector('#control-host button[aria-label="INK"]', { timeout: 15000 });
  await page.waitForTimeout(300);
  let snap = await state();
  assert(snap.document.layers.length === 1, 'fresh session has one layer');
  assert(await page.getByRole('button', { name: 'INK' }).count() === 1, 'tool is a semantic button');
  assert(await page.getByRole('slider', { name: 'SIZE' }).count() === 1, 'size is a semantic slider');

  await page.getByRole('button', { name: 'PENCIL' }).focus();
  await page.getByRole('button', { name: 'PENCIL', exact: true }).press('Enter');
  await dragCanvas([100, 120], [160, 160]);
  snap = await waitFor((value) => value.document.marks.length === 1, 'keyboard pencil stroke');
  assert(snap.document.marks[0].brush === 'pencil', 'keyboard tool activation reaches the stroke');
  await page.getByRole('button', { name: 'INK' }).focus();
  await page.getByRole('button', { name: 'INK', exact: true }).press(' ');
  await dragCanvas([200, 120], [260, 160]);
  snap = await waitFor((value) => value.document.marks.length === 2, 'keyboard brush stroke');
  assert(snap.document.marks[1].brush === 'brush', 'space tool activation reaches the stroke');

  const size = page.getByRole('slider', { name: 'SIZE' });
  await size.focus();
  await page.keyboard.press('Home');
  assert((await size.inputValue()) === '1', 'slider Home');
  await page.keyboard.press('End');
  assert((await size.inputValue()) === '100', 'slider End');
  await page.keyboard.press('ArrowLeft');
  assert((await size.inputValue()) === '99', 'slider ArrowLeft');
  await dragCanvas([300, 120], [360, 160]);
  snap = await waitFor((value) => value.document.marks.length === 3, 'keyboard size stroke');
  assert(snap.document.marks[2].size === 99, 'slider value reaches the subsequent stroke');

  for (let index = 0; index < 9; index += 1) {
    await button('New layer').click();
    await waitFor((value) => value.document.layers.length === index + 2, `layer ${index + 2} add`);
  }
  snap = await state();
  const ids = snap.document.layers.map((layer) => layer.id);
  const names = snap.document.layers.map((layer) => layer.name);
  assert(new Set(ids).size === ids.length, 'layer IDs are unique');
  assert(names.every((name) => typeof name === 'string' && name.length > 0), 'layers have names');
  assert(await button(names.at(-1)).count() === 1, 'top-down row uses actual layer name');

  const firstRow = button(names.at(-1));
  const firstBox = await firstRow.boundingBox();
  const scale = (await page.locator('#painting-canvas').boundingBox()).width / 1000;
  assert(firstBox && Math.abs(firstBox.height / scale - 50) < 0.5, 'active row has a 50px design-space hit area');
  await firstRow.focus();
  await page.keyboard.press('Enter');
  assert(await range(`${names.at(-1)} opacity`).count() === 1, 'active layer mounts opacity slider');
  await dragCanvas([420, 120], [480, 160]);
  snap = await waitFor((value) => value.document.marks.length === 4, 'stroke on selected layer');
  assert(snap.document.marks.at(-1).layer === ids.at(-1), 'stroke stores the selected actual layer id');

  const eye = button(`${names.at(-1)} visibility`);
  await eye.focus();
  await page.keyboard.press(' ');
  await waitFor((value) => value.document.layers.at(-1).visible === false, 'keyboard visibility toggle');
  await page.keyboard.press(' ');
  await waitFor((value) => value.document.layers.at(-1).visible === true, 'keyboard visibility restore');

  await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
  await page.mouse.wheel(0, 180);
  await page.waitForTimeout(250);
  assert(await button(names[0]).count() === 1, 'wheel over a mounted row scrolls the clipped layer viewport');
  const visibleIds = await page.locator('#control-host button').evaluateAll((nodes) => nodes
    .map((node) => node.getAttribute('aria-label')).filter((label) => label && !label.endsWith(' visibility')));
  assert(visibleIds.includes(names[0]), 'scrolled rows retain actual document names');
  assert(problems.length === 0, `no runtime problems: ${JSON.stringify(problems)}`);
  return { success: true, layers: ids.length, scrolledTo: ids[0], marks: (await state()).document.marks.length };
}
