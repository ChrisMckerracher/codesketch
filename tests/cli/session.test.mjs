import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { startTestStudio, execPaint } from './helpers.mjs';

test('status: compact summary vs raw JSON snapshot', async () => {
  const studio = await startTestStudio();
  try {
    const compact = await execPaint(['status'], { env: { PAINT_URL: studio.url } });
    assert.equal(compact.code, 0);
    assert.match(compact.stdout, /Instance: [a-f0-9-]+/);
    assert.match(compact.stdout, /Playback: idle/);
    assert.match(compact.stdout, /History:\s+cursor 0 \/ 0 marks/);

    const raw = await execPaint(['status', '--json'], { env: { PAINT_URL: studio.url } });
    assert.equal(raw.code, 0);
    const snap = JSON.parse(raw.stdout);
    assert.equal(snap.instanceId, studio.session.instanceId);
    assert.equal(snap.revision, studio.session.revision);
    assert.ok(snap.document);
  } finally {
    await studio.close();
  }
});

test('playback controls: pause, resume, step, clear, speed', async () => {
  const studio = await startTestStudio();
  try {
    await execPaint(['stroke', '--points', '10,10 50,50', '--paused'], { env: { PAINT_URL: studio.url } });
    assert.equal(studio.session.snapshot().playback.status, 'paused');

    const stepRes = await execPaint(['step'], { env: { PAINT_URL: studio.url } });
    assert.equal(stepRes.code, 0);
    assert.match(stepRes.stdout, /Stepped 1 command/);
    assert.equal(studio.session.snapshot().history.cursor, 1);

    const speedRes = await execPaint(['speed', '2.5'], { env: { PAINT_URL: studio.url } });
    assert.equal(speedRes.code, 0);
    assert.match(speedRes.stdout, /Playback speed set to 2\.5x/);
    assert.equal(studio.session.snapshot().playback.speed, 2.5);

    const clearRes = await execPaint(['clear'], { env: { PAINT_URL: studio.url } });
    assert.equal(clearRes.code, 0);
    assert.match(clearRes.stdout, /Cleared pending queue/);
  } finally {
    await studio.close();
  }
});

test('feedback: adds note and pauses; lists notes when called without text', async () => {
  const studio = await startTestStudio();
  try {
    const fbRes = await execPaint(['feedback', 'Darken the contours'], { env: { PAINT_URL: studio.url } });
    assert.equal(fbRes.code, 0);
    assert.match(fbRes.stdout, /Feedback recorded \(playback paused/);
    assert.equal(studio.session.snapshot().playback.status, 'paused');
    assert.equal(studio.session.snapshot().feedback.length, 1);

    const listRes = await execPaint(['feedback'], { env: { PAINT_URL: studio.url } });
    assert.equal(listRes.code, 0);
    assert.match(listRes.stdout, /Feedback notes \(1\):/);
    assert.match(listRes.stdout, /Darken the contours/);

    const listJson = await execPaint(['feedback', '--json'], { env: { PAINT_URL: studio.url } });
    assert.equal(listJson.code, 0);
    const notes = JSON.parse(listJson.stdout);
    assert.equal(notes.length, 1);
    assert.equal(notes[0].text, 'Darken the contours');
  } finally {
    await studio.close();
  }
});

test('wait: returns promptly when idle or paused', async () => {
  const studio = await startTestStudio();
  try {
    const start = Date.now();
    const res = await execPaint(['wait', '--timeout', '5'], { env: { PAINT_URL: studio.url } });
    const elapsed = Date.now() - start;
    assert.equal(res.code, 0);
    assert.ok(elapsed < 1000, `wait should return promptly when idle (took ${elapsed}ms)`);
    assert.match(res.stdout, /Playback: idle/);
  } finally {
    await studio.close();
  }
});

test('wait: times out with WAIT_TIMEOUT when playback stays active', async () => {
  const studio = await startTestStudio();
  try {
    studio.session.status = 'playing';
    studio.session.queue = [{ type: 'stroke', layer: 'paint', points: [[0, 0], [900, 700]] }];
    studio.session.speed = 0.25;

    const res = await execPaint(['wait', '--timeout', '0.2'], { env: { PAINT_URL: studio.url } });
    assert.notEqual(res.code, 0);
    assert.match(res.stderr, /WAIT_TIMEOUT/);
  } finally {
    await studio.close();
  }
});

test('wait: remaining overall deadline is enforced against a hanging server', async () => {
  const hangingServer = createServer(() => {
    // Intentionally never respond
  });
  await new Promise((r) => hangingServer.listen(0, '127.0.0.1', r));
  const port = hangingServer.address().port;

  try {
    const start = Date.now();
    const res = await execPaint(['wait', '--timeout', '0.3'], {
      env: { PAINT_URL: `http://127.0.0.1:${port}` },
    });
    const elapsed = Date.now() - start;
    assert.notEqual(res.code, 0);
    assert.match(res.stderr, /WAIT_TIMEOUT/);
    assert.ok(elapsed < 2000, `wait must abort promptly according to remaining deadline, took ${elapsed}ms`);
  } finally {
    hangingServer.closeAllConnections();
    await new Promise((r) => hangingServer.close(r));
  }
});

test('watch: streams compact JSON events without document marks array', async () => {
  const studio = await startTestStudio();
  try {
    const res = await execPaint(
      ['watch', '--timeout', '0.3', '--interval', '50', '--json'],
      { env: { PAINT_URL: studio.url } }
    );
    assert.equal(res.code, 0);
    const lines = res.stdout.trim().split('\n').filter(Boolean);
    assert.ok(lines.length >= 1, 'watch should emit at least the initial event');
    const firstEvent = JSON.parse(lines[0]);
    assert.equal(firstEvent.event, 'initial');
    assert.ok(firstEvent.instanceId);
    assert.equal(typeof firstEvent.revision, 'number');
    assert.ok(firstEvent.playback);
    assert.ok(firstEvent.history);
    assert.equal(firstEvent.document, undefined, 'compact watch event must not contain full document marks');
  } finally {
    await studio.close();
  }
});
