import test from 'node:test';
import assert from 'node:assert/strict';
import { execPaint } from './helpers.mjs';

test('offline help: no arguments prints help and mentions guide', async () => {
  const res = await execPaint([], { env: { PAINT_URL: 'http://127.0.0.1:9999' } });
  assert.equal(res.code, 0);
  assert.match(res.stdout, /paint - Codesketch agent CLI/);
  assert.match(res.stdout, /guide\s+Print complete practical painting workflow/);
  assert.equal(res.stderr, '');
});

test('offline help: help command and --help flag', async () => {
  const res1 = await execPaint(['help'], { env: { PAINT_URL: 'http://127.0.0.1:9999' } });
  assert.equal(res1.code, 0);
  assert.match(res1.stdout, /Usage: node tools\/paint\.mjs/);

  const res2 = await execPaint(['--help'], { env: { PAINT_URL: 'http://127.0.0.1:9999' } });
  assert.equal(res2.code, 0);
  assert.match(res2.stdout, /Usage: node tools\/paint\.mjs/);
});

test('offline help: command-specific help via help COMMAND and COMMAND --help', async () => {
  const res1 = await execPaint(['help', 'stroke']);
  assert.equal(res1.code, 0);
  assert.match(res1.stdout, /stroke --points "x,y x,y\.\.\."/);

  const res2 = await execPaint(['stroke', '--help']);
  assert.equal(res2.code, 0);
  assert.match(res2.stdout, /stroke --points "x,y x,y\.\.\."/);

  const res3 = await execPaint(['help', 'rect']);
  assert.equal(res3.code, 0);
  assert.match(res3.stdout, /rect --x X --y Y --width W --height H/);

  const res4 = await execPaint(['view', '--help']);
  assert.equal(res4.code, 0);
  assert.match(res4.stdout, /view \[FILE\]/);
});

test('offline guide: prints complete painting workflow without server', async () => {
  const res = await execPaint(['guide'], { env: { PAINT_URL: 'http://127.0.0.1:9999' } });
  assert.equal(res.code, 0);
  assert.match(res.stdout, /# Codesketch Agent Painting Guide/);
  assert.match(res.stdout, /1000 × 700 coordinate space/);
  assert.match(res.stdout, /Collaborative Observation & Feedback Loop/);
  assert.equal(res.stderr, '');
});

test('offline help: guide --help prints guide usage and exits 0', async () => {
  const res = await execPaint(['guide', '--help'], { env: { PAINT_URL: 'http://127.0.0.1:9999' } });
  assert.equal(res.code, 0);
  assert.match(res.stdout, /Usage: node tools\/paint\.mjs guide/);
  assert.equal(res.stderr, '');
});

test('offline help: help nonexistent rejects with actionable unknown command error', async () => {
  const res = await execPaint(['help', 'nonexistent'], { env: { PAINT_URL: 'http://127.0.0.1:9999' } });
  assert.notEqual(res.code, 0);
  assert.match(res.stderr, /unknown command "nonexistent"/);
});

test('loopback security: rejects non-loopback PAINT_URL', async () => {
  const res = await execPaint(['status'], { env: { PAINT_URL: 'http://example.com:4317' } });
  assert.notEqual(res.code, 0);
  assert.match(res.stderr, /PAINT_URL must target a loopback address/);
});
