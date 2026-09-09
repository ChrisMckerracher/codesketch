// Browser end-to-end scenario for Codesketch. Executed via playwright-cli run-code.
async (page) => {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    errors.push(err.message);
  });

  // 1. Desktop viewport (1440x900) layout & canvas bounds
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForSelector('#canvas');

  const desktopBounds = await page.evaluate(() => {
    const doc = document.documentElement;
    const canvas = document.getElementById('canvas');
    const rect = canvas.getBoundingClientRect();
    return {
      overflow: doc.scrollWidth > doc.clientWidth,
      width: canvas.width,
      height: canvas.height,
      visible: rect.width > 0 && rect.height > 0,
    };
  });
  if (desktopBounds.overflow) throw new Error('Desktop layout (1440px) has horizontal overflow');
  if (desktopBounds.width !== 1000 || desktopBounds.height !== 700 || !desktopBounds.visible) {
    throw new Error('Canvas not visible or incorrect intrinsic dimensions (1000x700)');
  }

  // 2. Mobile viewport (390x844) responsive bounds & stacked layout
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileBounds = await page.evaluate(() => {
    const doc = document.documentElement;
    const canvas = document.getElementById('canvas');
    const rect = canvas.getBoundingClientRect();
    return {
      overflow: doc.scrollWidth > doc.clientWidth,
      fitsViewport: rect.width <= 390,
      visible: rect.width > 0 && rect.height > 0,
    };
  });
  if (mobileBounds.overflow) throw new Error('Mobile layout (390px) has horizontal overflow');
  if (!mobileBounds.fitsViewport || !mobileBounds.visible) {
    throw new Error('Mobile canvas does not fit within 390px viewport width');
  }

  // Restore desktop layout for interactive painting scenario
  await page.setViewportSize({ width: 1440, height: 900 });

  // 3. Manual pointer drawing
  const canvas = page.locator('#canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Failed to retrieve canvas bounding box');

  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 180, box.y + 180, { steps: 5 });
  await page.mouse.up();

  await page.waitForFunction(() => {
    const undoBtn = document.getElementById('btn-undo');
    return undoBtn && !undoBtn.disabled;
  }, undefined, { timeout: 5000 });

  const drawMarkCount = await page.evaluate(async () => {
    const res = await fetch('/api/state');
    const snap = await res.json();
    return snap.document?.marks?.length ?? 0;
  });
  if (drawMarkCount < 1) throw new Error('Manual pointer stroke was not committed to document');

  // 4. Undo and Redo navigation
  await page.click('#btn-undo');
  await page.waitForFunction(() => {
    const redoBtn = document.getElementById('btn-redo');
    return redoBtn && !redoBtn.disabled;
  }, undefined, { timeout: 5000 });

  const undoMarkCount = await page.evaluate(async () => {
    const res = await fetch('/api/state');
    const snap = await res.json();
    return snap.document?.marks?.length ?? 0;
  });
  if (undoMarkCount !== 0) throw new Error(`Undo failed: expected 0 marks, got ${undoMarkCount}`);

  await page.click('#btn-redo');
  await page.waitForFunction(() => {
    const undoBtn = document.getElementById('btn-undo');
    return undoBtn && !undoBtn.disabled;
  }, undefined, { timeout: 5000 });

  // 5. Add layer, select layer, draw, toggle visibility, and compare canvas output
  await page.click('#btn-add-layer');
  await page.waitForSelector('#modal-dialog[open]');
  await page.fill('#modal-input-field', 'ink');
  await page.click('#modal-btn-confirm');
  await page.waitForSelector('[data-layer-id="ink"]');

  await page.click('[data-layer-id="ink"] .layer-main-info');
  await page.mouse.move(box.x + 250, box.y + 250);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 300, { steps: 5 });
  await page.mouse.up();

  await page.waitForFunction(() => {
    const undoBtn = document.getElementById('btn-undo');
    return undoBtn && !undoBtn.disabled;
  }, undefined, { timeout: 5000 });

  const urlVisible = await page.evaluate(() => document.getElementById('canvas').toDataURL());

  await page.click('[data-layer-id="ink"] .layer-btn-visibility');
  await page.waitForSelector('[data-layer-id="ink"] .layer-btn-visibility.hidden-layer');
  const urlHidden = await page.evaluate(() => document.getElementById('canvas').toDataURL());
  if (urlVisible === urlHidden) throw new Error('Hiding ink layer did not alter canvas rendering');

  await page.click('[data-layer-id="ink"] .layer-btn-visibility');
  await page.waitForSelector('[data-layer-id="ink"] .layer-btn-visibility:not(.hidden-layer)');

  // 6. Demo progressive playback, pause, and step
  await page.click('#btn-demo');
  const confirmModal = await page.waitForSelector('#modal-dialog[open]', { timeout: 1000 }).catch(() => null);
  if (confirmModal) await page.click('#modal-btn-confirm');

  await page.waitForFunction(() => {
    const countEl = document.getElementById('queue-count');
    return countEl && parseInt(countEl.textContent, 10) > 0;
  }, undefined, { timeout: 5000 });

  const initialDemoStatus = await page.evaluate(() => document.getElementById('status-label').textContent.trim());
  if (initialDemoStatus !== 'Paused') throw new Error(`Demo should load paused, got "${initialDemoStatus}"`);

  await page.click('#btn-play-pause');
  await page.waitForFunction(() => document.getElementById('status-label').textContent.trim() === 'Playing', undefined, { timeout: 5000 });

  const queueBeforePlay = await page.evaluate(() => parseInt(document.getElementById('queue-count').textContent, 10));
  await page.waitForFunction((prev) => {
    const cur = parseInt(document.getElementById('queue-count').textContent, 10);
    return cur < prev;
  }, queueBeforePlay, { timeout: 5000 });

  await page.click('#btn-play-pause');
  await page.waitForFunction(() => document.getElementById('status-label').textContent.trim() === 'Paused', undefined, { timeout: 5000 });

  const queueBeforeStep = await page.evaluate(() => parseInt(document.getElementById('queue-count').textContent, 10));
  await page.click('#btn-step');
  await page.waitForFunction((prev) => {
    const cur = parseInt(document.getElementById('queue-count').textContent, 10);
    return cur === prev - 1;
  }, queueBeforeStep, { timeout: 5000 });

  // 7. Human feedback sticky pause
  await page.fill('#input-feedback', 'Needs warmer tones in foreground.');
  await page.click('#btn-send-feedback');
  await page.waitForSelector('.feedback-card');

  const feedbackState = await page.evaluate(() => {
    const cardText = document.querySelector('.feedback-card-text')?.textContent ?? '';
    const status = document.getElementById('status-label').textContent.trim();
    return { cardText, status };
  });
  if (!feedbackState.cardText.includes('Needs warmer tones')) {
    throw new Error('Feedback item not found in history list');
  }
  if (feedbackState.status !== 'Paused') {
    throw new Error(`Feedback did not stickily pause playback, status is "${feedbackState.status}"`);
  }

  // 8. Save JSON and Export PNG download
  const [pngDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#btn-export'),
  ]);
  await pngDownload.saveAs('artifacts/browser-check/artwork.png');

  const [jsonDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#btn-save'),
  ]);
  const jsonPath = 'artifacts/browser-check/project.json';
  await jsonDownload.saveAs(jsonPath);

  // Load JSON project file
  await page.locator('#file-input-project').setInputFiles(jsonPath);
  const replaceConfirm = await page.waitForSelector('#modal-dialog[open]', { timeout: 1000 }).catch(() => null);
  if (replaceConfirm) await page.click('#modal-btn-confirm');
  await page.waitForFunction(() => {
    const notif = document.getElementById('notification-message');
    return notif && notif.textContent.includes('Project loaded');
  }, undefined, { timeout: 5000 });

  // 9. Verify zero console or page errors
  if (errors.length > 0) {
    throw new Error(`Browser console/page error(s) detected during run:\n${errors.join('\n')}`);
  }

  return { success: true };
}
