// Browser end-to-end scenario: Skip-to-end finish control. Executed via playwright-cli run-code.
async (page) => {
  const errors = [];
  page.on('pageerror', (err) => { errors.push(err.message); });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForSelector('#canvas');
  await page.waitForSelector('#btn-finish');

  const post = (path, body) => page.evaluate(async ({ path, body }) => {
    const response = await fetch(path, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return response.status;
  }, { path, body });
  const state = () => page.evaluate(async () => await (await fetch('/api/state')).json());
  const project = () => page.evaluate(async () => await (await fetch('/api/project')).json());
  const waitFor = async (match, timeout = 60000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const snap = await state();
      if (match(snap)) return snap;
      await page.waitForTimeout(200);
    }
    throw new Error('finish scenario condition not reached');
  };
  const expectStatus = async (response, what) => {
    if (response !== 200) throw new Error(`${what} failed with HTTP ${response}`);
  };
  const settleFrames = (count = 5) => page.evaluate((frames) => new Promise((resolve) => {
    let left = frames;
    const step = () => (left-- <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  }), count);
  // Browser-observed playback state: the status pill and queue counter, not the API.
  const waitDomPlayback = (statusText, timeout = 60000) => page.waitForFunction((expected) => {
    const pill = document.getElementById('status-label')?.textContent.trim();
    const queue = document.getElementById('queue-count')?.textContent.trim();
    return pill === expected && queue === '0';
  }, statusText, { polling: 200, timeout });

  const longStroke = { type: 'stroke', layer: 'paint', color: '#253d38', size: 10, brush: 'brush',
    points: Array.from({ length: 40 }, (_, i) => [30 + (i % 2) * 60 + i * 8, 40 + i * 15]) };
  const batch = [longStroke, ...Array.from({ length: 100 }, (_, i) => ({ type: 'stroke', layer: 'paint',
    color: '#253d38', size: 4, brush: 'pencil', points: [[40 + i * 4, 600], [46 + i * 4, 610]] }))];

  // Ordinary completed reference: the same batch at speed 8, browser-observed Idle/0.
  await expectStatus(await post('/api/control', { action: 'new', source: 'human' }), 'reset');
  await expectStatus(await post('/api/commands', { commands: batch, play: false, source: 'human' }), 'reference batch');
  await expectStatus(await post('/api/control', { action: 'speed', speed: 8, source: 'human' }), 'reference speed');
  await expectStatus(await post('/api/control', { action: 'resume', source: 'human' }), 'reference resume');
  await waitFor((s) => s.playback.status === 'idle' && s.playback.remaining === 0);
  // The browser must have polled and rendered the completed state before capture.
  await waitDomPlayback('Idle');
  await settleFrames();
  const referencePixels = await page.evaluate(() => document.getElementById('canvas').toDataURL('image/png'));
  const reference = await project();
  if (reference.commands.length !== 101 || reference.queue.length !== 0) {
    throw new Error(`unexpected reference document: ${reference.commands.length} commands, ${reference.queue.length} queued`);
  }

  // Real partial playback: the long stroke animates at 0.25x with 100 commands queued behind it.
  await expectStatus(await post('/api/control', { action: 'new', source: 'human' }), 'reset');
  await expectStatus(await post('/api/commands', { commands: batch, play: false, source: 'human' }), 'paused batch');
  await expectStatus(await post('/api/control', { action: 'speed', speed: 0.25, source: 'human' }), 'slow speed');
  await expectStatus(await post('/api/control', { action: 'resume', source: 'human' }), 'slow resume');
  const partial = await waitFor((s) => s.playback.active
    && s.playback.active.progress > 0 && s.playback.active.progress < 1, 20000);
  const active = partial.playback.active.command;
  if (active.type !== 'stroke' || active.layer !== 'paint' || active.brush !== 'brush'
      || active.points?.length !== longStroke.points.length
      || JSON.stringify(active.points) !== JSON.stringify(longStroke.points)) {
    throw new Error('the active preview is not the long first stroke');
  }
  await expectStatus(await post('/api/control', { action: 'pause', source: 'human' }), 'pause');
  const paused = await state();
  if (paused.playback.status !== 'paused' || !paused.playback.active) {
    throw new Error('the active partial preview did not survive the pause');
  }

  await page.waitForFunction(() => document.getElementById('btn-finish')?.disabled === false,
    null, { polling: 200, timeout: 15000 });
  const label = await page.evaluate(() => ({ aria: document.getElementById('btn-finish').getAttribute('aria-label'),
    text: document.getElementById('btn-finish').textContent.trim() }));
  if (!/Skip to end/.test(label.aria) || !/Skip to end/.test(label.text)) {
    throw new Error(`finish button lacks a meaningful label: ${JSON.stringify(label)}`);
  }

  // The busy state must survive incoming snapshots while the request is in flight.
  let releaseFinish;
  const finishGate = new Promise((resolve) => { releaseFinish = resolve; });
  await page.route('**/api/control', async (route) => {
    await finishGate;
    await route.continue().catch(() => {});
  });
  await page.click('#btn-finish');
  const busyDisabled = await page.evaluate(() => document.getElementById('btn-finish')?.disabled === true);
  releaseFinish();
  if (!busyDisabled) throw new Error('finish button is not busy-disabled during the in-flight finish');

  await page.waitForFunction(() => document.getElementById('notification-message')?.textContent.includes('Drawing complete'),
    null, { polling: 200, timeout: 20000 });
  await waitDomPlayback('Paused');
  await settleFrames();
  const finishPixels = await page.evaluate(() => document.getElementById('canvas').toDataURL('image/png'));
  if (finishPixels !== referencePixels) {
    throw new Error('finished render does not match the naturally completed reference');
  }
  const finishedProject = await project();
  const finished = await state();
  if (finished.playback.status !== 'paused' || finished.playback.remaining !== 0) {
    throw new Error(`unexpected post-finish playback: ${JSON.stringify(finished.playback)}`);
  }
  if (finished.history.total !== 101) {
    throw new Error(`expected 101 committed commands after finish, got ${finished.history.total}`);
  }
  if (JSON.stringify(finishedProject.commands) !== JSON.stringify(reference.commands)
      || finishedProject.queue.length !== 0) {
    throw new Error('finished document does not equal the reference document in exact order');
  }

  // Empty pending disables the control while the accessible label stays meaningful.
  await expectStatus(await post('/api/control', { action: 'new', source: 'human' }), 'reset');
  await page.waitForFunction(() => document.getElementById('btn-finish')?.disabled === true,
    null, { polling: 200, timeout: 15000 });
  const emptyLabel = await page.evaluate(() => document.getElementById('btn-finish')?.getAttribute('aria-label'));
  if (!/Skip to end/.test(emptyLabel)) throw new Error('finish button lost its accessible label when empty');
  if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
  return { success: true };
}
