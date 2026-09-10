async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(`APPEARANCE FAILED: ${message}`); };
  const checks = [];
  const done = (name) => checks.push(name);
  const shot = (name) => page.screenshot({ path: `artifacts/browser-check/v3a-${name}.png`, fullPage: false });
  const overlap = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const theme = () => page.evaluate(() => {
    const channel = (part) => Number(part) / 255;
    const luminance = (rgb) => {
      const values = rgb.match(/[\d.]+/g).slice(0, 3).map((part) => {
        const scaled = channel(part);
        return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
    };
    const body = getComputedStyle(document.body);
    const surface = getComputedStyle(document.body);
    const bright = luminance(surface.backgroundColor);
    const dark = luminance(body.color);
    const ratio = (Math.max(bright, dark) + 0.05) / (Math.min(bright, dark) + 0.05);
    return { font: body.fontFamily, background: surface.backgroundColor, color: body.color, ratio };
  });
  const assertLayout = async (label) => {
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(overflow <= 0, `${label}: page must not scroll horizontally`);
    const stage = await page.locator('#stage-viewport').boundingBox();
    const canvas = await page.locator('#canvas-wrapper').boundingBox();
    assert(stage && canvas, `${label}: fitted canvas is mounted`);
    assert(canvas.x >= stage.x - 0.5 && canvas.y >= stage.y - 0.5 &&
      canvas.x + canvas.width <= stage.x + stage.width + 0.5 &&
      canvas.y + canvas.height <= stage.y + stage.height + 0.5,
    `${label}: the 1000x700 canvas fits wholly inside the stage`);
    assert(Math.abs(canvas.width / canvas.height - 1000 / 700) < 0.02, `${label}: canvas keeps the artboard aspect`);
    const hud = await page.locator('#director-hud.cs-hud').boundingBox();
    const dock = await page.locator('#tool-dock .cs-dock-group').first().boundingBox();
    if (hud) assert(overlap(canvas, hud) === 0, `${label}: canvas stays clear of the playback HUD`);
    if (dock) assert(overlap(canvas, dock) === 0, `${label}: canvas stays clear of the tool dock`);
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll('#global-header button, #global-header input, #global-header select, #director-hud button, #tool-dock button, #tool-dock select')]
        .filter((element) => {
          const style = getComputedStyle(element);
          const visible = typeof element.checkVisibility === 'function'
            ? element.checkVisibility()
            : style.visibility !== 'hidden' && style.display !== 'none';
          if (!visible) return false;
          const rect = element.getBoundingClientRect();
          return rect.width === 0 || rect.height === 0 || rect.right > window.innerWidth + 1 ||
            rect.bottom > window.innerHeight + 1 || rect.left < -1;
        }).length);
    assert(clipped === 0, `${label}: visible header, HUD and dock controls stay inside the window`);
    assert(await page.locator('#director-hud button').first().isVisible(), `${label}: Pause/Resume control is visible`);
    assert(await page.locator('#global-header .cs-filename').isVisible(), `${label}: filename field is visible`);
    assert(await page.getByRole('button', { name: 'Export PNG' }).isVisible(), `${label}: Export PNG is visible`);
    assert(await page.getByRole('button', { name: 'Document' }).isVisible(), `${label}: Document menu is visible`);
    done(`${label} layout`);
  };
  const assertReadable = async (label, previous) => {
    const probe = await theme();
    assert(/-apple-system|system-ui/.test(probe.font), `${label}: uses native system fonts`);
    assert(probe.ratio >= 4, `${label}: text contrast stays readable (${probe.ratio.toFixed(2)})`);
    if (previous) assert(probe.background !== previous.background, `${label}: appearance actually switches`);
    return probe;
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.waitForSelector('#painting-canvas');
  await page.waitForFunction(() => {
    const wrapper = document.getElementById('canvas-wrapper');
    return wrapper && wrapper.getBoundingClientRect().height > 100;
  });
  const drawerTransition = await page.evaluate(() =>
    getComputedStyle(document.getElementById('compact-layers-drawer')).transitionDuration);
  assert(drawerTransition === '0s', 'reduced motion removes drawer transition timing');
  await assertLayout('1440x900 dark');
  const darkProbe = await assertReadable('dark', null);
  assert(!(await page.locator('#compact-layers-drawer[data-open="true"]').count()), 'compact drawer starts closed on desktop');

  await page.locator('#tool-dock button[aria-label^="Paintbrush"]').click();
  await page.getByRole('heading', { name: 'Brush Properties' }).waitFor();
  await shot('brush-1440-dark');
  done('brush state screenshot');

  await page.locator('#layer-panel .cs-layer-name').first().click();
  await page.getByRole('heading', { name: 'Layer Properties' }).waitFor();
  await page.getByRole('button', { name: 'Return to Brush Properties (B)' }).waitFor();
  await shot('layer-1440-dark');
  done('layer state screenshot');

  const opacityField = page.locator('#right-inspector input[aria-label="Layer opacity percent"]');
  await opacityField.fill('0');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.waitForFunction(() =>
    document.querySelector('#layer-panel .cs-layer-opacity')?.textContent === '0%');
  await page.locator('#layer-panel .cs-layer-name').first().click();
  await page.getByRole('heading', { name: 'Layer Properties' }).waitFor();
  assert((await opacityField.inputValue()) === '0', 'zero opacity survives re-entry and polls');
  await opacityField.fill('100');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.waitForFunction(() =>
    document.querySelector('#layer-panel .cs-layer-opacity')?.textContent === '100%');
  done('zero opacity fields');

  await page.locator('#tool-dock button[aria-label^="Paintbrush"]').click();
  await page.getByRole('heading', { name: 'Brush Properties' }).waitFor();
  const target = await page.locator('#right-inspector .cs-insp-target-name').textContent();
  assert(target && target !== 'No layer selected', 'returning to brush preserves the target layer');

  const filename = page.locator('#global-header .cs-filename');
  await filename.click();
  await filename.fill('Appearance');
  await page.waitForTimeout(400);
  assert((await filename.inputValue()) === 'Appearance', 'focused filename edit survives polls');
  assert(await page.evaluate(() => document.activeElement?.classList.contains('cs-filename')), 'filename keeps focus across polls');
  await filename.fill('Untitled');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  done('focused controls survive polls');

  await page.emulateMedia({ colorScheme: 'light' });
  await assertReadable('light', darkProbe);
  await shot('light-1440');
  done('light appearance');

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForTimeout(200);
  await assertLayout('1024x768 compact');
  const leftTrigger = page.locator('.rail-trigger[data-drawer-open="left"]').first();
  await leftTrigger.click();
  await page.locator('#compact-layers-drawer[data-open="true"]').waitFor();
  await page.locator('#compact-layers-drawer .cs-layer-name').first().click();
  await page.locator('#compact-inspector-drawer #right-inspector').getByRole('heading', { name: 'Layer Properties' }).waitFor();
  await page.locator('.rail-trigger[data-drawer-open="right"]').first().click();
  await page.locator('#compact-inspector-drawer[data-open="true"]').waitFor();
  await shot('compact-properties-1024');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() =>
    !document.getElementById('compact-layers-drawer').matches('[data-open="true"]'));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() =>
    !document.getElementById('compact-inspector-drawer').matches('[data-open="true"]'));
  const opener = page.locator('.rail-trigger[data-drawer-open="right"]').first();
  assert(await page.evaluate((button) => document.activeElement === button,
    await opener.elementHandle()), 'Escape returns focus to the drawer opener');
  assert((await opener.getAttribute('aria-expanded')) === 'false', 'opener aria-expanded resets on close');
  done('compact drawers and escape focus');

  await page.setViewportSize({ width: 1024, height: 600 });
  await page.waitForTimeout(200);
  await assertLayout('1024x600 short');
  await shot('short-1024x600-dark');

  return { success: true, checks };
}
