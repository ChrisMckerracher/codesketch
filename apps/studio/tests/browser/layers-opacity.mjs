async (page) => {
  await page.setViewportSize({ width: 1440, height: 980 });
  const slider = page.locator('#slider-layer-opacity');
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const post = (path, body) => page.evaluate(async ({ path, body }) => {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'human', ...body }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data;
  }, { path, body });
  const state = () => page.evaluate(async () => (await (await fetch('/api/state')).json()));
  const select = async (id) => {
    await page.locator(`[data-layer-id="${id}"] .layer-main-info`).click();
    await page.waitForFunction(id => document.querySelector(`[data-layer-id="${id}"]`)?.getAttribute('aria-checked') === 'true', id);
  };
  const reset = async () => {
    await post('/api/control', { action: 'new' });
    await page.waitForFunction(() => !document.querySelector('[data-layer-id="top"]'));
    await post('/api/commands', { commands: [{ type: 'layer.add', id: 'top', name: 'Top' }], immediate: true });
    await page.waitForSelector('[data-layer-id="top"]');
    await select('paint');
    await page.waitForFunction(() => document.getElementById('slider-layer-opacity').value === '100');
  };
  const hold = async (fraction) => {
    await slider.scrollIntoViewIfNeeded();
    const box = await slider.boundingBox();
    await page.mouse.move(box.x + box.width * fraction, box.y + box.height / 2);
    await page.mouse.down();
    return Number(await slider.inputValue());
  };
  const committed = async (id, value) => page.waitForFunction(async ({ id, value }) => {
    const snapshot = await (await fetch('/api/state')).json();
    return snapshot.document.layers.find(layer => layer.id === id)?.opacity === value / 100;
  }, { id, value });
  const pulse = async () => {
    await post('/api/control', { action: 'speed', speed: 0.25 });
    await page.waitForTimeout(350);
  };
  let releaseRoute = async () => {};
  const delayFirstSave = async (fail = false) => {
    let release, entered;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { entered = resolve; });
    const requests = [];
    const handler = async route => {
      const command = route.request().postDataJSON()?.commands?.[0];
      if (command?.type !== 'layer.update' || typeof command.opacity !== 'number') return route.continue();
      requests.push(command);
      if (requests.length === 1) {
        entered();
        await gate; // Delay arrival at the studio, not just the response.
        if (fail) return route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"Opacity save rejected for test"}' });
      }
      await route.continue();
    };
    await page.route('**/api/commands', handler);
    releaseRoute = async () => {
      release();
      await page.unroute('**/api/commands', handler);
    };
    return { release, requests, started: async () => {
      await Promise.race([started, page.waitForTimeout(3000).then(() => { throw new Error('opacity request did not start'); })]);
    } };
  };

  try {
    await reset();
    await post('/api/commands', { commands: [{ type: 'stroke', points: [[0, 0], [1000, 700]] }] });
    await pulse(); // Let the paused setup snapshot settle before starting input.
    const opacity = await hold(.35);
    assert(opacity > 20 && opacity < 50, 'real pointer did not adjust the native range');
    await post('/api/control', { action: 'resume' });
    await page.waitForTimeout(400);
    assert(Number(await slider.inputValue()) === opacity, 'playback overwrote held opacity');
    await page.mouse.up();
    await committed('paint', opacity);

    // Native keyboard input commits normally and remains synchronized.
    await slider.focus();
    await page.keyboard.press('ArrowLeft');
    await committed('paint', opacity - 1);
    await page.keyboard.press('Home');
    await committed('paint', 0);
    await page.keyboard.press('Home'); // A key at the range limit leaves no edit open.
    await post('/api/commands', { commands: [{ type: 'layer.update', id: 'paint', opacity: .75 }], immediate: true });
    await page.waitForFunction(() => document.getElementById('slider-layer-opacity').value === '75');

    // Cancellation restores server state and suppresses the old gesture's change.
    for (const reason of ['Escape', 'blur', 'pointercancel']) {
      await reset();
      await hold(.35);
      if (reason === 'Escape') await page.keyboard.press('Escape');
      else if (reason === 'blur') await page.locator('#btn-save').focus();
      else await slider.dispatchEvent('pointercancel', { pointerId: 1 });
      await page.mouse.up();
      await pulse();
      assert(Number(await slider.inputValue()) === 100, `${reason} retained a cancelled value`);
      assert((await state()).history.cursor === 1, `${reason} committed a cancelled edit`);
    }

    // Selection changes cancel the unsaved edit and preserve the new target.
    await reset();
    await hold(.35);
    await page.locator('[data-layer-id="top"] .layer-main-info').dispatchEvent('click');
    await page.mouse.up();
    await pulse();
    const switched = await state();
    assert(switched.document.layers.every(layer => layer.opacity === 1), 'selection switch saved the old gesture');
    assert(await page.locator('[data-layer-id="top"]').getAttribute('aria-checked') === 'true', 'selection switch lost its target');

    // Removing the edited layer via a new document cancels the gesture.
    await select('top');
    await hold(.35);
    await post('/api/control', { action: 'new' });
    await page.waitForFunction(() => !document.querySelector('[data-layer-id="top"]'));
    await page.mouse.up();
    await pulse();
    assert((await state()).history.cursor === 0, 'removed target produced a replacement-layer edit');
    assert(Number(await slider.inputValue()) === 100, 'removed target retained local opacity');

    // An older save keeps its starting layer; the newer save waits its turn.
    await reset();
    let delayed = await delayFirstSave();
    const first = await hold(.25);
    await page.mouse.up();
    await delayed.started();
    await pulse();
    assert(Number(await slider.inputValue()) === first, 'polling overwrote a pending save');
    await select('top');
    assert(Number(await slider.inputValue()) === 100, 'pending save followed selection to a different layer');
    const second = await hold(.65);
    await page.mouse.up();
    await pulse();
    assert(delayed.requests.length === 1, 'newer save reached the server before the delayed first save');
    assert(Number(await slider.inputValue()) === second, 'pending older save overwrote the newer value');
    delayed.release();
    await committed('paint', first);
    await committed('top', second);
    assert(delayed.requests.map(command => command.id).join(',') === 'paint,top', 'saves lost their starting targets');
    await releaseRoute();

    // An older completion cannot settle a newer gesture that is still held.
    await reset();
    delayed = await delayFirstSave();
    const older = await hold(.25);
    await page.mouse.up();
    await delayed.started();
    const newer = await hold(.65);
    delayed.release();
    await committed('paint', older);
    await pulse();
    assert(Number(await slider.inputValue()) === newer, 'older completion settled a newer held gesture');
    await page.mouse.up();
    await committed('paint', newer);
    await releaseRoute();

    // Failed earlier saves do not strand the queue or clear a newer local save.
    await reset();
    delayed = await delayFirstSave(true);
    await hold(.25);
    await page.mouse.up();
    await delayed.started();
    const afterFailure = await hold(.65);
    await page.mouse.up();
    await pulse();
    assert(delayed.requests.length === 1, 'failed-save queue sent its successor prematurely');
    delayed.release();
    await committed('paint', afterFailure);
    assert(Number(await slider.inputValue()) === afterFailure, 'old failure cleared a newer edit');
    await releaseRoute();

    // Failure of the current edit restores the server value and permits retry.
    await reset();
    delayed = await delayFirstSave(true);
    await hold(.25);
    await page.mouse.up();
    await delayed.started();
    delayed.release();
    await page.waitForFunction(() => document.getElementById('slider-layer-opacity').value === '100' &&
      document.getElementById('notification-message').textContent.includes('Failed to update layer opacity'));
    assert((await state()).history.cursor === 1, 'failed save mutated the layer');
    await releaseRoute();
    await slider.focus();
    await page.keyboard.press('ArrowLeft');
    await committed('paint', 99);
    return { success: true };
  } finally {
    await releaseRoute();
    await page.mouse.up();
  }
}
