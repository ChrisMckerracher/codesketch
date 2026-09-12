// Browser race coverage for the current mounted vector feedback controls.
async (page) => {
  const checks = [];
  const problems = [];
  const done = (name) => checks.push(name);
  const assert = (condition, message) => {
    if (!condition) throw new Error(`COMMENT RACES FAILED: ${message}`);
  };
  const origin = page.url().split('/').slice(0, 3).join('/');
  const state = async () => {
    const response = await page.request.get(`${origin}/api/state`);
    assert(response.ok(), `GET /api/state failed with ${response.status()}`);
    return response.json();
  };
  const human = async (path, body) => {
    const snapshot = await state();
    const response = await page.request.post(`${origin}${path}`, {
      data: { source: 'human', expectedDocGeneration: snapshot.docGeneration, ...body },
    });
    const result = await response.json();
    assert(response.ok(), `POST ${path} failed with ${response.status()}: ${JSON.stringify(result.error ?? result)}`);
    return result;
  };
  const waitState = async (predicate, message, timeoutMs = 8000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const snapshot = await state();
      if (predicate(snapshot)) return snapshot;
      if (Date.now() > deadline) throw new Error(`COMMENT RACES FAILED: timed out waiting for ${message}`);
      await page.waitForTimeout(100);
    }
  };
  const control = (label) => page.locator(`#control-host [aria-label="${label}"]`);
  const click = (label) => control(label).click({ timeout: 8000 });
  const canvas = page.locator('#painting-canvas');
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  const dragRegion = async (from, to) => {
    const box = await canvas.boundingBox();
    assert(box, 'painting canvas must be mounted');
    await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 6 });
    await page.mouse.up();
    try {
      await control('Feedback draft').waitFor({ timeout: 8000 });
    } catch (error) {
      const labels = await page.locator('#control-host [aria-label]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')));
      throw new Error(`${error.message}; drag ${JSON.stringify({ from, to })}; mounted controls: ${JSON.stringify(labels)}`);
    }
  };
  const installPauseGate = () => page.evaluate(() => {
    window.__originalFetch = window.fetch.bind(window);
    window.__heldPause = null;
    window.fetch = async (input, init) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      if (init?.method === 'POST' && String(input).endsWith('/api/control') && body?.action === 'pause') {
        const response = await window.__originalFetch(input, init);
        if (!response.ok) return response;
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        window.__heldPause = { release: () => release(response) };
        return gate;
      }
      return window.__originalFetch(input, init);
    };
  });
  const pauseHeld = () => page.waitForFunction(() => !!window.__heldPause, null, { timeout: 8000 });
  const releasePause = () => page.evaluate(() => {
    const held = window.__heldPause;
    window.__heldPause = null;
    held?.release();
  });
  const restoreFetch = () => page.evaluate(() => {
    const held = window.__heldPause;
    window.__heldPause = null;
    held?.release();
    if (window.__originalFetch) window.fetch = window.__originalFetch;
    window.__originalFetch = null;
    window.__commentAttempts = null;
    window.__commentCompletions = null;
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForSelector('#control-host [aria-label="Feedback"]');
  await human('/api/commands', { commands: [
    { type: 'stroke', layer: 'paint', color: '#253d38', size: 10, points: [[80, 80], [220, 160]] },
    { type: 'stroke', layer: 'paint', color: '#1c2f6b', size: 8, points: [[40, 620], [940, 640]] },
  ], play: true, immediate: false });
  await human('/api/control', { action: 'resume' });
  await waitState((snapshot) => snapshot.playback.status === 'playing', 'playback to start');

  try {
    await installPauseGate();
    await click('Feedback');
    await pauseHeld();
    await page.keyboard.press('Escape');
    await releasePause();
    await page.waitForTimeout(400);
    assert((await state()).comments.length === 0, 'cancelled pause race must not store comments');
    assert(await control('Feedback draft').count() === 0, 'late pause ack must not mount a composer');
    done('held pause ack after Escape stays inert');
  } finally {
    await restoreFetch();
  }

  try {
    await installPauseGate();
    await click('Feedback');
    await pauseHeld();
    const replaced = await human('/api/control', { action: 'new' });
    await page.waitForTimeout(700);
    await page.keyboard.press('Escape');
    await releasePause();
    await page.waitForTimeout(400);
    const live = await state();
    assert(live.docGeneration === replaced.docGeneration && live.comments.length === 0,
      'document replacement must supersede the held pause');
    assert(await control('Feedback draft').count() === 0, 'superseded pause must not activate feedback');
    done('superseded pause ack stays inert after document replacement');
  } finally {
    await restoreFetch();
  }

  try {
    await click('Feedback');
    await dragRegion([0.2, 0.25], [0.5, 0.5]);
    await control('Feedback draft').fill('Retry race note');
    await page.evaluate(() => {
      window.__originalFetch = window.fetch.bind(window);
      window.__commentAttempts = [];
      window.__commentCompletions = 0;
      window.fetch = async (input, init) => {
        if (init?.method === 'POST' && String(input).endsWith('/api/comments')) {
          window.__commentAttempts.push(init.body);
          const response = await window.__originalFetch(input, init);
          window.__commentCompletions += 1;
          if (window.__commentAttempts.length === 1) throw new TypeError('dropped first response');
          return response;
        }
        return window.__originalFetch(input, init);
      };
    });
    await click('Send feedback');
    await control('RETRY').waitFor({ timeout: 8000 });
    const midway = await state();
    assert(midway.comments.length === 1, 'server must process the dropped write');
    await click('RETRY');
    try {
      await page.waitForFunction(() => Array.isArray(window.__commentAttempts)
        && window.__commentAttempts.length === 2
        && window.__commentCompletions === 2, null, { timeout: 8000 });
    } catch (error) {
      const diagnostics = await page.evaluate(() => ({
        attempts: window.__commentAttempts,
        controls: [...document.querySelectorAll('#control-host [aria-label]')]
          .map((node) => node.getAttribute('aria-label')),
      }));
      throw new Error(`${error.message}; exact retry diagnostic: ${JSON.stringify(diagnostics)}`);
    }
    await page.waitForFunction(() => !document.querySelector('#control-host [aria-label="Feedback draft"]')
      && !document.querySelector('#control-host [aria-label="RETRY"]'), null, { timeout: 8000 });
    const settled = await state();
    const attempts = await page.evaluate(() => window.__commentAttempts);
    assert(attempts.length === 2, `retry must send exactly two requests: ${attempts.length}`);
    assert(attempts[0] === attempts[1], 'retry must replay a byte-identical request');
    assert(settled.comments.length === 1, 'retry path must dedupe to one comment');
    const payload = JSON.parse(attempts[attempts.length - 1]);
    assert(payload.text === 'Retry race note' && payload.rect && payload.requestId,
      'retry path must preserve text, rect, and request id');
    done('dropped submission remains deduped with its original payload');
  } finally {
    await restoreFetch();
  }

  await click('Feedback');
  await page.waitForTimeout(300);
  await click('Feedback');
  await page.waitForTimeout(300);
  await dragRegion([0.3, 0.3], [0.6, 0.55]);
  await control('Feedback draft').fill('resize hold');
  await page.setViewportSize({ width: 1024, height: 768 });
  assert(await control('Feedback draft').count() === 1, 'the feedback composer must survive the viewport resize');
  await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#control-host [aria-label="Feedback draft"]'), null, { timeout: 8000 });
  await page.setViewportSize({ width: 1440, height: 900 });
  done('held region and draft survive resize and Escape cancels');

  assert(problems.length === 0, `no uncaught runtime errors: ${JSON.stringify(problems)}`);
  return { success: true, checks, comments: (await state()).comments.map((item) => ({
    number: item.number, status: item.status, scope: item.rect ? 'region' : 'whole',
  })) };
}
