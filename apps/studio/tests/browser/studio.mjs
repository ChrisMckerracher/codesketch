async (page) => {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`studio.mjs check failed: ${message}`);
  };
  const problems = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });
  page.on('requestfailed', (request) => problems.push(`requestfailed: ${request.url()}`));
  page.on('response', (response) => { if (response.status() >= 400) problems.push(`http ${response.status()}: ${response.url()}`); });

  const state = async () => page.evaluate(async () => (await (await fetch('/api/state')).json()));
  const waitForMarks = async (count, message) => {
    let latest;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      latest = await state();
      if (latest.document.marks.length === count) return latest;
      await page.waitForTimeout(75);
    }
    throw new Error(`${message}: marks=${latest?.document?.marks?.length}`);
  };
  const waitForLayers = async (count, message) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const latest = await state();
      if (latest.document.layers.length === count) return latest;
      await page.waitForTimeout(75);
    }
    throw new Error(message);
  };
  const canvas = page.locator('#painting-canvas');
  const dragCanvas = async (from, to, steps = 8) => {
    const bounds = await canvas.boundingBox();
    const scale = bounds.width / 1000;
    await page.mouse.move(bounds.x + from[0] * scale, bounds.y + from[1] * scale);
    await page.mouse.down();
    await page.mouse.move(bounds.x + to[0] * scale, bounds.y + to[1] * scale, { steps });
    await page.mouse.up();
  };
  const dragRange = async (name, ratio) => {
    const control = page.getByRole('slider', { name, exact: true });
    const box = await control.boundingBox();
    await page.mouse.click(box.x + box.width * ratio, box.y + box.height / 2);
  };
  const pixel = (x, y) => page.evaluate(([px, py]) => {
    const data = document.querySelector('#painting-canvas').getContext('2d').getImageData(px, py, 1, 1).data;
    return [...data];
  }, [x, y]);

  await page.setViewportSize({ width: 1200, height: 800 });
  await page.waitForSelector('#painting-canvas', { timeout: 15000 });
  const base = await state();
  assert(base.instanceId && base.document, 'studio connects');
  assert(base.document.marks.length === 0, 'fresh in-memory fixture starts without marks');
  assert(await page.getByRole('button', { name: 'INK' }).count() === 1, 'INK has button role');
  assert(await page.getByRole('button', { name: 'PENCIL' }).count() === 1, 'PENCIL has button role');
  assert(await page.getByRole('button', { name: 'Cadmium Red' }).count() === 1, 'pigment chip has button role');
  assert(await page.getByRole('slider', { name: 'SIZE' }).count() === 1, 'size descriptor has slider role');

  await page.getByRole('button', { name: 'PENCIL' }).click();
  await page.getByRole('button', { name: 'INK' }).click();
  await dragRange('SIZE', 0.495);
  await dragRange('OPACITY', 0.78);
  await dragRange('SMOOTHING', 0.88);
  const brushSize = Number(await page.getByRole('slider', { name: 'SIZE', exact: true }).inputValue());
  const brushOpacity = Number(await page.getByRole('slider', { name: 'OPACITY', exact: true }).inputValue()) / 100;
  const brushSmoothing = Number(await page.getByRole('slider', { name: 'SMOOTHING', exact: true }).inputValue());
  assert(brushSize >= 1 && brushSize <= 100, `size slider value is valid: ${brushSize}`);
  assert(brushOpacity === 0.8, `opacity slider is 80 percent: ${brushOpacity}`);
  assert(brushSmoothing === 90, `smoothing slider is 90 percent: ${brushSmoothing}`);
  await page.getByRole('button', { name: 'Cadmium Red' }).click();

  await dragCanvas([100, 200], [300, 250]);
  await waitForMarks(1, 'real pointer stroke commits');
  let current = await state();
  let stroke = current.document.marks[0];
  assert(stroke.type === 'stroke' && stroke.layer === 'paint', 'stroke is stored on paint layer');
  assert(stroke.color === '#dc2626' && stroke.size === brushSize && stroke.opacity === brushOpacity && stroke.brush === 'brush', `stored stroke captures current brush properties: ${JSON.stringify(stroke)}`);
  assert(stroke.points.length >= 2, 'stroke stores pointer movement');

  await page.getByRole('button', { name: '#DC2626' }).click();
  await page.getByRole('button', { name: 'Saturation and value' }).click({ position: { x: 180, y: 12 } });
  await page.getByRole('slider', { name: 'Hue' }).click({ position: { x: 120, y: 6 } });
  assert(await page.getByRole('button', { name: 'Apply pigment' }).count() === 1, 'picker opens with APPLY control');
  await page.getByRole('button', { name: 'Apply pigment' }).click();
  await page.getByRole('button', { name: 'Apply pigment' }).waitFor({ state: 'detached' });
  const pickerColor = (await page.locator('button[aria-label^="#"]').getAttribute('aria-label')).toLowerCase();
  await dragCanvas([350, 200], [450, 250]);
  await waitForMarks(2, 'stroke after picker commits');
  current = await state();
  stroke = current.document.marks[1];
  assert(stroke.color === pickerColor, `next stroke uses applied picker color: ${stroke.color} !== ${pickerColor}`);

  await page.getByRole('button', { name: 'Cadmium Red' }).click();
  await dragRange('SIZE', 0.59);
  const eraserSize = Number(await page.getByRole('slider', { name: 'SIZE', exact: true }).inputValue());
  assert(eraserSize >= 1 && eraserSize <= 100, `eraser size slider value is valid: ${eraserSize}`);
  await dragCanvas([180, 500], [320, 500]);
  await waitForMarks(3, 'lower layer stroke commits');
  await page.getByRole('button', { name: 'New layer' }).click();
  await waitForLayers(2, 'new layer commits');
  await page.getByRole('button', { name: 'Cobalt Blue' }).click();
  await dragCanvas([180, 500], [320, 500]);
  await waitForMarks(4, 'upper layer stroke commits');
  const upperPixel = await pixel(250, 500);
  assert(upperPixel[2] > upperPixel[0], 'upper layer pixel is blue before erasing');
  await page.getByRole('button', { name: 'ERASE' }).click();
  await dragCanvas([180, 500], [320, 500]);
  current = await waitForMarks(5, 'eraser command commits');
  const lowerPixel = await pixel(250, 500);
  assert(lowerPixel[0] > lowerPixel[2], 'erasing upper layer reveals lower layer pixel');

  current = await state();
  const expected = await page.evaluate(async ({ instanceId, generation }) => {
    const query = `?expectedInstanceId=${encodeURIComponent(instanceId)}&expectedDocGeneration=${encodeURIComponent(generation)}`;
    return await (await fetch(`/api/project${query}`)).json();
  }, { instanceId: current.instanceId, generation: current.docGeneration });
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save project' }).click()]);
  await download.saveAs('artifacts/browser-check/project.json');
  const stream = await download.createReadStream();
  let downloaded = '';
  for await (const chunk of stream) downloaded += chunk.toString('utf8');
  const saved = JSON.parse(downloaded);
  assert(JSON.stringify(saved.commands) === JSON.stringify(expected.commands), 'download commands match server project');
  assert(JSON.stringify(saved.comments) === JSON.stringify(expected.comments), 'download comments match server project');
  assert(problems.length === 0, `no runtime problems: ${JSON.stringify(problems)}`);
  return { success: true, marks: current.document.marks.length, color: stroke.color };
}
