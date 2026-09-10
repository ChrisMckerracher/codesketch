// Browser scenario: canvas comment flow over visible/hidden/zero-opacity
// layers, queue preservation, grant handoff, lifecycle, and listening TTL.
async (page) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForSelector('#canvas');

  // Setup writes simulate user actions, so they are explicit human writes.
  const setup = await page.evaluate(async () => {
    const post = async (path, body) => {
      const response = await fetch(path, { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'human', ...body }) });
      if (!response.ok) throw new Error(`${path}: ${(await response.json()).error}`);
      return response.json().catch(() => null);
    };
    await post('/api/control', { action: 'new' });
    await post('/api/commands', { commands: [
      { type: 'stroke', layer: 'paint', color: '#253d38', size: 8, points: [[80, 80], [220, 160]] },
      { type: 'layer.add', id: 'notes', name: 'Notes' },
      { type: 'layer.update', id: 'notes', opacity: 0.8 },
      { type: 'layer.add', id: 'hidden', name: 'Hidden' },
      { type: 'layer.update', id: 'hidden', visible: false },
      { type: 'layer.add', id: 'ghost', name: 'Ghost' },
      { type: 'layer.update', id: 'ghost', opacity: 0 },
    ], immediate: true });
    await post('/api/commands', { commands: [
      { type: 'stroke', layer: 'notes', color: '#112233', size: 6, points: [[300, 300], [360, 360]] },
      { type: 'stroke', layer: 'paint', color: '#112233', size: 6, points: [[400, 200], [460, 260]] },
    ], play: false });
    const state = await (await fetch('/api/state')).json();
    return { marks: state.document.marks.length, artRevision: state.artRevision,
      remaining: state.playback.remaining, cursor: state.history.cursor };
  });
  if (setup.remaining !== 2) throw new Error(`setup queue expected 2, got ${setup.remaining}`);
  // The browser renders committed art on its 150ms poll; wait until the
  // canvas bitmap is stable before recording the reference pixels.
  await page.waitForFunction(() => {
    const url = document.getElementById('canvas').toDataURL();
    if (url === window.__stableCanvasUrl) return true;
    window.__stableCanvasUrl = url;
    return false;
  }, undefined, { polling: 300, timeout: 5000 });
  const dataUrlBefore = await page.evaluate(() => document.getElementById('canvas').toDataURL());

  // A hidden layer is the selected target; comment metadata must not care.
  await page.click('[data-layer-id="hidden"] .layer-main-info');
  await page.waitForFunction(() =>
    document.querySelector('[data-layer-id="hidden"]')?.getAttribute('aria-checked') === 'true');

  // Region comment via a reversed drag (bottom-right to top-left).
  const box = await page.locator('#canvas').boundingBox();
  const startX = box.x + Math.round(box.width * 0.6);
  const startY = box.y + Math.round(box.height * 0.6);
  const endX = box.x + Math.round(box.width * 0.4);
  const endY = box.y + Math.round(box.height * 0.4);
  await page.click('#btn-comment-region');
  await page.waitForSelector('.comment-instruction', { state: 'visible' });
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 6 });
  await page.mouse.up();
  await page.waitForSelector('#comment-composer-input', { state: 'visible' });

  // The drag must be swallowed by selection: no paint, exact normalized rect.
  const afterDrag = await page.evaluate(async () => (await (await fetch('/api/state')).json()).document.marks.length);
  if (afterDrag !== setup.marks) throw new Error('region drag painted on the canvas');
  const expectedRect = await page.evaluate(({ startX, startY, endX, endY }) => {
    const rect = document.getElementById('canvas').getBoundingClientRect();
    const point = (cx, cy) => [
      Math.max(0, Math.min(1000, Math.round((cx - rect.left) * (1000 / rect.width)))),
      Math.max(0, Math.min(700, Math.round((cy - rect.top) * (700 / rect.height))))];
    const a = point(startX, startY);
    const b = point(endX, endY);
    return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]),
      width: Math.abs(a[0] - b[0]), height: Math.abs(a[1] - b[1]) };
  }, { startX, startY, endX, endY });
  const anchor = await page.evaluate(() => {
    const region = document.querySelector('.comment-region');
    if (!region) return null;
    return { x: Math.round(parseFloat(region.style.left) * 10),
      y: Math.round(parseFloat(region.style.top) * 7),
      width: Math.round(parseFloat(region.style.width) * 10),
      height: Math.round(parseFloat(region.style.height) * 7) };
  });
  if (!anchor || JSON.stringify(anchor) !== JSON.stringify(expectedRect)) {
    throw new Error(`composer anchor ${JSON.stringify(anchor)} != reversed-drag rect ${JSON.stringify(expectedRect)}`);
  }

  await page.fill('#comment-composer-input', 'Soften the sky band here');
  await page.locator('.comment-composer-footer button', { hasText: 'Send' }).click();
  await page.waitForSelector('.comment-card', undefined, { timeout: 5000 });
  const region = await page.evaluate(async () => {
    const snap = await (await fetch('/api/state')).json();
    return { comment: snap.comments[0], remaining: snap.playback.remaining,
      status: snap.playback.status };
  });
  if (JSON.stringify(region.comment.visibleLayers) !==
    JSON.stringify([{ id: 'paint', opacity: 1 }, { id: 'notes', opacity: 0.8 }])) {
    throw new Error(`visibleLayers wrong: ${JSON.stringify(region.comment.visibleLayers)}`);
  }
  if (region.remaining !== 2 || region.status !== 'paused') {
    throw new Error('Send must preserve the queue and stay paused');
  }
  let dataUrlAfter = await page.evaluate(() => document.getElementById('canvas').toDataURL());
  if (dataUrlAfter !== dataUrlBefore) {
    // A poll-driven re-render may have been mid-frame; require the canvas to
    // settle and then hold the strict equality guarantee.
    await page.waitForFunction(() => {
      const url = document.getElementById('canvas').toDataURL();
      if (url === window.__stableCanvasUrl2) return true;
      window.__stableCanvasUrl2 = url;
      return false;
    }, undefined, { polling: 300, timeout: 5000 });
    dataUrlAfter = await page.evaluate(() => document.getElementById('canvas').toDataURL());
  }
  if (dataUrlAfter !== dataUrlBefore) throw new Error('comment overlays altered canvas pixels');

  // Exported PNG equals canvas pixels even with comment overlays rendered.
  // The real download path runs; the blob URL is also captured in-page so
  // the bytes can be decoded and compared without filesystem access.
  await page.evaluate(() => {
    window.__exportBlobs = [];
    window.__originalCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (obj) => {
      const url = window.__originalCreateObjectURL(obj);
      if (obj instanceof Blob && obj.type === 'image/png') window.__exportBlobs.push(obj);
      return url;
    };
  });
  const [pngDownload] = await Promise.all([
    page.waitForEvent('download'), page.click('#btn-export')]);
  await pngDownload.saveAs('artifacts/browser-check/comments-overlay.png');
  await page.waitForFunction(() => (window.__exportBlobs || []).length > 0,
    undefined, { timeout: 5000 });
  await page.evaluate(() => {
    URL.createObjectURL = window.__originalCreateObjectURL;
  });
  const pixelsEqual = await page.evaluate(async () => {
    const blobs = window.__exportBlobs;
    const image = new Image();
    image.src = URL.createObjectURL(blobs[blobs.length - 1]);
    await image.decode();
    const canvas = document.getElementById('canvas');
    const probe = document.createElement('canvas');
    probe.width = canvas.width;
    probe.height = canvas.height;
    const context = probe.getContext('2d');
    context.drawImage(image, 0, 0);
    const left = context.getImageData(0, 0, probe.width, probe.height).data;
    const right = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    return left.length === right.length && left.every((v, i) => v === right[i]);
  });
  if (!pixelsEqual) throw new Error('exported PNG pixels differ from canvas with overlays');

  // Whole-canvas Apply & continue clears the queue, grants, stays paused.
  await page.click('#btn-comment-canvas');
  await page.waitForSelector('#comment-composer-input', { state: 'visible' });
  await page.fill('#comment-composer-input', 'Rework the whole composition');
  await page.locator('.comment-composer-footer button', { hasText: 'Apply & continue' }).click();
  await page.waitForFunction(() =>
    parseInt(document.getElementById('queue-count').textContent, 10) === 0,
  undefined, { timeout: 5000 });
  const applied = await page.evaluate(async () => {
    const snap = await (await fetch('/api/state')).json();
    return { status: snap.playback.status, requiresGrant: snap.requiresGrant,
      activeGrant: snap.activeGrant, gen: snap.docGeneration,
      comments: snap.comments.map((c) => c.rect) };
  });
  if (applied.status !== 'paused') throw new Error('Apply & continue must stay paused');
  if (!applied.requiresGrant || !applied.activeGrant) throw new Error('Apply & continue did not issue a grant');
  if (applied.comments[1] !== null) throw new Error('whole-canvas comment must carry a null rect');
  const pinCount = await page.locator('.comment-pin').count();
  if (pinCount !== 1) throw new Error(`expected exactly one region pin, got ${pinCount}`);

  // Stale agent writes are rejected; the granted batch executes; pause revokes.
  const stroke = { type: 'stroke', layer: 'paint', color: '#000000', size: 4, points: [[10, 10], [20, 20]] };
  const tryWrite = (body) => page.evaluate(async (payload) => {
    const response = await fetch('/api/commands', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    return { status: response.status };
  }, body);
  const stale = await tryWrite({ commands: [stroke], immediate: true });
  if (stale.status !== 409) throw new Error(`contextless agent write must 409, got ${stale.status}`);
  // A granted agent batch executes; a later human pause revokes the grant.
  const granted = await tryWrite({ commands: [stroke], source: 'agent', immediate: true,
    epoch: applied.activeGrant.controlEpoch, grantToken: applied.activeGrant.grantToken,
    expectedDocGeneration: applied.gen });
  if (granted.status !== 200) throw new Error(`granted batch must execute, got ${granted.status}`);
  const grantedState = await page.evaluate(async () => {
    const snap = await (await fetch('/api/state')).json();
    return { marks: snap.document.marks.length, cursor: snap.history.cursor };
  });
  if (grantedState.marks !== setup.marks + 1 || grantedState.cursor !== setup.cursor + 1) {
    throw new Error(`granted batch did not commit: ${JSON.stringify(grantedState)}`);
  }
  await page.evaluate(() => fetch('/api/control', { method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'pause', source: 'human' }) }));
  const revoked = await tryWrite({ commands: [stroke], source: 'agent', play: true,
    epoch: applied.activeGrant.controlEpoch, grantToken: applied.activeGrant.grantToken,
    expectedDocGeneration: applied.gen });
  if (revoked.status !== 409) throw new Error(`revoked grant must 409, got ${revoked.status}`);

  // ack and address via API, then human Resolve and Reopen from the card.
  await page.evaluate(async ({ id, seq, gen }) => {
    const post = async (body) => {
      const response = await fetch('/api/comments/ack', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error('ack failed');
      return response.json();
    };
    const acked = await post({ id, expectedSeq: seq, expectedDocGeneration: gen });
    const next = acked.comments.find((c) => c.id === id);
    const response = await fetch('/api/comments/address', { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, expectedSeq: next.seq, expectedDocGeneration: gen }) });
    if (!response.ok) throw new Error('address failed');
  }, { id: region.comment.id, seq: region.comment.seq, gen: applied.gen });
  const card = page.locator(`.comment-card[data-comment-id="${region.comment.id}"]`);
  await card.locator('[data-action="resolve"]').click();
  await page.waitForFunction((id) => document.querySelector(
    `.comment-card[data-comment-id="${id}"] .comment-card-status`)?.textContent === 'Resolved',
  region.comment.id, undefined, { timeout: 5000 });
  await card.locator('[data-action="reopen"]').click();
  await page.waitForFunction((id) => document.querySelector(
    `.comment-card[data-comment-id="${id}"] .comment-card-status`)?.textContent === 'Open',
  region.comment.id, undefined, { timeout: 5000 });

  // A poll marks the agent listening; the TTL lapses without any art change.
  const revisionBefore = await page.evaluate(async () =>
    (await (await fetch('/api/state')).json()).artRevision);
  await page.evaluate(() => fetch('/api/comments/poll', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ since: null }) }));
  await page.waitForFunction(() =>
    document.getElementById('comment-listening').textContent.trim() === 'Listening',
  undefined, { timeout: 3000 });
  // The 150ms state poll never refreshes the heartbeat, so the 5s TTL lapses.
  await page.waitForFunction(() =>
    document.getElementById('comment-listening').textContent.trim() === 'Not listening',
  undefined, { timeout: 9000 });
  const revisionAfter = await page.evaluate(async () =>
    (await (await fetch('/api/state')).json()).artRevision);
  if (revisionAfter !== revisionBefore) throw new Error('polling changed the art revision');

  if (errors.length > 0) {
    throw new Error(`Browser page error(s) detected:\n${errors.join('\n')}`);
  }
  return { success: true };
}
