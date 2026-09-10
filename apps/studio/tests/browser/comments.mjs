// V2a browser scenario: the human comment flow over the current review UI.
// Core: native region pause/drag/compose/Send with visible-layer capture and
// the default pause, then a whole canvas submission with an explicit
// unchecked continuation grant on a still-paused session. Extended: composer
// typing stays stable across state polls with the caret at the end, cancel
// and reselect preserve the draft, stored pins and list focus highlight the
// exact stored region, and the ack/address/resolve/reopen lifecycle runs
// through the real UI with the current seq. Fixtures use the exact current
// HTTP contracts via page.request; every step throws immediately on failure.
async (page) => {
  const checks = [];
  const done = (name) => checks.push(name);
  const assert = (condition, message) => {
    if (!condition) throw new Error(`COMMENTS FAILED: ${message}`);
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
      if (Date.now() > deadline) throw new Error(`COMMENTS FAILED: timed out waiting for ${message}`);
      await page.waitForTimeout(100);
    }
  };
  const composerLine = (text, timeoutMs = 8000) => page.waitForFunction((expected) =>
    document.querySelector('#feedback-composer .review-status-line')?.textContent === expected,
  text, { timeout: timeoutMs });
  const composerClosed = () =>
    page.locator('#feedback-composer .review-composer[hidden]').waitFor({ state: 'attached', timeout: 8000 });
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
  const send = () => press('#feedback-composer .review-actions button:has-text("Send feedback")');
  const hold = page.locator('#feedback-composer .review-hold-box');
  const area = page.locator('#feedback-composer .review-textarea');
  const commentButton = '.cs-dock-btn[aria-label="Comment (C)"]';
  const selectingLine = 'Drag a region on the canvas, or switch to the whole canvas.';

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForSelector('.cs-dock');
  await page.waitForFunction(() =>
    document.querySelector('#global-header .cs-status-text')?.textContent !== 'Connecting',
  null, { timeout: 15000 });

  // Seed the real session on the current generation: visible paint and notes
  // layers plus one hidden layer and one zero-opacity layer.
  const seeded = await human('/api/commands', { commands: [
    { type: 'stroke', layer: 'paint', color: '#253d38', size: 10, points: [[80, 80], [220, 160]] },
    { type: 'layer.add', id: 'notes', name: 'Notes' },
    { type: 'layer.add', id: 'hidden', name: 'Hidden' },
    { type: 'layer.add', id: 'ghost', name: 'Ghost' },
    { type: 'layer.update', id: 'notes', opacity: 0.5 },
    { type: 'layer.update', id: 'hidden', visible: false },
    { type: 'layer.update', id: 'ghost', opacity: 0 },
  ], immediate: true, play: false });
  const layerOf = (id) => seeded.document.layers.find((layer) => layer.id === id);
  assert(layerOf('hidden')?.visible === false, 'hidden layer fixture missing');
  assert(layerOf('ghost')?.opacity === 0, 'zero-opacity layer fixture missing');
  assert(layerOf('notes')?.opacity === 0.5, 'notes layer fixture missing');
  done('fixtures seeded on the current generation');

  // Make the hidden layer the selected painting target: visible-layer capture
  // must not depend on the selected target.
  await press('.sidebar-tab[data-tab="layers"]');
  await press('#layer-panel .cs-layer-row[data-layer-id="hidden"] .cs-layer-name');
  await page.waitForFunction(() =>
    document.querySelector('#layer-panel .cs-layer-row[data-layer-id="hidden"]')
      ?.getAttribute('aria-current') === 'true', null, { timeout: 8000 });
  done('hidden layer selected as the painting target');

  // Start real playback so the comment tool has work to stop.
  await human('/api/commands', { commands: [
    { type: 'stroke', layer: 'paint', color: '#1c2f6b', size: 8, points: [[40, 620], [940, 640]] },
    { type: 'stroke', layer: 'notes', color: '#7c3f2a', size: 8, points: [[40, 600], [940, 600]] },
  ], play: true, immediate: false });
  await human('/api/control', { action: 'resume' });
  await waitState((snap) => snap.playback.status === 'playing', 'playback to start');
  await press(commentButton);
  await composerLine(selectingLine);
  await waitState((snap) => snap.playback.status === 'paused', 'the comment tool to pause playback');
  done('comment tool pauses active playback');

  // Drag a region and send the feedback with the default keep-paused hold.
  const title = await dragRegion([0.15, 0.2], [0.45, 0.45]);
  assert(title.startsWith('Region'), `region scope title missing: ${title}`);
  assert(await hold.isChecked() === true, 'keep-paused hold must default to checked');
  await typeDraft('Soften the hill edge');
  await send();
  await composerClosed();
  await waitState((snap) => snap.comments.length === 1, 'the stored region comment');
  done('region drag composes and Send stores the feedback');

  // The stored comment must match the current contract: number, seq, status,
  // timestamp, bounded rect, and only visible layers regardless of target.
  const snap = await state();
  const region = snap.comments[0];
  assert(region.number === 1 && region.seq === 1, `region number/seq wrong: ${region.number}/${region.seq}`);
  assert(region.status === 'open' && region.text === 'Soften the hill edge',
    `stored region text/status wrong: ${region.status}`);
  assert(region.rect && region.rect.width >= 1 && region.rect.height >= 1 &&
    region.rect.x >= 0 && region.rect.y >= 0 &&
    region.rect.x + region.rect.width <= 1000 && region.rect.y + region.rect.height <= 700,
  `region rect invalid: ${JSON.stringify(region.rect)}`);
  assert(typeof region.at === 'string' && Number.isFinite(Date.parse(region.at)), 'region timestamp missing');
  assert(JSON.stringify(region.visibleLayers) === JSON.stringify([
    { id: 'paint', opacity: 1 }, { id: 'notes', opacity: 0.5 },
  ]), `visible layers must exclude hidden and zero-opacity layers: ${JSON.stringify(region.visibleLayers)}`);
  assert(snap.requiresGrant === true && snap.activeGrant === null && snap.playback.status === 'paused',
    'default keepPaused must keep the session paused without an agent grant');
  await page.locator('.review-item .review-status-open').first().waitFor({ timeout: 8000 });
  done('stored region comment matches the contract and visible-layer capture');

  // Whole canvas feedback with an explicit unchecked hold authorizes the
  // agent while the server stays paused.
  await press('.review-start button:has-text("Whole canvas feedback")');
  await page.locator('#feedback-composer .review-composer:not([hidden])').waitFor({ timeout: 8000 });
  assert(await page.locator('#feedback-composer .review-card-title').textContent() === 'Whole canvas',
    'whole canvas title missing');
  assert(await hold.isChecked() === true, 'keep-paused hold must default to checked again');
  await hold.click({ timeout: 8000 });
  assert(await hold.isChecked() === false, 'keep-paused hold must be uncheckable');
  await typeDraft('Whole canvas note');
  await send();
  await composerClosed();
  const granted = await waitState((current) => current.comments.length === 2, 'the stored whole canvas comment');
  const whole = granted.comments[1];
  assert(whole.number === 2 && whole.rect === null, 'whole canvas comment must store a null rect');
  assert(granted.requiresGrant === true && granted.activeGrant !== null &&
    granted.activeGrant.docGeneration === granted.docGeneration &&
    Number.isInteger(granted.activeGrant.controlEpoch) &&
    typeof granted.activeGrant.grantToken === 'string' && granted.activeGrant.grantToken.length > 0,
  `unchecked continuation must authorize the agent: ${JSON.stringify(granted.activeGrant)}`);
  assert(granted.playback.status === 'paused', 'the server must remain paused after the grant');
  done('unchecked continuation grants permission while the server stays paused');

  // The stored region comment renders a pin; selecting it from the overlay or
  // the list must highlight the exact stored region.
  const pins = page.locator('#stage-overlay .review-pin');
  const pinCount = await pins.count();
  assert(pinCount === 1, `exactly one region pin expected: ${pinCount}`);
  assert(await pins.first().textContent() === '#1', 'pin must show the comment number');
  await pins.first().click({ timeout: 8000 });
  const highlight = page.locator('#stage-overlay .review-highlight');
  await highlight.waitFor({ timeout: 8000 });
  const stored = (await state()).comments.find((item) => item.text === 'Soften the hill edge');
  const drawn = {
    x: Number(await highlight.getAttribute('x')),
    y: Number(await highlight.getAttribute('y')),
    width: Number(await highlight.getAttribute('width')),
    height: Number(await highlight.getAttribute('height')),
  };
  assert(drawn.x === stored.rect.x && drawn.y === stored.rect.y &&
    drawn.width === stored.rect.width && drawn.height === stored.rect.height,
  `pin highlight must match the stored region: ${JSON.stringify(drawn)}`);
  assert((await pins.first().getAttribute('class'))?.includes('is-selected') === true,
    'clicked pin must take the selection');
  await press(`.review-item[data-comment-id="${stored.id}"] .review-action:has-text("Highlight")`);
  await page.waitForFunction((id) =>
    document.querySelector(`.review-item[data-comment-id="${id}"]`)?.classList.contains('is-selected') === true,
  stored.id, { timeout: 8000 });
  done('stored pin and list focus highlight the stored region');

  // Cancel keeps the draft; typing must be stable across state polls with the
  // caret resting at the end of the focused textarea.
  await press(commentButton);
  await composerLine(selectingLine);
  await dragRegion([0.55, 0.6], [0.8, 0.78]);
  await area.click({ timeout: 8000 });
  await page.keyboard.type('draft ', { delay: 20 });
  await page.waitForTimeout(350);
  const midTyping = await page.evaluate(() => {
    const node = document.querySelector('#feedback-composer .review-textarea');
    return { focused: document.activeElement === node, value: node.value, caret: node.selectionStart };
  });
  assert(midTyping.focused === true, 'textarea must keep focus across state polls');
  assert(midTyping.value === 'draft ', `state polls clobbered the draft: ${JSON.stringify(midTyping.value)}`);
  assert(midTyping.caret === midTyping.value.length, `caret must rest at the end: ${midTyping.caret}`);
  await page.keyboard.type('note', { delay: 20 });
  assert(await area.inputValue() === 'draft note', 'typing must accumulate without loss');
  await press('#feedback-composer .review-actions button:has-text("Cancel")');
  await composerClosed();
  await press(commentButton);
  await composerLine(selectingLine);
  await dragRegion([0.55, 0.6], [0.8, 0.78]);
  assert(await area.inputValue() === 'draft note',
    `cancel must preserve the draft text: ${await area.inputValue()}`);
  done('cancel preserves the draft text for the next review');

  // Artwork changes during review go stale; Reselect keeps the draft.
  await human('/api/commands', { commands: [
    { type: 'stroke', layer: 'paint', color: '#112233', size: 6, points: [[500, 500], [520, 520]] },
  ], immediate: true, play: false });
  await composerLine('The artwork changed. Reselect the region to continue.');
  assert(await area.inputValue() === 'draft note', 'stale review must keep the draft');
  await press('#feedback-composer .review-actions button:has-text("Reselect region")');
  await composerLine(selectingLine);
  await dragRegion([0.55, 0.6], [0.8, 0.78]);
  assert(await area.inputValue() === 'draft note',
    `reselect must preserve the draft text: ${await area.inputValue()}`);
  await press('#feedback-composer .review-actions button:has-text("Cancel")');
  await composerClosed();
  done('stale artwork review survives reselect with the draft intact');

  // Drive the real lifecycle: ack and address through the exact HTTP
  // contract, then Resolve and Reopen through the actual UI, always with the
  // current seq.
  const move = async (action, id, expectedSeq) => {
    const generation = (await state()).docGeneration;
    const response = await page.request.post(`${origin}/api/comments/${action}`, {
      data: { id, expectedSeq, expectedDocGeneration: generation },
    });
    const result = await response.json();
    assert(response.ok(), `${action} failed with ${response.status()}: ${JSON.stringify(result.error ?? result)}`);
    const item = (result.comments ?? []).find((candidate) => candidate.id === id);
    assert(item, `${action} response lost the comment`);
    return item;
  };
  const track = (await state()).comments.find((item) => item.text === 'Soften the hill edge');
  const row = page.locator(`.review-item[data-comment-id="${track.id}"]`);
  const afterAck = await move('ack', track.id, track.seq);
  assert(afterAck.status === 'acknowledged' && afterAck.seq > track.seq,
    `ack must move open feedback: ${afterAck.status}/${afterAck.seq}`);
  const afterAddress = await move('address', track.id, afterAck.seq);
  assert(afterAddress.status === 'addressed' && afterAddress.seq > afterAck.seq,
    `address must follow ack: ${afterAddress.status}/${afterAddress.seq}`);
  await row.locator('.review-status-addressed').waitFor({ timeout: 8000 });
  await row.locator('.review-action:has-text("Resolve")').click({ timeout: 8000 });
  let latest = await waitState((current) =>
    (current.comments.find((item) => item.id === track.id) ?? {}).status === 'resolved', 'UI resolve');
  let current = latest.comments.find((item) => item.id === track.id);
  assert(current.seq > afterAddress.seq, `resolve must bump the seq: ${current.seq}`);
  await row.locator('.review-status-resolved').waitFor({ timeout: 8000 });
  await row.locator('.review-action:has-text("Reopen")').click({ timeout: 8000 });
  latest = await waitState((current) =>
    (current.comments.find((item) => item.id === track.id) ?? {}).status === 'open', 'UI reopen');
  current = latest.comments.find((item) => item.id === track.id);
  assert(current.seq > afterAddress.seq + 1, `reopen must bump the seq again: ${current.seq}`);
  assert(latest.requiresGrant === true && latest.activeGrant === null,
    'reopen must return the session to a paused, unauthorized state');
  done('resolve and reopen follow the current seq contract through the real UI');

  return {
    success: true,
    checks,
    comments: latest.comments.map((item) => ({
      number: item.number, status: item.status, scope: item.rect ? 'region' : 'whole',
    })),
  };
}
