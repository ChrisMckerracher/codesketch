async (page) => {
  // V2 browser scenario: progressive playback HUD, native Step/Clear Pending/
  // Finish All with a held response, committed reference pixels, per-command
  // undo/redo, and empty-finish disabling. Fixtures use the guarded human
  // HTTP contract with top-level expectedDocGeneration on every write.
  const assert = (condition, message) => {
    if (!condition) throw new Error(`finish.mjs failed: ${message}`);
  };
  const problems = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });
  page.on('requestfailed', (request) => problems.push(`requestfailed: ${request.url()}`));
  page.on('response', (response) => { if (response.status() >= 400) problems.push(`http ${response.status()}: ${response.url()}`); });

  const origin = page.url().split('/').slice(0, 3).join('/');
  const state = async () => {
    const response = await page.request.get(`${origin}/api/state`);
    assert(response.ok(), `GET /api/state failed with ${response.status()}`);
    return await response.json();
  };
  const human = async (path, body) => {
    const snapshot = await state();
    const response = await page.request.post(`${origin}${path}`, {
      data: { source: 'human', expectedDocGeneration: snapshot.docGeneration, ...body },
    });
    const result = await response.json().catch(() => ({}));
    assert(response.ok(), `POST ${path} failed with ${response.status()}: ${JSON.stringify(result.error ?? result)}`);
    return result;
  };
  const project = async () => {
    const response = await page.request.get(`${origin}/api/project`);
    assert(response.ok(), `GET /api/project failed with ${response.status()}`);
    return await response.json();
  };
  const waitState = async (predicate, message, timeoutMs = 15000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const snapshot = await state();
      if (predicate(snapshot)) return snapshot;
      assert(Date.now() <= deadline, `timed out waiting for ${message}`);
      await page.waitForTimeout(80);
    }
  };
  const waitHud = (status, remaining, timeoutMs = 15000) => page.waitForFunction(([expectedStatus, expectedRemaining]) =>
    document.querySelector('#director-hud .cs-hud-status-text')?.textContent.trim() === expectedStatus &&
    document.querySelector('#director-hud .cs-hud-remaining')?.textContent.trim() === expectedRemaining,
  [status, remaining], { timeout: timeoutMs, polling: 80 });
  const hudButton = (label) => page.locator(`#director-hud button:text-is("${label}")`);
  const settle = () => page.evaluate(() => new Promise((resolve) => {
    let left = 3;
    const step = () => (left-- <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  }));
  const pixels = () => page.evaluate(() => document.getElementById('painting-canvas').toDataURL('image/png'));
  const samplePixel = (point) => page.evaluate(([x, y]) => {
    const d = document.getElementById('painting-canvas').getContext('2d').getImageData(x, y, 1, 1).data;
    return `${d[0]},${d[1]},${d[2]}`;
  }, point);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForSelector('#director-hud.cs-hud', { timeout: 15000 });
  await page.waitForFunction(() =>
    document.querySelector('#global-header .cs-status-text')?.textContent !== 'Connecting',
  null, { timeout: 15000 });

  // Fixture: one long active stroke (about 8s at 1x) plus 100 queued strokes.
  const longPoints = Array.from({ length: 23 }, (_, i) => [60 + i * 40, i % 2 ? 300 : 100]);
  const longStroke = { type: 'stroke', layer: 'paint', color: '#253d38', size: 10, points: longPoints };
  const batch = [longStroke, ...Array.from({ length: 100 }, (_, i) => ({
    type: 'stroke', layer: 'paint', color: '#253d38', size: 4, brush: 'pencil',
    points: [[40 + i * 4, 600], [46 + i * 4, 610]],
  }))];
  const reset = async () => {
    await human('/api/control', { action: 'new' });
    await waitState((snap) => snap.document.marks.length === 0 && snap.playback.status === 'idle', 'empty reset');
    await waitHud('Idle', '0 commands remaining');
    await settle();
    assert(await samplePixel([100, 300]) === '247,243,232', 'reset clears the rendered canvas');
  };

  // Immediate committed reference: the same 101 commands without playback.
  await reset();
  await human('/api/commands', { commands: batch, immediate: true, play: false });
  await waitState((snap) => snap.document.marks.length === 101, 'the committed reference fixture');
  await waitHud('Paused', '0 commands remaining');
  await settle();
  const referencePixels = await pixels();
  const reference = await project();
  assert(reference.commands.length === 101 && reference.queue.length === 0 && reference.cursor === 101,
    `unexpected reference project: ${reference.commands.length} commands`);

  // Real playback: the long stroke animates with a progressive HUD fraction.
  await reset();
  await human('/api/commands', { commands: batch, play: false });
  await waitState((snap) => snap.playback.status === 'paused' && snap.playback.remaining === 101 && !snap.playback.active,
    'the queued batch paused with 101 remaining');
  await waitHud('Paused', '101 commands remaining');
  await hudButton('Resume').click();
  await waitState((snap) => snap.playback.status === 'playing' && !!snap.playback.active, 'playback to start');
  const fractions = [];
  const progressDeadline = Date.now() + 12000;
  while (fractions.length < 3 && Date.now() < progressDeadline) {
    const view = await page.evaluate(() => ({
      status: document.querySelector('#director-hud .cs-hud-status-text')?.textContent.trim() ?? '',
      remaining: document.querySelector('#director-hud .cs-hud-remaining')?.textContent.trim() ?? '',
      shown: document.querySelector('#director-hud .cs-hud-active')?.hidden === false,
      percent: Number.parseInt(document.querySelector('#director-hud .cs-hud-active-value')?.textContent ?? '', 10),
    }));
    if (view.shown && view.status.startsWith('Playing') && view.remaining === '101 commands remaining'
        && Number.isFinite(view.percent) && (fractions.length === 0 || view.percent > fractions[fractions.length - 1])) {
      fractions.push(view.percent);
    }
    await page.waitForTimeout(90);
  }
  assert(fractions.length === 3, `the HUD never progressed through active fractions: ${JSON.stringify(fractions)}`);

  // Native pause preserves the partial active preview.
  await hudButton('Pause').click();
  const paused = await waitState((snap) => snap.playback.status === 'paused' && !!snap.playback.active,
    'paused playback with the preview preserved');
  await waitHud('Paused', '101 commands remaining');
  assert(paused.playback.active.progress > 0 && paused.playback.active.progress < 1,
    `paused mid-stroke fraction: ${paused.playback.active.progress}`);
  assert(JSON.stringify(paused.playback.active.command) === JSON.stringify(reference.commands[0]),
    'the active preview is the long first stroke');

  // Native Step completes exactly one command and stays paused.
  await hudButton('Step').click();
  let snap = await waitState((current) => current.playback.status === 'paused'
    && current.playback.remaining === 100 && current.document.marks.length === 1 && !current.playback.active,
  'step to commit one command and stay paused');
  await waitHud('Paused', '100 commands remaining');
  assert(JSON.stringify(snap.document.marks[0]) === JSON.stringify(reference.commands[0]),
    'the long stroke committed first in canonical form');
  assert(await samplePixel([100, 300]) !== '247,243,232', 'the stepped stroke painted real pixels');

  // Re-establish a deliberate long active preview: slow the fixture to 0.25x
  // and resume so a queued stroke draws beside the already committed mark.
  await human('/api/control', { action: 'speed', speed: 0.25 });
  await hudButton('Resume').click();
  await waitState((current) => !!current.playback.active
    && current.playback.active.progress > 0 && current.playback.active.progress < 1,
  'a partially drawn active preview beside the completed mark');
  assert((await state()).document.marks.length === 1, 'the completed mark survives while the preview draws');
  // Native Clear Pending removes the active preview and queue, keeping marks.
  await hudButton('Clear Pending').click();
  snap = await waitState((current) => current.playback.status === 'paused'
    && current.playback.remaining === 0 && current.document.marks.length === 1 && !current.playback.active,
  'clear to drop the active preview and queue');
  await waitHud('Paused', '0 commands remaining');
  assert(await samplePixel([100, 300]) !== '247,243,232', 'clear preserves completed marks');

  // Native Finish All on a fresh partially played batch while the runner
  // holds the finish request in flight (not a completed response): the
  // control must sit busy-disabled and mutate nothing meanwhile, and the
  // gate must release and its route be removed even if assertions fail.
  await reset();
  await human('/api/commands', { commands: batch, play: false });
  await waitHud('Paused', '101 commands remaining');
  await hudButton('Resume').click();
  await waitState((current) => current.playback.status === 'playing'
    && (current.playback.active?.progress ?? 0) > 0, 'a partially drawn active stroke');
  let releaseFinish;
  const heldRequest = new Promise((resolve) => { releaseFinish = resolve; });
  await page.route('**/api/control', async (route) => {
    if (route.request().method() === 'POST') await heldRequest;
    await route.continue().catch(() => {});
  });
  try {
    await hudButton('Finish All').click();
    await page.waitForTimeout(250);
    const busyDisabled = await page.evaluate(() =>
      [...document.querySelectorAll('#director-hud button')]
        .find((button) => button.textContent === 'Finish All')?.disabled === true);
    assert(busyDisabled, 'Finish All is not busy-disabled while its request is held in flight');
    const heldSnapshot = await state();
    assert(heldSnapshot.document.marks.length === 0 && heldSnapshot.playback.remaining === 101,
      'the held finish request must not mutate the session');
  } finally {
    releaseFinish();
    await page.unroute('**/api/control');
  }

  // Finish commits the active stroke plus all 100 queued commands in order.
  snap = await waitState((current) => current.playback.status === 'paused'
    && current.playback.remaining === 0 && current.document.marks.length === 101 && !current.playback.active,
  'finish to commit the active plus queued commands and stay paused');
  await waitHud('Paused', '0 commands remaining');
  const finished = await project();
  assert(JSON.stringify(finished.commands) === JSON.stringify(reference.commands),
    'finish commits the exact reference command order');
  assert(finished.queue.length === 0 && finished.cursor === 101, 'the finished project drains the queue');
  await settle();
  assert(await pixels() === referencePixels, 'the finished render matches the committed reference pixels');

  // Per-command Undo/Redo across the finished artwork.
  const undo = page.locator('#global-header button:text-is("Undo")');
  const redo = page.locator('#global-header button:text-is("Redo")');
  await undo.click();
  await waitState((current) => current.document.marks.length === 100, 'undo to remove one command');
  await undo.click();
  await waitState((current) => current.document.marks.length === 99, 'undo to remove a second command');
  await redo.click();
  await waitState((current) => current.document.marks.length === 100, 'redo to restore one command');
  await redo.click();
  snap = await waitState((current) => current.document.marks.length === 101, 'redo to restore the full artwork');
  await settle();
  assert(await pixels() === referencePixels, 'undo/redo restores the exact reference pixels');
  assert(await hudButton('Finish All').isDisabled(), 'the finished empty session disables Finish All');

  // Empty pending keeps Finish All disabled on an idle session.
  await reset();
  assert(await hudButton('Finish All').isDisabled(), 'the idle empty session disables Finish All');
  assert(problems.length === 0, `no runtime problems: ${JSON.stringify(problems)}`);
  return { success: true, marks: snap.document.marks.length, fractions };
}
