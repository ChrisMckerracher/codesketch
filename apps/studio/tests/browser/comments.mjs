// Browser coverage for the current vector feedback controls.
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
      if (Date.now() > deadline) throw new Error(`COMMENTS FAILED: timed out waiting for ${message}`);
      await page.waitForTimeout(100);
    }
  };
  const control = (label) => page.locator(`#control-host [aria-label="${label}"]`);
  const click = (label) => control(label).click({ timeout: 8000 });
  const canvas = page.locator('#painting-canvas');
  const consoleMessages = [];
  page.on('console', (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));
  const observePauseCompletion = () => page.evaluate(() => {
    window.__toggleOriginalFetch = window.fetch.bind(window);
    window.__togglePauseDone = 0;
    window.fetch = async (input, init) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      const response = await window.__toggleOriginalFetch(input, init);
      if (init?.method === 'POST' && String(input).endsWith('/api/control') && body?.action === 'pause') {
        window.__togglePauseDone += 1;
      }
      return response;
    };
  });
  const removePauseObserver = () => page.evaluate(() => {
    if (window.__toggleOriginalFetch) window.fetch = window.__toggleOriginalFetch;
    window.__toggleOriginalFetch = null;
    window.__togglePauseDone = null;
  });
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
      await page.screenshot({ path: 'artifacts/browser-check/comments-draft-timeout.png' });
      const diagnostics = await page.evaluate(() => ({
        active: document.activeElement?.getAttribute?.('aria-label') ?? document.activeElement?.tagName,
        focused: document.activeElement === document.querySelector('#control-host textarea'),
      }));
      const snapshot = await state();
      throw new Error(`${error.message}; drag ${JSON.stringify({ from, to })}; controls: ${JSON.stringify(labels)}; `
        + `focus: ${JSON.stringify(diagnostics)}; server: ${JSON.stringify({
          playback: snapshot.playback?.status, generation: snapshot.docGeneration, comments: snapshot.comments?.length,
        })}; console: ${JSON.stringify(consoleMessages)}`);
    }
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForSelector('#control-host [aria-label="Feedback"]');
  {
    const seeded = await human('/api/commands', { commands: [
      { type: 'stroke', layer: 'paint', color: '#253d38', size: 10, points: [[80, 80], [220, 160]] },
      { type: 'layer.add', id: 'notes', name: 'Notes' },
      { type: 'layer.add', id: 'hidden', name: 'Hidden' },
      { type: 'layer.update', id: 'notes', opacity: 0.5 },
      { type: 'layer.update', id: 'hidden', visible: false },
    ], immediate: true, play: false });
    assert(seeded.document.layers.some((layer) => layer.id === 'hidden' && layer.visible === false), 'fixture layer missing');
    done('current-generation feedback fixture seeded');

    await human('/api/commands', { commands: [
      { type: 'stroke', layer: 'paint', color: '#1c2f6b', size: 8, points: [[40, 620], [940, 640]] },
    ], play: true, immediate: false });
    await human('/api/control', { action: 'resume' });
    await waitState((snapshot) => snapshot.playback.status === 'playing', 'playback to start');
    await click('Feedback');
    await waitState((snapshot) => snapshot.playback.status === 'paused', 'feedback to pause playback');
    await page.waitForTimeout(300);
    await dragRegion([0.15, 0.2], [0.45, 0.45]);
    await control('Feedback draft').fill('Soften the hill edge');
    await click('Send feedback');
    const stored = await waitState((snapshot) => snapshot.comments.length === 1, 'stored region comment');
    const region = stored.comments[0];
    assert(region.number === 1 && region.seq === 1 && region.status === 'open', 'stored region metadata is wrong');
    assert(region.text === 'Soften the hill edge' && region.rect?.width > 0 && region.rect?.height > 0, 'region feedback was not stored');
    assert(JSON.stringify(region.visibleLayers) === JSON.stringify([
      { id: 'paint', opacity: 1 }, { id: 'notes', opacity: 0.5 },
    ]), `visible-layer capture is wrong: ${JSON.stringify(region.visibleLayers)}`);
    assert(stored.requiresGrant === true && stored.activeGrant !== null && stored.playback.status === 'paused',
      'default continuation must grant without resuming playback');
    done('region drag, text, Send, and visible-layer capture use mounted controls');

    await control('Reply to comment 1').fill('Please keep the edge soft.');
    await click('Send reply');
    const replied = await waitState((snapshot) => snapshot.comments[0]?.replies?.length === 1, 'stored human reply');
    assert(replied.comments[0].replies[0].text === 'Please keep the edge soft.', 'reply text was not stored');
    done('reply textarea and Send reply persist a human reply');

    const move = async (action, id, expectedSeq) => {
      const generation = (await state()).docGeneration;
      const response = await page.request.post(`${origin}/api/comments/${action}`, {
        data: { id, expectedSeq, source: 'agent', expectedDocGeneration: generation },
      });
      const result = await response.json();
      assert(response.ok(), `${action} failed with ${response.status()}: ${JSON.stringify(result.error ?? result)}`);
      return result.comments.find((item) => item.id === id);
    };
    const latestRegion = (await state()).comments.find((item) => item.id === region.id);
    const ack = await move('ack', latestRegion.id, latestRegion.seq);
    const addressed = await move('address', latestRegion.id, ack.seq);
    assert(ack.status === 'acknowledged' && addressed.status === 'addressed', 'agent lifecycle failed');
    await waitState((snapshot) => snapshot.comments[0]?.status === 'addressed', 'addressed comment');
    await click('Resolve comment');
    const resolved = await waitState((snapshot) => snapshot.comments[0]?.status === 'resolved', 'UI resolve');
    assert(resolved.comments[0].seq > addressed.seq, 'resolve must advance the sequence');
    done('agent ack/address and mounted Resolve control follow the current sequence');

    // Close comment exits feedback mode; one Feedback activation starts the
    // next review after the stored control has detached.
    await click('Close comment');
    await page.waitForFunction(() => !document.querySelector('#control-host [aria-label="Close comment"]'), null, { timeout: 8000 });
    await observePauseCompletion();
    await click('Feedback');
    await page.waitForFunction(() => window.__togglePauseDone === 1, null, { timeout: 8000 });
    await dragRegion([0.55, 0.6], [0.8, 0.78]);
    await page.waitForSelector('#control-host [aria-label="Feedback draft"]', { timeout: 8000 });
    await removePauseObserver();
    await waitState((snapshot) => snapshot.playback.status === 'paused', 'second feedback pause');
    await control('Feedback draft').fill('second region');
    await click('Send feedback');
    const second = await waitState((snapshot) => snapshot.comments.length === 2, 'second stored region');
    assert(second.comments[1].text === 'second region' && second.comments[1].rect?.width > 0,
      'second region feedback was not stored');

    await click('Active comments');
    await page.waitForFunction(() => document.querySelectorAll('#control-host [aria-label="Select comment 1"]').length === 1
      && document.querySelectorAll('#control-host [aria-label="Select comment 2"]').length === 2, null, { timeout: 8000 });
    await click('All comments');
    await page.waitForFunction(() => document.querySelectorAll('#control-host [aria-label="Select comment 1"]').length > 0
      && document.querySelectorAll('#control-host [aria-label="Select comment 2"]').length > 0, null, { timeout: 8000 });
    done('ALL and ACTIVE filters expose the correct comment membership');

    const firstSelectors = page.locator('#control-host [aria-label="Select comment 1"]');
    assert(await firstSelectors.count() >= 2, 'comment 1 must expose both card and pin controls');
    await firstSelectors.nth(0).click();
    await control('Reply to comment 1').waitFor({ timeout: 8000 });
    await firstSelectors.nth(1).click();
    await control('Reply to comment 1').waitFor({ timeout: 8000 });
    await click('Next comment');
    await control('Reply to comment 2').waitFor({ timeout: 8000 });
    await click('Previous comment');
    await control('Reply to comment 1').waitFor({ timeout: 8000 });
    done('comment card, pin, and previous/next frame navigation reach the selected thread');

    let threadSnapshot = await state();
    for (let index = 0; index < 8; index += 1) {
      const text = `Thread detail ${index}`;
      const comment = threadSnapshot.comments.find((item) => item.id === region.id);
      const response = await page.request.post(`${origin}/api/comments/reply`, {
        data: {
          id: region.id, requestId: `qa-thread-${index}-${Date.now()}`, text, source: 'human',
          expectedDocGeneration: threadSnapshot.docGeneration, expectedSeq: comment.seq,
        },
      });
      assert(response.ok(), `thread fixture reply failed with ${response.status()}`);
      threadSnapshot = await response.json();
    }
    assert(threadSnapshot.comments.find((item) => item.id === region.id)?.replies?.length === 9,
      'thread fixture replies were not stored');
    await page.waitForFunction(() => Number(document.querySelector('#control-host [aria-label="Scroll comment 1"]')?.max) > 0,
      null, { timeout: 8000 });
    const replyArea = control('Reply to comment 1');
    const scroll = control('Scroll comment 1');
    const beforeScroll = Number(await scroll.inputValue());
    const replyBox = await replyArea.boundingBox();
    assert(replyBox, 'reply control must remain mounted beside the thread');
    await page.mouse.move(replyBox.x + 10, replyBox.y - 24);
    await page.mouse.wheel(0, 160);
    await page.waitForFunction((before) => Number(document.querySelector('#control-host [aria-label="Scroll comment 1"]')?.value) > before,
      beforeScroll, { timeout: 8000 });
    await replyArea.fill('Final reply remains reachable after thread scroll.');
    await click('Send reply');
    const finalState = await waitState((snapshot) => snapshot.comments[0]?.replies?.some((reply) => reply.text === 'Final reply remains reachable after thread scroll.'), 'final scrolled reply');
    assert(finalState.comments[0].replies.at(-1).text === 'Final reply remains reachable after thread scroll.', 'final reply was not persisted');
    done('wheel-scrolled thread keeps the final reply reachable and writable');

  }

  return { success: true, checks, comments: (await state()).comments.map((item) => ({
    number: item.number, status: item.status, scope: item.rect ? 'region' : 'whole',
  })) };
}
