async (page) => {
  const checks = [];
  const assert = (condition, message) => {
    if (!condition) throw new Error(`APPEARANCE FAILED: ${message}`);
  };
  const done = (name) => checks.push(name);
  const origin = page.url().split('/').slice(0, 3).join('/');
  const state = async () => {
    const response = await page.request.get(`${origin}/api/state`);
    assert(response.ok(), `state read failed: ${response.status()}`);
    return response.json();
  };
  const human = async (path, body) => {
    const current = await state();
    const response = await page.request.post(`${origin}${path}`, {
      data: { source: 'human', expectedDocGeneration: current.docGeneration, ...body },
    });
    const result = await response.json();
    assert(response.ok(), `${path} failed: ${JSON.stringify(result)}`);
    return result;
  };
  const waitOnline = () => page.waitForFunction(() => {
    const canvas = document.getElementById('painting-canvas');
    return canvas && document.querySelector('#control-host button') &&
      canvas.getBoundingClientRect().height > 100;
  }, null, { timeout: 15000 });
  const rect = (selector) => page.locator(selector).boundingBox();
  const waitControl = (label) => page.locator(`#control-host [aria-label="${label}"]`).waitFor({ timeout: 8000 });
  const clickControl = async (label) => { await waitControl(label); await page.locator(`#control-host [aria-label="${label}"]`).click(); };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await waitOnline();

  const fixed = await page.evaluate(() => {
    const root = document.getElementById('workspace-root');
    const art = document.getElementById('painting-canvas');
    const ui = document.getElementById('ui-canvas');
    const controls = document.getElementById('control-host');
    const visibleText = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeValue.trim() && node.parentElement && getComputedStyle(node.parentElement).visibility !== 'hidden' &&
        getComputedStyle(node.parentElement).opacity !== '0' && !controls.contains(node.parentElement)) visibleText.push(node.nodeValue.trim());
    }
    return {
      root: root.getBoundingClientRect().toJSON(), art: art.getBoundingClientRect().toJSON(),
      ui: { width: ui.width, height: ui.height, css: ui.getBoundingClientRect().toJSON() },
      visibleText,
      dpr: devicePixelRatio,
    };
  });
  assert(fixed.root.width > 0 && fixed.root.height > 0, 'workspace is mounted');
  assert(Math.abs(fixed.root.width / fixed.root.height - 1000 / 700) < 0.01, 'viewport scaling is uniform');
  assert(fixed.ui.width === Math.round(1000 * fixed.dpr) && fixed.ui.height === Math.round(700 * fixed.dpr), 'UI canvas honors DPR');
  assert(Math.abs(fixed.ui.css.width / fixed.ui.css.height - 1000 / 700) < 0.01, 'DPR CSS mapping preserves aspect');
  assert(fixed.visibleText.length === 0, `visible text must be vector-only: ${fixed.visibleText.join('|')}`);
  const semantic = await page.evaluate(() => [...document.querySelectorAll('#control-host button,#control-host input,#control-host textarea')]
    .map((node) => ({ label: node.getAttribute('aria-label'), opacity: getComputedStyle(node).opacity, rect: node.getBoundingClientRect().toJSON() })));
  assert(semantic.length > 0 && semantic.every((item) => item.opacity === '0'), 'semantic controls are invisible overlays');
  assert(semantic.every((item) => item.rect.width > 0 && item.rect.height > 0), 'semantic controls have geometry');
  done('mounted vector workspace, DPR mapping, and invisible controls');

  await page.waitForFunction(() => {
    const save = document.querySelector('#control-host button[aria-label="Save project"]');
    return save && !save.disabled;
  }, null, { timeout: 15000 });
  await human('/api/commands', { commands: [
    { type: 'rect', layer: 'paint', color: '#123456', opacity: 1, x: 848, y: 98, width: 4, height: 4 },
    { type: 'layer.add', id: 'appearance-layer-1', name: 'Appearance 1' },
    { type: 'layer.add', id: 'appearance-layer-2', name: 'Appearance 2' },
    { type: 'layer.add', id: 'appearance-layer-3', name: 'Appearance 3' },
    { type: 'layer.add', id: 'appearance-layer-4', name: 'Appearance 4' },
    { type: 'layer.add', id: 'appearance-layer-5', name: 'Appearance 5' },
    { type: 'layer.add', id: 'appearance-layer-6', name: 'Appearance 6' },
    { type: 'layer.add', id: 'appearance-layer-7', name: 'Appearance 7' },
  ], immediate: true, play: false });
  await page.waitForFunction(() => document.querySelector('#control-host input[aria-label="Layers scrollbar"]'), null, { timeout: 15000 });
  const expandedPixel = await page.evaluate(() => {
    const dpr = devicePixelRatio;
    const art = [...document.getElementById('painting-canvas').getContext('2d').getImageData(850, 100, 1, 1).data];
    const overlay = [...document.getElementById('ui-canvas').getContext('2d')
      .getImageData(Math.round(850 * dpr), Math.round(100 * dpr), 1, 1).data];
    return { art, overlay };
  });
  assert(expandedPixel.art.slice(0, 3).every((value, index) => Math.abs(value - [18, 52, 86][index]) <= 8)
    && expandedPixel.art[3] > 0, `seeded artwork is #123456 at design x850: ${expandedPixel.art}`);
  assert(expandedPixel.overlay[0] > 240 && expandedPixel.overlay[1] > 240 && expandedPixel.overlay[2] > 240 && expandedPixel.overlay[3] > 0,
    'expanded sidebar paints its white overlay over design x850');
  done('expanded sidebar crop and layer overflow fixture');

  await clickControl('Collapse panel');
  await waitControl('Expand panel');
  const collapsed = await page.evaluate(() => ({
    expand: document.querySelector('#control-host [aria-label="Expand panel"]')?.getBoundingClientRect().toJSON(),
    root: document.getElementById('workspace-root').getBoundingClientRect().toJSON(),
  }));
  assert(collapsed.expand && collapsed.expand.width > 0, 'collapsed workspace reveals expand control');
  assert(collapsed.root.width / collapsed.root.height > 1.4, 'collapsed workspace exposes the 1000-unit canvas');
  const collapsedPixel = await page.evaluate(() => {
    const dpr = devicePixelRatio;
    const art = [...document.getElementById('painting-canvas').getContext('2d').getImageData(850, 100, 1, 1).data];
    const overlay = [...document.getElementById('ui-canvas').getContext('2d')
      .getImageData(Math.round(850 * dpr), Math.round(100 * dpr), 1, 1).data];
    return { art, overlay };
  });
  assert(JSON.stringify(collapsedPixel.art) === JSON.stringify(expandedPixel.art), 'collapse does not remap artwork coordinates');
  assert(collapsedPixel.overlay[3] === 0, 'collapsed workspace reveals design x850 without sidebar overlay');
  await clickControl('Expand panel');
  await waitControl('Collapse panel');
  done('collapse exposes 1000 units and expansion restores 740-unit crop');

  const seeded = [];
  for (let index = 0; index < 7; index += 1) {
    seeded.push(await human('/api/comments', {
      requestId: `appearance-comment-${index}`,
      text: `Appearance fixture ${index}`,
      rect: { x: 20 + index, y: 20 + index, width: 80, height: 60 },
      continuePlayback: false,
      expectedArtRevision: (await state()).artRevision,
      expectedControlEpoch: (await state()).controlEpoch,
    }));
  }
  await clickControl('Feedback');
  try {
    await page.waitForFunction(() => {
      const area = document.querySelector('#control-host textarea[aria-label="Feedback draft"]');
      return area && !area.disabled;
    }, null, { timeout: 8000 });
  } catch (error) {
    const evidence = await page.evaluate(() => [...document.querySelectorAll('#control-host button,#control-host input,#control-host textarea')]
      .map((node) => ({ label: node.getAttribute('aria-label'), disabled: node.disabled })));
    throw new Error(`Feedback composer did not become editable; live controls: ${JSON.stringify(evidence)} (${error.message})`);
  }
  const comments = await page.evaluate(() => {
    const controls = [...document.querySelectorAll('#control-host button')];
    const rows = controls.filter((node) => node.getAttribute('aria-label')?.startsWith('Select comment '));
    const scroll = document.querySelector('#control-host input[aria-label="Comments scrollbar"]');
    return {
      rows: rows.map((node) => node.getBoundingClientRect().toJSON()),
      scroll: scroll?.getBoundingClientRect().toJSON(),
      scrollMax: scroll?.max,
    };
  });
  assert(comments.rows.length === 4, `viewport clips comment cards to the four visible rows: ${comments.rows.length}`);
  assert((await state()).comments.length === 7, 'all seven fixture comments remain in the mounted model');
  const commentScale = fixed.root.width / 1000;
  assert(comments.rows.every((row) => Math.abs(row.width - 216 * commentScale) < 1), 'comment cards are exactly 216 design units wide');
  assert(comments.scroll && comments.scroll.width > 0, 'comment overflow has a scrollbar control');
  assert(Number(comments.scrollMax) > 0, 'comment overflow exposes scroll range');
  assert(Math.abs((comments.rows[0].x - fixed.root.x) / commentScale - 752) < 1 &&
    Math.abs((comments.rows[0].x + comments.rows[0].width - fixed.root.x) / commentScale - 968) < 1,
  'comment cards occupy design x752..968');
  assert(Math.abs((comments.scroll.x - fixed.root.x) / commentScale - 980) < 1 &&
    Math.abs((comments.scroll.x + comments.scroll.width - fixed.root.x) / commentScale - 1000) < 1,
  'comment scrollbar hitbox occupies the reserved x980..1000 gutter');
  const scrollbarPixel = await page.evaluate(() => {
    const dpr = devicePixelRatio;
    return [...document.getElementById('ui-canvas').getContext('2d')
      .getImageData(Math.round(994 * dpr), Math.round(520 * dpr), 1, 1).data];
  });
  assert(scrollbarPixel[0] >= 120 && scrollbarPixel[0] <= 180 && scrollbarPixel[3] > 0, 'comment scrollbar paints its shared 4px x994 axis');
  const layerScroll = await page.locator('#control-host input[aria-label="Layers scrollbar"]').boundingBox();
  assert(layerScroll && Math.abs((layerScroll.x - fixed.root.x) / commentScale - 980) < 1, 'layer scrollbar shares the x980 hitbox axis');
  done('comment cards, gutter, and shared scrollbar geometry');

  const cls = await page.evaluate(() => {
    let total = 0;
    const observer = new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries()) if (!entry.hadRecentInput) total += entry.value;
    });
    observer.observe({ type: 'layout-shift', buffered: false });
    window.__appearanceCLS = { observer, read: () => total };
    return total;
  });
  await human('/api/commands', { commands: [{ type: 'stroke', layer: 'paint', color: '#123456', size: 5, points: [[80, 80], [120, 120]] }], immediate: true, play: false });
  const updateBefore = (await state()).comments.length;
  const commentScrollbar = page.locator('#control-host input[aria-label="Comments scrollbar"]');
  const scrollMaxBefore = await commentScrollbar.getAttribute('max');
  await human('/api/comments', {
    requestId: 'appearance-cls-comment', text: 'CLS update', rect: null, continuePlayback: false,
    expectedArtRevision: (await state()).artRevision, expectedControlEpoch: (await state()).controlEpoch,
  });
  let mounted = false;
  const mountDeadline = Date.now() + 8000;
  while (!mounted) {
    const scrollMaxAfter = await commentScrollbar.getAttribute('max');
    if (scrollMaxAfter !== scrollMaxBefore && Number(scrollMaxAfter) > 0) mounted = true;
    else if (Date.now() > mountDeadline) throw new Error('APPEARANCE FAILED: timed out waiting for mounted scrollbar descriptor update');
    else await page.waitForTimeout(50);
  }
  assert(mounted, 'comment scrollbar descriptor reflects the fixture mutation');
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const finalCls = await page.evaluate(() => { const value = window.__appearanceCLS.read(); window.__appearanceCLS.observer.disconnect(); return value; });
  assert(finalCls === 0, `layer/comments updates introduce CLS ${finalCls}`);
  done('PerformanceObserver CLS remains zero during actual updates');

  if (typeof page.context === 'function' && page.context()?.browser?.()?.newContext) {
    const context = await page.context().browser().newContext({ viewport: { width: 1400, height: 980 }, deviceScaleFactor: 2 });
    try {
      const dprPage = await context.newPage();
      await dprPage.goto(origin);
      await dprPage.waitForSelector('#painting-canvas', { timeout: 15000 });
      await dprPage.waitForFunction(() => document.getElementById('painting-canvas')
        .getContext('2d').getImageData(850, 100, 1, 1).data[3] > 0, null, { timeout: 15000 });
      const dprCheck = await dprPage.evaluate(() => ({
        artBacking: [document.getElementById('painting-canvas').width, document.getElementById('painting-canvas').height],
        uiBacking: [document.getElementById('ui-canvas').width, document.getElementById('ui-canvas').height],
        artPixel: [...document.getElementById('painting-canvas').getContext('2d').getImageData(850, 100, 1, 1).data],
      }));
      assert(JSON.stringify(dprCheck.artBacking) === JSON.stringify([1000, 700]), 'DPR context keeps artwork backing at 1000x700');
      assert(JSON.stringify(dprCheck.uiBacking) === JSON.stringify([2000, 1400]), 'DPR context allocates UI backing at 2000x1400');
      assert(dprCheck.artPixel.slice(0, 3).every((value, index) => Math.abs(value - [18, 52, 86][index]) <= 8),
        `DPR context preserves canonical x850 artwork pixel: ${dprCheck.artPixel}`);
    } finally {
      await context.close();
    }
  }

  await clickControl('Feedback');
  await waitControl('Feedback');
  await clickControl('Feedback');
  await page.waitForFunction(() => {
    const area = document.querySelector('#control-host textarea[aria-label="Feedback draft"]');
    return area && !area.disabled;
  }, null, { timeout: 8000 });
  const canvas = await rect('#painting-canvas');
  const beforeCount = (await state()).comments.length;
  const root = await rect('#workspace-root');
  assert(root, 'workspace root is available for an outside-start drag');
  await page.mouse.move(root.x - 20, root.y + root.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * 0.98, canvas.y + canvas.height * 0.98, { steps: 6 });
  await page.mouse.up();
  const selecting = await state();
  assert(selecting.playback.status === 'paused', 'selection pauses the session before SEND');
  const draftArea = page.locator('#control-host textarea[aria-label="Feedback draft"]');
  await draftArea.fill('edge drag');
  await clickControl('Send feedback');
  const draft = await state();
  assert(draft.comments.length === beforeCount + 1, 'live region drag reaches the mounted review flow');
  const last = draft.comments.at(-1);
  assert(last.rect && last.rect.width > 0 && last.rect.height > 0 && last.rect.x + last.rect.width <= 1000 && last.rect.y + last.rect.height <= 700,
    'live drag records bounded dimensions and edges');
  assert(draft.activeGrant && draft.activeGrant.docGeneration === draft.docGeneration &&
    typeof draft.activeGrant.grantToken === 'string' && draft.activeGrant.grantToken.length > 0,
  'continuation SEND returns an active grant for the accepted comment context');
  done('live region drag dimensions and edge bounds');
  await page.screenshot({ path: 'artifacts/browser-check/appearance-live.png', fullPage: false });

  return { success: true, checks, fixtureComments: seeded.length };
}
