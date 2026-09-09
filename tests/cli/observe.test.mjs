import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startTestStudio, execPaint } from './helpers.mjs';

const browserSkip = !process.env.CODESKETCH_BROWSER_TESTS ? 'Requires CODESKETCH_BROWSER_TESTS=1' : false;

test('view: captures live canvas snapshot with playback metadata', { skip: browserSkip }, async () => {
  const studio = await startTestStudio();
  try {
    const res = await execPaint(['view'], { env: { PAINT_URL: studio.url } });
    assert.equal(res.code, 0, `view failed: ${res.stderr}`);
    assert.match(res.stdout, /Captured view: .* \(/);
    assert.match(res.stdout, /image\/png, 1000x700, revision 0/);
    assert.match(res.stdout, /playback: idle/);

    const jsonRes = await execPaint(['view', '--json'], { env: { PAINT_URL: studio.url } });
    assert.equal(jsonRes.code, 0, `view --json failed: ${jsonRes.stderr}`);
    const parsed = JSON.parse(jsonRes.stdout);
    assert.equal(parsed.mimeType, 'image/png');
    assert.equal(parsed.width, 1000);
    assert.equal(parsed.height, 700);
    assert.equal(parsed.playback, 'idle');
    assert.ok(existsSync(parsed.path));
    try { unlinkSync(parsed.path); } catch {}
  } finally {
    await studio.close();
  }
});

test('view: supports --crop and --scale detail inspection', { skip: browserSkip }, async () => {
  const studio = await startTestStudio();
  try {
    const res = await execPaint(
      ['view', '--crop', '50,50,100,80', '--scale', '2', '--json'],
      { env: { PAINT_URL: studio.url } }
    );
    assert.equal(res.code, 0, `view crop failed: ${res.stderr}`);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.width, 200);
    assert.equal(parsed.height, 160);
    try { unlinkSync(parsed.path); } catch {}
  } finally {
    await studio.close();
  }
});

test('export: requires file argument', async () => {
  const studio = await startTestStudio();
  try {
    const errRes = await execPaint(['export'], { env: { PAINT_URL: studio.url } });
    assert.notEqual(errRes.code, 0);
    assert.match(errRes.stderr, /export requires FILE/);
  } finally {
    await studio.close();
  }
});

test('export: exports committed artwork', { skip: browserSkip }, async () => {
  const studio = await startTestStudio();
  const outPath = join(tmpdir(), `codesketch-export-${Date.now()}.png`);
  try {
    const res = await execPaint(['export', outPath], { env: { PAINT_URL: studio.url } });
    assert.equal(res.code, 0, `export failed: ${res.stderr}`);
    assert.match(res.stdout, /Exported artwork:/);
    assert.ok(existsSync(outPath));
  } finally {
    try { unlinkSync(outPath); } catch {}
    await studio.close();
  }
});

test('observe error: handles missing browser executable with actionable error', async () => {
  const studio = await startTestStudio();
  try {
    const res = await execPaint(['view'], {
      env: {
        PAINT_URL: studio.url,
        PAINT_BROWSER: '/nonexistent/browser/path',
      },
    });
    assert.notEqual(res.code, 0);
    assert.match(res.stderr, /PAINT_BROWSER executable not found/);
  } finally {
    await studio.close();
  }
});
