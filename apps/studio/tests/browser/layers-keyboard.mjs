async (page) => {
  await page.setViewportSize({ width: 1440, height: 980 });
  await page.evaluate(async () => {
    const post = async (path, body) => {
      const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'human', ...body }) });
      if (!response.ok) throw new Error((await response.json()).error);
    };
    await post('/api/control', { action: 'new' });
    await post('/api/commands', { commands: [{ type: 'layer.add', id: 'keyboard', name: 'Keyboard' }], immediate: true });
  });
  const row = id => page.locator(`[data-layer-id="${id}"]`);
  const selected = id => page.waitForFunction(id => document.querySelector(`[data-layer-id="${id}"]`)?.getAttribute('aria-checked') === 'true', id);
  await row('keyboard').waitFor();
  await row('paint').focus();
  await page.keyboard.press('Enter');
  await selected('paint');
  await row('keyboard').focus();
  await page.keyboard.press('Space');
  await selected('keyboard');
  await page.keyboard.press('ArrowDown');
  await selected('paint');
  await page.keyboard.press('ArrowUp');
  await selected('keyboard');

  // A visibility button retains native activation and leaves selection intact.
  const visibility = row('paint').locator('.layer-btn-visibility');
  for (const [key, visible] of [['Enter', false], ['Space', true]]) {
    await visibility.focus();
    await page.keyboard.press(key);
    await page.waitForFunction(async visible => {
      const snapshot = await (await fetch('/api/state')).json();
      return snapshot.document.layers.find(layer => layer.id === 'paint').visible === visible;
    }, visible);
    await page.waitForFunction(visible => {
      const button = document.querySelector('[data-layer-id="paint"] .layer-btn-visibility');
      return button.classList.contains('hidden-layer') === !visible;
    }, visible);
    await selected('keyboard');
  }
  return { success: true };
}
