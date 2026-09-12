async (page) => {
  const assert = (condition, message) => {
    if (!condition) throw new Error(`finish.mjs failed: ${message}`);
  };
  const origin = page.url().split('/').slice(0, 3).join('/');
  const state = async () => (await (await page.request.get(`${origin}/api/state`)).json());
  const post = async (path, body) => {
    const response = await page.request.post(`${origin}${path}`, { data: body });
    const result = await response.json().catch(() => ({}));
    assert(response.ok(), `${path} failed: ${response.status()} ${JSON.stringify(result)}`);
    return result;
  };
  const context = (snapshot, extra = {}) => ({
    source: 'human',
    expectedDocGeneration: snapshot.docGeneration,
    ...extra,
  });
  const reset = async () => {
    const snapshot = await state();
    await post('/api/control', context(snapshot, { action: 'new' }));
    return state();
  };

  await page.setViewportSize({ width: 1200, height: 800 });
  await page.waitForSelector('#painting-canvas', { timeout: 15000 });
  await reset();

  // API fixture: a human feedback continuation creates the agent grant while
  // keeping the real current workspace on the same document generation.
  let snapshot = await state();
  const comment = await post('/api/comments', {
    ...context(snapshot, {
      requestId: 'finish-fixture-comment',
      expectedArtRevision: snapshot.artRevision,
      expectedControlEpoch: snapshot.controlEpoch,
      text: 'Finish fixture',
      rect: { x: 40, y: 40, width: 120, height: 80 },
      continuePlayback: true,
    }),
  });
  snapshot = await state();
  assert(comment.comments.length === 1 && snapshot.requiresGrant && snapshot.activeGrant,
    'feedback fixture establishes a continuation grant');
  const grant = snapshot.activeGrant;

  const commands = [
    { type: 'stroke', layer: 'paint', color: '#2563EB', size: 8, points: [[80, 120], [180, 180]] },
    { type: 'stroke', layer: 'paint', color: '#2563EB', size: 8, points: [[220, 220], [320, 280]] },
    { type: 'stroke', layer: 'paint', color: '#2563EB', size: 8, points: [[360, 320], [460, 380]] },
  ];
  const agentContext = {
    source: 'agent', expectedDocGeneration: grant.docGeneration,
    epoch: grant.controlEpoch, grantToken: grant.grantToken,
  };
  snapshot = await post('/api/commands', { ...agentContext, commands, play: false });
  assert(snapshot.playback.remaining === 3 && snapshot.document.marks.length === 0,
    'agent fixture queues commands without committing them');

  const finished = await post('/api/control', { ...agentContext, action: 'finish' });
  assert(finished.playback.status === 'paused' && finished.playback.remaining === 0,
    'native finish settles paused with no pending commands');
  assert(finished.document.marks.length === 3 && finished.history.cursor === 3,
    'finish commits every queued command as individual history entries');
  assert(finished.activeGrant?.grantToken === grant.grantToken,
    'valid agent finish preserves the active grant contract');

  const afterFinish = await state();
  assert(afterFinish.document.marks.every((mark) => mark.type === 'stroke'),
    'finished document contains only the fixture stroke commands');

  const stale = await page.request.post(`${origin}/api/control`, {
    data: { ...agentContext, action: 'finish', epoch: grant.controlEpoch - 1 },
  });
  assert(stale.status() === 409, `stale finish grant rejects with 409, got ${stale.status()}`);
  const unchanged = await state();
  assert(unchanged.history.cursor === 3 && unchanged.document.marks.length === 3,
    'rejected stale finish does not mutate artwork');
  return { success: true, marks: unchanged.document.marks.length, remaining: unchanged.playback.remaining };
}
