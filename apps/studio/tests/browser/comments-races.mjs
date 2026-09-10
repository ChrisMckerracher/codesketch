// V2a browser race scenario over the current review UI (rewrite of the
// obsolete selectors). In-page fetch gates hold or drop ACTUAL successful
// responses; fixture writes isolate with the current document generation.
// Covers: a held pause ack discarded after Escape (no late selection), a
// held pause ack discarded after a document replacement (no activation and
// no late mutation), a dropped first comment submission whose
// explicit Retry replays a byte-identical payload and stores exactly one
// comment, and a held region/draft that survives the supported desktop
// compact resize before native Escape cancels it. Gates release the real
// ok-verified Response and restore in finally; every step throws
// immediately on failure.
async (page) => {
  const checks = [];
  const done = (name) => checks.push(name);
  const assert = (condition, message) => {
    if (!condition) throw new Error(`COMMENT RACES FAILED: ${message}`);
  };
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
  const composerLine = (text, timeoutMs = 8000) => page.waitForFunction((expected) =>
    document.querySelector('#feedback-composer .review-status-line')?.textContent === expected,
  text, { timeout: timeoutMs });
  const composerClosed = () =>
    page.locator('#feedback-composer .review-composer[hidden]').waitFor({ state: 'attached', timeout: 8000 });
  const composerHidden = async (message) => {
    assert(await page.locator('#feedback-composer .review-composer:not([hidden])').count() === 0, message);
  };
  const noActiveReview = async (message) => {
    assert(await page.locator('#feedback-composer .review-textarea:not([hidden])').count() === 0, message);
    const line = await page.locator('#feedback-composer .review-status-line').textContent();
    assert(line !== selectingLine, `${message} (status line: ${JSON.stringify(line)})`);
  };
  const press = (selector) => page.locator(selector).click({ timeout: 8000 });
  const dragRegion = async (from, to) => {
    const box = await page.locator('#painting-canvas').boundingBox();
    await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 6 });
    await page.mouse.up();
    await page.locator('#feedback-composer .review-textarea:not([hidden])').waitFor({ timeout: 8000 });
    return await page.locator('#feedback-composer .review-card-title').textContent();
  };
  const typeDraft = async (text) => {
    const area = page.locator('#feedback-composer .review-textarea');
    await area.click({ timeout: 8000 });
    await page.keyboard.type(text);
  };
  const area = page.locator('#feedback-composer .review-textarea');
  const commentButton = '.cs-dock-btn[aria-label="Comment (C)"]';
  const selectingLine = 'Drag a region on the canvas, or switch to the whole canvas.';

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForSelector('.cs-dock');
  await page.waitForFunction(() =>
    document.querySelector('#global-header .cs-status-text')?.textContent !== 'Connecting',
  null, { timeout: 15000 });

  // Seed minimal artwork and start real playback so the pause race is real.
  await human('/api/commands', { commands: [
    { type: 'stroke', layer: 'paint', color: '#253d38', size: 10, points: [[80, 80], [220, 160]] },
  ], immediate: true, play: false });
  await human('/api/commands', { commands: [
    { type: 'stroke', layer: 'paint', color: '#1c2f6b', size: 8, points: [[40, 620], [940, 640]] },
    { type: 'stroke', layer: 'paint', color: '#1c2f6b', size: 8, points: [[40, 660], [940, 680]] },
  ], play: true, immediate: false });
  await human('/api/control', { action: 'resume' });
  await waitState((snap) => snap.playback.status === 'playing', 'playback to start');

  // In-page gate: hold the real successful pause response until released.
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
        window.__heldPause = { response, release: () => release(response) };
        return gate;
      }
      return window.__originalFetch(input, init);
    };
  });
  const pauseHeld = () => page.waitForFunction(() => !!window.__heldPause, null, { timeout: 8000 });
  const releaseGate = () => page.evaluate(() => {
    const held = window.__heldPause;
    window.__heldPause = null;
    if (held) held.release();
  });
  const restoreFetch = () => page.evaluate(() => {
    const held = window.__heldPause;
    window.__heldPause = null;
    if (held) held.release();
    if (window.__originalFetch) window.fetch = window.__originalFetch;
    window.__originalFetch = null;
    window.__commentAttempts = null;
  });

  try {
    // 1. A held successful pause response must stay inert after Escape: no
    // late region selection and no stored comment.
    await installPauseGate();
    await press(commentButton);
    await pauseHeld();
    await page.keyboard.press('Escape');
    await composerClosed();
    await releaseGate();
    await page.waitForTimeout(400);
    await composerHidden('a released late pause ack must not activate a cancelled selection');
    await noActiveReview('a released late pause ack must stay inert');
    assert((await state()).comments.length === 0, 'a cancelled pause race must not store comments');
    done('held pause ack after Escape stays inert');
  } finally {
    await restoreFetch();
  }

  try {
    // 2. A held pause response across a document replacement must not
    // activate, and a fresh review must start cleanly afterwards.
    await installPauseGate();
    await press(commentButton);
    await pauseHeld();
    const replaced = await human('/api/control', { action: 'new' });
    await composerClosed();
    await releaseGate();
    await page.waitForTimeout(400);
    await noActiveReview('a superseded pause ack must not reselect or compose after rotation');
    const live = await state();
    assert(live.docGeneration === replaced.docGeneration, 'the replacement generation must stand');
    assert(live.comments.length === 0, 'no late comment mutation from a superseded ack');
    await restoreFetch();
    await press(commentButton);
    await composerLine(selectingLine);
    await press('#feedback-composer .review-actions button:has-text("Cancel")');
    await composerClosed();
    done('superseded pause ack stays inert and a fresh review starts');
  } finally {
    await restoreFetch();
  }

  try {
    // 3. A dropped first submission response keeps the payload; the explicit
    // Retry replays a byte-identical request and stores exactly one comment.
    await press(commentButton);
    await composerLine(selectingLine);
    await dragRegion([0.2, 0.25], [0.5, 0.5]);
    await typeDraft('Retry race note');
    await page.evaluate(() => {
      window.__originalFetch = window.fetch.bind(window);
      window.__commentAttempts = [];
      window.fetch = async (input, init) => {
        if (init?.method === 'POST' && String(input).endsWith('/api/comments')) {
          window.__commentAttempts.push(init.body);
          const response = await window.__originalFetch(input, init);
          if (window.__commentAttempts.length === 1) {
            throw new TypeError('race scenario dropped the first response');
          }
          return response;
        }
        return window.__originalFetch(input, init);
      };
    });
    await press('#feedback-composer .review-actions button:has-text("Send feedback")');
    await composerLine('The response was lost. Retry sends the exact same feedback.');
    await page.waitForFunction(() =>
      ['Connected', 'Changes applied'].includes(
        document.querySelector('#global-header .cs-status-text')?.textContent ?? ''),
    null, { timeout: 8000 });
    const midway = await state();
    assert(midway.comments.length === 1, 'the server must have processed the dropped write');
    await press('#feedback-composer .review-actions button:has-text("Retry same feedback")');
    await composerClosed();
    const settled = await state();
    assert(settled.comments.length === 1, `retry must dedupe to exactly one comment: ${settled.comments.length}`);
    const attempts = await page.evaluate(() => window.__commentAttempts);
    assert(Array.isArray(attempts) && attempts.length === 2, `retry must send exactly twice: ${attempts?.length}`);
    assert(attempts[0] === attempts[1], 'retry must replay a byte-identical payload');
    const payload = JSON.parse(attempts[1]);
    assert(payload.text === 'Retry race note' && payload.rect && payload.requestId,
      'the replayed payload must keep text, rect, and request id');
    const stored = settled.comments[0];
    assert(stored.text === payload.text && stored.request.id === payload.requestId,
      'the stored comment must carry the retried request id');
    done('dropped submission retries byte-identically and stores one comment');
  } finally {
    await restoreFetch();
  }

  // 4. A held region and draft survive the supported desktop compact resize;
  // native Escape cancels without storing anything.
  await press(commentButton);
  await composerLine(selectingLine);
  const heldTitle = await dragRegion([0.3, 0.3], [0.6, 0.55]);
  await typeDraft('resize hold');
  const baseline = (await state()).comments.length;
  await page.setViewportSize({ width: 1024, height: 768 });
  assert(await page.locator('#feedback-composer .review-card-title').textContent() === heldTitle,
    'the active region scope must survive the viewport resize');
  assert(await area.inputValue() === 'resize hold', 'the draft must survive the viewport resize');
  await page.keyboard.press('Escape');
  await composerClosed();
  assert((await state()).comments.length === baseline, 'escape must discard the held draft');
  await page.setViewportSize({ width: 1440, height: 900 });
  done('held region and draft survive resize and Escape cancels');

  return {
    success: true,
    checks,
    comments: (await state()).comments.map((item) => ({
      number: item.number, status: item.status, scope: item.rect ? 'region' : 'whole',
    })),
  };
}
