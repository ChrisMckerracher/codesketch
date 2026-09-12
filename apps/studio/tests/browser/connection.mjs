async (page) => {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`connection.mjs failed: ${message}`);
  };
  const problems = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('net::ERR_FAILED')) {
      problems.push(`console: ${message.text()}`);
    }
  });
  page.on('requestfailed', (request) => {
    if (!request.url().includes('/api/state')) problems.push(`requestfailed: ${request.url()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) problems.push(`http ${response.status()}: ${response.url()}`);
  });

  const origin = page.url().split('/').slice(0, 3).join('/');
  const state = async () => (await (await page.request.get(`${origin}/api/state`)).json());
  const post = async (path, body) => {
    const response = await page.request.post(`${origin}${path}`, { data: body });
    const result = await response.json().catch(() => ({}));
    assert(response.ok(), `${path} failed: ${response.status()} ${JSON.stringify(result)}`);
    return result;
  };
  const context = (snapshot, extra = {}) => ({
    source: 'human', expectedDocGeneration: snapshot.docGeneration, ...extra,
  });
  const save = page.getByRole('button', { name: 'Save project' });
  const canvas = page.locator('#painting-canvas');
  const dragRegion = async () => {
    const box = await canvas.boundingBox();
    assert(box, 'painting canvas is mounted for feedback drag');
    await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.45, { steps: 6 });
    await page.mouse.up();
  };

  await page.setViewportSize({ width: 1200, height: 800 });
  await page.waitForSelector('#painting-canvas', { timeout: 15000 });
  assert(await save.count() === 1, 'current SAVE control is mounted');
  await page.waitForFunction(() => document.querySelector('[aria-label="Save project"]')?.disabled === false,
    null, { timeout: 8000 });

  // Real workspace draft: a generation reset removes local feedback controls.
  await page.getByRole('button', { name: 'Feedback' }).click();
  await dragRegion();
  const draft = page.getByRole('textbox', { name: 'Feedback draft' });
  await draft.waitFor({ timeout: 8000 }).catch(() => { throw new Error('feedback draft control did not mount'); });
  await draft.fill('discard this pending draft');
  assert(await draft.inputValue() === 'discard this pending draft', 'feedback control accepts draft text');

  let failedPoll = false;
  let recoveredPoll = false;
  await page.route('**/api/state*', (route) => {
    if (!failedPoll) {
      failedPoll = true;
      return route.abort('failed');
    }
    recoveredPoll = true;
    return route.continue();
  });
  try {
    await page.waitForFunction(() => document.querySelector('[aria-label="Save project"]')?.disabled === true,
      null, { timeout: 8000 }).catch(() => { throw new Error('SAVE did not disable after a failed state poll'); });
    assert(failedPoll, 'a real state poll was interrupted');
    const before = await state();
    await page.waitForTimeout(250);
    const after = await state();
    assert(after.revision === before.revision, 'lost connection does not mutate server state');
    await page.waitForFunction(() => document.querySelector('[aria-label="Save project"]')?.disabled === false,
      null, { timeout: 15000 }).catch(() => { throw new Error('SAVE did not re-enable after recovered state polling'); });
    assert(recoveredPoll, 'subsequent state polling recovered');
  } finally {
    await page.unroute('**/api/state*');
  }

  const rotated = await state();
  const reset = await post('/api/control', context(rotated, { action: 'new' }));
  assert(reset.document.marks.length === 0 && reset.comments.length === 0, 'generation reset clears server state');
  await page.waitForFunction(() => document.querySelector('[aria-label="Feedback draft"]')?.disabled === true,
    null, { timeout: 8000 }).catch(() => { throw new Error('generation reset did not stale the feedback draft'); });
  assert(await draft.inputValue() === 'discard this pending draft', 'stale feedback preserves typed text');
  assert(await page.getByRole('button', { name: 'Send feedback' }).count() === 0,
    'stale feedback does not expose SEND');
  const reselect = page.getByRole('button', { name: 'RESELECT' });
  assert(await reselect.count() === 1 && !(await reselect.isDisabled()),
    'stale feedback exposes enabled RESELECT');
  await page.evaluate(() => document.querySelector('[aria-label="Cancel feedback"]')?.click());
  await page.waitForFunction(() => document.querySelector('[aria-label="Feedback draft"]') === null,
    null, { timeout: 8000 }).catch(() => { throw new Error('cancel did not close stale feedback'); });

  // API fixture plus current comment poll: only an agent may produce ACK.
  const fresh = await state();
  const created = await post('/api/comments', context(fresh, {
    requestId: 'connection-ack-fixture', expectedArtRevision: fresh.artRevision,
    expectedControlEpoch: fresh.controlEpoch, text: 'ack poll fixture', rect: null,
  }));
  const item = created.comments[0];
  const acknowledged = await post('/api/comments/ack', {
    source: 'agent', expectedDocGeneration: fresh.docGeneration,
    expectedSeq: item.seq, id: item.id,
  });
  assert(acknowledged.comments[0].status === 'acknowledged', 'agent ACK updates server status');
  const polled = await page.request.post(`${origin}/api/comments/poll`, { data: { since: null } });
  const pollBody = await polled.json();
  assert(polled.ok() && pollBody.comments[0].status === 'acknowledged', 'comment poll returns truthful ACK');
  await page.waitForFunction(() => document.querySelector('[aria-label="Select comment 1"]') !== null,
    null, { timeout: 8000 }).catch(() => { throw new Error('ACK poll did not mount the current comment control'); });

  assert(problems.length === 0, `no runtime problems: ${JSON.stringify(problems)}`);
  return { success: true, acknowledged: pollBody.comments[0].status, draftCleared: true };
}
