import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startTestStudio, execPaint } from './helpers.mjs';

test('errors: unknown flag rejected before mutation with unchanged revision', async () => {
  const studio = await startTestStudio();
  try {
    const revBefore = studio.session.revision;
    const res = await execPaint(
      ['stroke', '--points', '10,10 20,20', '--unrecognized-flag'],
      { env: { PAINT_URL: studio.url } }
    );
    assert.notEqual(res.code, 0);
    assert.match(res.stderr, /unknown flag "--unrecognized-flag"/);
    assert.equal(studio.session.revision, revBefore);
  } finally {
    await studio.close();
  }
});

test('errors: duplicate flags and boolean flags with values are rejected', async () => {
  const res1 = await execPaint(['stroke', '--points', '10,20', '--paused', '--paused']);
  assert.notEqual(res1.code, 0);
  assert.match(res1.stderr, /duplicate flag "--paused"/);

  const res2 = await execPaint(['stroke', '--points', '10,20', '--paused=false']);
  assert.notEqual(res2.code, 0);
  assert.match(res2.stderr, /flag "--paused" does not accept a value/);

  const res3 = await execPaint(['status', '--json=true']);
  assert.notEqual(res3.code, 0);
  assert.match(res3.stderr, /flag "--json" does not accept a value/);
});

test('errors: extra positional arguments fail centrally before mutation', async () => {
  const studio = await startTestStudio();
  try {
    const r1 = await execPaint(['new', 'typo'], { env: { PAINT_URL: studio.url } });
    assert.notEqual(r1.code, 0);
    assert.match(r1.stderr, /new does not accept positional arguments/);

    const r2 = await execPaint(['stroke', 'stray', '--points', '10,20'], { env: { PAINT_URL: studio.url } });
    assert.notEqual(r2.code, 0);
    assert.match(r2.stderr, /stroke does not accept positional arguments/);

    const r3 = await execPaint(['submit', 'a', 'b'], { env: { PAINT_URL: studio.url } });
    assert.notEqual(r3.code, 0);
    assert.match(r3.stderr, /submit requires exactly one argument/);

    const r4 = await execPaint(['layer', 'update', 'paint', 'junk', '--opacity', '0.5'], { env: { PAINT_URL: studio.url } });
    assert.notEqual(r4.code, 0);
    assert.match(r4.stderr, /layer update requires exactly ID/);

    const r5 = await execPaint(['layer', 'list', '--replace'], { env: { PAINT_URL: studio.url } });
    assert.notEqual(r5.code, 0);
    assert.match(r5.stderr, /unknown flag "--replace" for layer list/);
  } finally {
    await studio.close();
  }
});

test('errors: missing required flags fail with actionable message', async () => {
  const studio = await startTestStudio();
  try {
    const res1 = await execPaint(['stroke'], { env: { PAINT_URL: studio.url } });
    assert.notEqual(res1.code, 0);
    assert.match(res1.stderr, /stroke requires --points/);

    const res2 = await execPaint(['rect', '--x', '10', '--y', '20'], { env: { PAINT_URL: studio.url } });
    assert.notEqual(res2.code, 0);
    assert.match(res2.stderr, /rect requires flag "--width"/);
  } finally {
    await studio.close();
  }
});

test('errors: malformed numbers and colors fail before mutation', async () => {
  const studio = await startTestStudio();
  try {
    const res1 = await execPaint(
      ['rect', '--x', 'abc', '--y', '10', '--width', '50', '--height', '50'],
      { env: { PAINT_URL: studio.url } }
    );
    assert.notEqual(res1.code, 0);
    assert.match(res1.stderr, /x must be a valid finite number/);

    const res2 = await execPaint(
      ['fill', 'not-a-color'],
      { env: { PAINT_URL: studio.url } }
    );
    assert.notEqual(res2.code, 0);
    assert.match(res2.stderr, /color must be #rrggbb/);
  } finally {
    await studio.close();
  }
});

test('errors: structured JSON error on stderr when --json is passed', async () => {
  const studio = await startTestStudio();
  try {
    const res = await execPaint(
      ['stroke', '--bad-flag', '--json'],
      { env: { PAINT_URL: studio.url } }
    );
    assert.notEqual(res.code, 0);
    const parsed = JSON.parse(res.stderr);
    assert.ok(parsed.error);
    assert.match(parsed.message, /unknown flag "--bad-flag"/);
  } finally {
    await studio.close();
  }
});

test('errors: atomic domain validation failure leaves document unchanged', async () => {
  const studio = await startTestStudio();
  try {
    const marksBefore = studio.session.snapshot().document.marks.length;
    const res = await execPaint(
      ['stroke', '--points', '10,10 9999,9999'],
      { env: { PAINT_URL: studio.url } }
    );
    assert.notEqual(res.code, 0);
    assert.equal(studio.session.snapshot().document.marks.length, marksBefore);
  } finally {
    await studio.close();
  }
});

test('errors: FIFO file is rejected immediately without blocking', async () => {
  const fifoPath = join(tmpdir(), `codesketch-fifo-${Date.now()}`);
  try {
    spawnSync('mkfifo', [fifoPath]);
  } catch {
    return;
  }
  if (!existsSync(fifoPath)) return;
  try {
    const res = await execPaint(['submit', fifoPath], { timeoutMs: 2000 });
    assert.notEqual(res.code, 0);
    assert.match(res.stderr, /not a regular file/);
  } finally {
    try { rmSync(fifoPath, { force: true }); } catch {}
  }
});
