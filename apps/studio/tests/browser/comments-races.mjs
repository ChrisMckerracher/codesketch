// Browser scenario: comment composer races — late pause ack vs Escape,
// stale ack after generation rotation, network retry with stable request
// id, keyboard cancel, and composer focus across viewport resize. All
// network stalls are in-page fetch gates; no Playwright route mocks.
async (page) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForSelector('#canvas');
  const reset = () => page.evaluate(async () => {
    await fetch('/api/control', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'new', source: 'human' }) });
  });
  const installPauseGate = () => page.evaluate(() => {
    window.__originalFetch = window.fetch.bind(window);
    window.__pauseHeld = null;
    window.fetch = async (input, init) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      if (init?.method === 'POST' && String(input).endsWith('/api/control') && body?.action === 'pause') {
        const response = await window.__originalFetch(input, init);
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        window.__pauseHeld = { response, release: () => release() };
        return gate;
      }
      return window.__originalFetch(input, init);
    };
  });
  const pauseHeld = () => page.waitForFunction(() => !!window.__pauseHeld,
    undefined, { timeout: 5000 });
  const releasePause = () => page.evaluate(() => {
    if (window.__pauseHeld) { const held = window.__pauseHeld; window.__pauseHeld = null; held.release(); }
  });
  const restoreFetch = () => page.evaluate(() => {
    if (window.__originalFetch) { window.fetch = window.__originalFetch; window.__originalFetch = null; }
    window.__pauseHeld = null;
  });
  const instructionHidden = () => page.waitForFunction(() =>
    document.querySelector('.comment-instruction')?.hidden === true, undefined, { timeout: 3000 });

  await reset();

  // 1. Escape while the pause ack is held: cancel wins, and the late ack is
  // discarded by its activation token instead of activating a selection.
  await installPauseGate();
  await page.click('#btn-comment-region');
  await pauseHeld();
  await page.keyboard.press('Escape');
  await instructionHidden();
  await releasePause();
  await page.waitForTimeout(300);
  await restoreFetch();
  if (!await page.evaluate(() => document.querySelector('.comment-instruction')?.hidden)) {
    throw new Error('late pause ack activated a cancelled selection');
  }
  if (await page.locator('#comment-composer-input').isVisible()) {
    throw new Error('composer opened from a cancelled pause ack');
  }

  // 2. A rotated generation supersedes the held pause ack: the UI resets to
  // idle with an expiry notice, the released ack activates nothing, and a
  // fresh Select area works immediately afterwards.
  await page.evaluate(async () => {
    const response = await fetch('/api/commands', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: [{ type: 'stroke', layer: 'paint', color: '#222222',
        size: 4, points: [[30, 30], [40, 40]] }], play: false, source: 'human' }) });
    if (!response.ok) throw new Error('pause setup failed');
  });
  await page.waitForFunction(() =>
    document.getElementById('status-label').textContent.trim() === 'Paused',
  undefined, { timeout: 5000 });
  await installPauseGate();
  await page.click('#btn-comment-region');
  await pauseHeld();
  await page.evaluate(async () => {
    const response = await fetch('/api/control', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'new', source: 'human' }) });
    if (!response.ok) throw new Error('generation rotation failed');
  });
  await page.waitForFunction(() =>
    (document.getElementById('notification-message')?.textContent ?? '').includes('expired'),
  undefined, { timeout: 5000 });
  await releasePause();
  await page.waitForTimeout(300);
  await restoreFetch();
  if (!await page.evaluate(() => document.querySelector('.comment-instruction')?.hidden)) {
    throw new Error('obsolete selection activated after generation rotation');
  }
  if (await page.locator('#comment-composer-input').isVisible()) {
    throw new Error('composer opened from a stale pause ack');
  }
  await page.click('#btn-comment-region');
  await page.waitForSelector('.comment-instruction', { state: 'visible', timeout: 5000 });
  await page.keyboard.press('Escape');
  await instructionHidden();

  // 3. The C shortcut enters region comment mode from outside form controls.
  await page.keyboard.press('c');
  await page.waitForSelector('.comment-instruction', { state: 'visible', timeout: 5000 });
  await page.keyboard.press('Escape');
  await instructionHidden();

  // 4. A stale 409 keeps the typed text, offers Reselect, and the composer
  // reopens with the draft after a fresh pause and region drag.
  const box = await page.locator('#canvas').boundingBox();
  await page.click('#btn-comment-region');
  await page.waitForSelector('.comment-instruction', { state: 'visible' });
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 180, { steps: 5 });
  await page.mouse.up();
  await page.waitForSelector('#comment-composer-input', { state: 'visible' });
  await page.fill('#comment-composer-input', 'Fix this corner');
  await page.evaluate(async () => {
    const response = await fetch('/api/commands', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: [{ type: 'stroke', layer: 'paint', color: '#3a2f2a',
        size: 4, points: [[500, 500], [520, 520]] }], immediate: true, source: 'human' }) });
    if (!response.ok) throw new Error('setup art mutation failed');
  });
  await page.locator('.comment-composer-footer button', { hasText: 'Send' }).click();
  await page.waitForSelector('.comment-composer-error', { state: 'visible', timeout: 5000 });
  if (!/changed/i.test(await page.textContent('.comment-composer-error'))) {
    throw new Error('stale error text missing');
  }
  if (await page.inputValue('#comment-composer-input') !== 'Fix this corner') {
    throw new Error('stale 409 lost the draft text');
  }
  await page.locator('.comment-composer-error-actions button', { hasText: 'Reselect' }).click();
  await page.waitForSelector('#comment-composer-input', { state: 'hidden', timeout: 5000 });
  await page.waitForSelector('.comment-instruction', { state: 'visible', timeout: 5000 });
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 380, box.y + 360, { steps: 5 });
  await page.mouse.up();
  await page.waitForSelector('#comment-composer-input', { state: 'visible' });
  if (await page.inputValue('#comment-composer-input') !== 'Fix this corner') {
    throw new Error('reselect lost the draft text');
  }
  await page.locator('.comment-composer-footer button', { hasText: 'Send' }).click();
  await page.waitForSelector('.comment-card', undefined, { timeout: 5000 });

  // 5. A network failure keeps the text and retries with the same request id.
  await page.evaluate(() => {
    window.__commentAttempts = [];
    window.__originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      if (init?.method === 'POST' && String(input).endsWith('/api/comments')) {
        window.__commentAttempts.push(body);
        if (window.__commentAttempts.length === 1) throw new TypeError('test network failure');
      }
      return window.__originalFetch(input, init);
    };
  });
  await page.click('#btn-comment-canvas');
  await page.waitForSelector('#comment-composer-input', { state: 'visible' });
  await page.fill('#comment-composer-input', 'Network retry probe');
  await page.locator('.comment-composer-footer button', { hasText: 'Send' }).click();
  await page.waitForFunction(() => {
    const error = document.querySelector('.comment-composer-error');
    return error && !error.hidden && /Could not send/.test(error.textContent);
  }, undefined, { timeout: 5000 });
  if (await page.inputValue('#comment-composer-input') !== 'Network retry probe') {
    throw new Error('network failure lost the draft text');
  }
  await page.locator('.comment-composer-footer button', { hasText: 'Send' }).click();
  await page.waitForFunction((text) => [...document.querySelectorAll('.comment-card-text')]
    .some((node) => node.textContent === text), 'Network retry probe', { timeout: 5000 });
  const attempts = await page.evaluate(() => window.__commentAttempts);
  await restoreFetch();
  if (attempts.length !== 2 || attempts[0].requestId !== attempts[1].requestId
    || attempts[0].text !== attempts[1].text) {
    throw new Error(`retry must reuse one request id, got ${JSON.stringify(attempts.map((a) => a.requestId))}`);
  }
  const retryComments = await page.evaluate(async (text) => {
    const snap = await (await fetch('/api/state')).json();
    return snap.comments.filter((item) => item.text === text).length;
  }, 'Network retry probe');
  if (retryComments !== 1) throw new Error(`retry created ${retryComments} comments, expected 1`);

  // 6. A freshly opened composer keeps focus and stays inside the canvas
  // across a viewport resize.
  await page.click('#btn-comment-canvas');
  await page.waitForSelector('#comment-composer-input', { state: 'visible' });
  await page.waitForFunction(() =>
    document.activeElement === document.getElementById('comment-composer-input'),
  undefined, { timeout: 3000 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => {
    const composer = document.querySelector('.comment-composer').getBoundingClientRect();
    const shadow = document.getElementById('canvas').parentElement.getBoundingClientRect();
    return composer.left >= shadow.left && composer.right <= shadow.right
      && composer.top >= shadow.top && composer.bottom <= shadow.bottom;
  }, undefined, { timeout: 5000 });
  if (!await page.evaluate(() =>
    document.activeElement === document.getElementById('comment-composer-input'))) {
    throw new Error('composer input lost focus after resize');
  }
  await page.keyboard.press('Escape');
  await page.waitForSelector('#comment-composer-input', { state: 'hidden', timeout: 5000 });
  await page.setViewportSize({ width: 1440, height: 900 });

  // 7. A brush stroke still held when comment mode starts is discarded: no
  // transient draft pixels in selection, and brush painting works afterwards.
  await reset();
  const marksBefore = await page.evaluate(async () =>
    (await (await fetch('/api/state')).json()).document.marks.length);
  const holdBox = await page.locator('#canvas').boundingBox();
  await page.mouse.move(holdBox.x + 80, holdBox.y + 80);
  await page.mouse.down();
  await page.mouse.move(holdBox.x + 140, holdBox.y + 120, { steps: 4 });
  await page.keyboard.press('c');
  await page.waitForSelector('.comment-instruction', { state: 'visible', timeout: 5000 });
  await page.mouse.move(holdBox.x + 200, holdBox.y + 160, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press('Escape');
  await instructionHidden();
  const pixelsBeforeSelection = await page.evaluate(() => document.getElementById('canvas').toDataURL());
  await page.click('#btn-comment-region');
  await page.waitForSelector('.comment-instruction', { state: 'visible', timeout: 5000 });
  await page.mouse.move(holdBox.x + 300, holdBox.y + 300);
  await page.mouse.down();
  await page.mouse.move(holdBox.x + 420, holdBox.y + 380, { steps: 5 });
  if (await page.evaluate(() => document.getElementById('canvas').toDataURL()) !== pixelsBeforeSelection) {
    throw new Error('comment selection painted transient manual pixels');
  }
  await page.mouse.up();
  await page.keyboard.press('Escape');
  await instructionHidden();
  await page.mouse.move(holdBox.x + 240, holdBox.y + 240);
  await page.mouse.down();
  await page.mouse.move(holdBox.x + 280, holdBox.y + 260, { steps: 4 });
  await page.mouse.up();
  await page.waitForFunction(async (before) => {
    const snap = await (await fetch('/api/state')).json();
    return snap.document.marks.length === before + 1;
  }, marksBefore, { timeout: 5000 });

  if (errors.length > 0) {
    throw new Error(`Browser page error(s) detected:\n${errors.join('\n')}`);
  }
  return { success: true };
}
