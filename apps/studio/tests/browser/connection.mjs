async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(`CONNECTION FAILED: ${message}`); };
  const checks = [];
  const done = (name) => checks.push(name);
  const origin = page.url().split('/').slice(0, 3).join('/');
  try {
    const statusText = () => page.locator('#global-header .cs-status-text').textContent();
    const noticeText = () => page.locator('#studio-notice').textContent();
    const api = (path, body) => page.request.post(origin + path, { data: { source: 'human', ...body } })
      .then(async (response) => {
        assert(response.ok(), `${path}: ${response.status()}`);
        return response.json();
      });
    const observe = () => page.request.get(origin + '/api/state').then((response) => response.json());
    const rawHidePainting = async () => {
      const snapshot = await observe();
      return api('/api/commands', { commands: [{ type: 'layer.update', id: 'paint', visible: false }],
        immediate: true, play: false, expectedDocGeneration: snapshot.docGeneration });
    };
    const rotateGeneration = async () => {
      const snapshot = await observe();
      return api('/api/control', { action: 'new', expectedDocGeneration: snapshot.docGeneration });
    };
    const routes = [];
    const routed = async (pattern, handler) => {
      routes.push(pattern);
      await page.route(pattern, handler);
    };
    let captured = false;
    let heldRoute = null;
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForSelector('#painting-canvas');
      await page.waitForFunction(() =>
        document.querySelector('#global-header .cs-status-text')?.textContent !== 'Connecting');

      // Offline via a failing state fetch: the header reports Offline, then recovery restores it.
      await routed('**/api/state*', (route) => route.abort('failed'));
      await page.waitForFunction(() =>
        document.querySelector('#global-header .cs-status-text')?.textContent === 'Offline', null, { timeout: 8000 });
      done('offline is reported');
    } finally {
      await page.unroute('**/api/state*');
    }
    await page.waitForFunction(() =>
      ['Connected', 'Changes applied'].includes(
        document.querySelector('#global-header .cs-status-text')?.textContent ?? ''), null, { timeout: 8000 });
    done('recovery restores reachability');

    try {
      // An HTTP 500 on a sent mutation is uncertain: the notice retains the actual
      // failure while the header keeps reporting a reachable session.
      await routed('**/api/commands', (route) =>
        route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"storage exploded"}' }));
      await page.locator('#tool-dock button[aria-label^="Hand"]').click();
      await page.getByRole('heading', { name: 'Document Properties' }).waitFor();
      const bgHex = page.locator('#right-inspector input[aria-label="Canvas background hex value"]');
      await bgHex.fill('#010203');
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await page.waitForFunction(() =>
        document.getElementById('studio-notice')?.textContent.includes('Background change failed'), null, { timeout: 8000 });
      assert((await noticeText()).includes('storage exploded'), 'the notice preserves the actual failure reason');
      const reachable = await statusText();
      assert(['Connected', 'Changes applied'].includes(reachable),
        `a failed mutation must not flip reachability to Offline (got ${reachable})`);
      done('uncertain mutation keeps a retained notice and stays reachable');
    } finally {
      await page.unroute('**/api/commands');
    }
    await page.locator('#right-inspector input[aria-label="Canvas background hex value"]').fill('#010203');
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.waitForFunction(async () => {
      const snapshot = await (await fetch('/api/state')).json();
      return snapshot.document.background === '#010203';
    }, null, { timeout: 8000 });

    try {
      // Hold the first actual browser state poll, apply a newer snapshot through
      // the visibility mutation ACK, then replay the exact old full snapshot:
      // the UI must not roll back to the older revision.
      const oldSnapshot = await observe();
      await routed('**/api/state*', (route) => {
        if (!captured) {
          captured = true;
          heldRoute = route;
          return;
        }
        return route.continue();
      });
      for (let i = 0; i < 60 && heldRoute === null; i += 1) await page.waitForTimeout(100);
      assert(heldRoute !== null, 'the first browser state poll is held');
      const visibleLabelBefore = await page.locator('#layer-panel .cs-layer-vis').first().getAttribute('aria-label');
      await page.locator('#layer-panel .cs-layer-vis').first().click();
      await page.waitForFunction((previous) =>
        document.querySelector('#layer-panel .cs-layer-vis')?.getAttribute('aria-label') !== previous,
      visibleLabelBefore, { timeout: 8000 });
      const hiddenLabel = await page.locator('#layer-panel .cs-layer-vis').first().getAttribute('aria-label');
      assert(hiddenLabel.startsWith('Show '), 'the mutation ACK applied the newer hidden state');
      await heldRoute.fulfill({ status: 200, contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(oldSnapshot) });
      heldRoute = null;
      await page.waitForTimeout(600);
      assert((await page.locator('#layer-panel .cs-layer-vis').first().getAttribute('aria-label')) === hiddenLabel,
        'the late older snapshot must not un-hide the layer after the newer state landed');
      done('delayed old state response cannot replace newer state');
    } finally {
      if (heldRoute) {
        try {
          await heldRoute.abort('failed');
        } catch {}
      }
      await page.unroute('**/api/state*');
    }
    await api('/api/commands', { commands: [{ type: 'layer.update', id: 'paint', visible: true }],
      immediate: true, play: false, expectedDocGeneration: (await observe()).docGeneration });

    // A generation rotation while a pointer stroke is held cancels the gesture:
    // the release must not commit a late stroke into the replacement document.
    const canvas = page.locator('#painting-canvas');
    const box = await canvas.boundingBox();
    await page.locator('#tool-dock button[aria-label^="Paintbrush"]').click();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30, { steps: 4 });
    const rotated = await rotateGeneration();
    await page.mouse.up();
    await page.waitForTimeout(1200);
    const afterStrokeReset = await observe();
    assert(afterStrokeReset.instanceId === rotated.instanceId, 'the instance remains stable across the reset');
    assert(afterStrokeReset.docGeneration === rotated.docGeneration, 'the rotated generation is the current one');
    assert(afterStrokeReset.history.total === 0 && afterStrokeReset.document.marks.length === 0,
      'no late stroke commits into the rotated document');
    done('generation reset cancels a held stroke without a late commit');

    // A generation rotation while a review region selection is held goes stale:
    // no comment is submitted from the discarded selection and the pause releases
    // with the replacement document.
    await page.locator('#tool-dock button[aria-label^="Comment"]').click();
    await page.locator('#feedback-composer .review-composer:not([hidden])').waitFor();
    await page.waitForFunction(() =>
      document.querySelector('#feedback-composer .review-status-line')?.textContent
        === 'Drag a region on the canvas, or switch to the whole canvas.', null, { timeout: 8000 });
    await page.mouse.move(box.x + box.width / 3, box.y + box.height / 3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
    await rotateGeneration();
    await page.mouse.up();
    await page.waitForFunction(() =>
      document.querySelector('#feedback-composer .review-status-line')?.textContent
        === 'The artwork changed. Reselect the region to continue.', null, { timeout: 8000 });
    await page.waitForTimeout(800);
    const afterReviewReset = await observe();
    assert(afterReviewReset.comments.length === 0, 'no comment is submitted from the rotated selection');
    assert(afterReviewReset.playback.status === 'idle' && afterReviewReset.playback.remaining === 0,
      'reset does not auto-resume playback (no queue)');
    done('generation reset while review region held goes stale without submitting');

    return { success: true, checks };
  } catch (error) {
    const visible = await page.evaluate(() => ({
      status: document.querySelector('#global-header .cs-status-text')?.textContent ?? null,
      notice: document.querySelector('#studio-notice')?.textContent ?? null,
      activeElement: document.activeElement ? `${document.activeElement.tagName}.${document.activeElement.className || ''}` : null,
      layerRows: document.querySelectorAll('.cs-layer-row').length,
      dockButtons: document.querySelectorAll('.cs-dock-btn').length,
    })).catch(() => null);
    const completed = checks.length > 0 ? checks.join(', ') : 'none';
    error.message = `${error.message} | completed checks [${completed}] | visible ${JSON.stringify(visible)}`;
    throw error;
  }

}
