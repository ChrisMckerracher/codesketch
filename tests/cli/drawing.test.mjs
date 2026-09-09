import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startTestStudio, execPaint } from './helpers.mjs';

test('direct stroke queues mark and prints concise ack with playback and remaining', async () => {
  const studio = await startTestStudio();
  try {
    const res = await execPaint(
      ['stroke', '--points', '10,20 30,40', '--brush', 'pencil', '--color', '#123456', '--size', '4'],
      { env: { PAINT_URL: studio.url } }
    );
    assert.equal(res.code, 0);
    assert.match(res.stdout, /Queued stroke \(2 points on "paint"\) - playback: (playing|idle), \d+ remaining \(revision \d+\)/);
    const project = studio.session.project();
    const all = [...project.commands, ...project.queue];
    const strokes = all.filter(c => c.type === 'stroke');
    assert.equal(strokes.length, 1);
    assert.deepEqual(strokes[0].points, [[10, 20], [30, 40]]);
    assert.equal(strokes[0].brush, 'pencil');
    assert.equal(strokes[0].color, '#123456');
    assert.equal(strokes[0].size, 4);
  } finally {
    await studio.close();
  }
});

test('drawing shapes: rect, ellipse, fill report queued mutation', async () => {
  const studio = await startTestStudio();
  try {
    const r1 = await execPaint(
      ['fill', '#ffffff'],
      { env: { PAINT_URL: studio.url } }
    );
    assert.equal(r1.code, 0);
    assert.match(r1.stdout, /Queued fill to #ffffff - playback: (playing|idle), \d+ remaining/);

    const r2 = await execPaint(
      ['rect', '--x', '50', '--y', '60', '--width', '120', '--height', '80', '--color', '#224466'],
      { env: { PAINT_URL: studio.url } }
    );
    assert.equal(r2.code, 0);
    assert.match(r2.stdout, /Queued rect \(50,60 120x80 on "paint"\) - playback: (playing|idle), \d+ remaining/);

    const r3 = await execPaint(
      ['ellipse', '--x', '200', '--y', '150', '--width', '80', '--height', '80', '--opacity', '0.8'],
      { env: { PAINT_URL: studio.url } }
    );
    assert.equal(r3.code, 0);
    assert.match(r3.stdout, /Queued ellipse \(200,150 80x80 on "paint"\) - playback: (playing|idle), \d+ remaining/);

    const project = studio.session.project();
    const all = [...project.commands, ...project.queue];

    const fillCmd = all.find(c => c.type === 'fill');
    assert.ok(fillCmd);
    assert.equal(fillCmd.color, '#ffffff');

    const rectCmd = all.find(c => c.type === 'rect');
    assert.ok(rectCmd);
    assert.equal(rectCmd.x, 50);
    assert.equal(rectCmd.y, 60);
    assert.equal(rectCmd.width, 120);
    assert.equal(rectCmd.height, 80);
    assert.equal(rectCmd.color, '#224466');

    const ellipseCmd = all.find(c => c.type === 'ellipse');
    assert.ok(ellipseCmd);
    assert.equal(ellipseCmd.x, 200);
    assert.equal(ellipseCmd.y, 150);
    assert.equal(ellipseCmd.width, 80);
    assert.equal(ellipseCmd.height, 80);
    assert.equal(ellipseCmd.opacity, 0.8);
  } finally {
    await studio.close();
  }
});

test('layer management: list, add, update', async () => {
  const studio = await startTestStudio();
  try {
    const list1 = await execPaint(['layer', 'list'], { env: { PAINT_URL: studio.url } });
    assert.equal(list1.code, 0);
    assert.match(list1.stdout, /paint: "Painting" \(visible, opacity: 1\)/);

    const listJson = await execPaint(['layer', 'list', '--json'], { env: { PAINT_URL: studio.url } });
    assert.equal(listJson.code, 0);
    const layers = JSON.parse(listJson.stdout);
    assert.equal(layers.length, 1);
    assert.equal(layers[0].id, 'paint');

    const addRes = await execPaint(['layer', 'add', 'clouds', 'Clouds Layer'], { env: { PAINT_URL: studio.url } });
    assert.equal(addRes.code, 0);
    assert.match(addRes.stdout, /Queued layer add "clouds" \("Clouds Layer"\)/);

    const updateRes = await execPaint(
      ['layer', 'update', 'clouds', '--opacity', '0.7', '--visible', 'false'],
      { env: { PAINT_URL: studio.url } }
    );
    assert.equal(updateRes.code, 0);
    assert.match(updateRes.stdout, /Queued layer update "clouds"/);

    await execPaint(['wait', '--timeout', '5'], { env: { PAINT_URL: studio.url } });

    const list2 = await execPaint(['layer', 'list'], { env: { PAINT_URL: studio.url } });
    assert.match(list2.stdout, /clouds: "Clouds Layer" \(hidden, opacity: 0.7\)/);
  } finally {
    await studio.close();
  }
});

test('drawing flags: --paused reports paused acknowledgment', async () => {
  const studio = await startTestStudio();
  try {
    const r1 = await execPaint(
      ['stroke', '--points', '10,10 20,20', '--paused'],
      { env: { PAINT_URL: studio.url } }
    );
    assert.equal(r1.code, 0);
    assert.match(r1.stdout, /playback: paused, 1 remaining/);
    assert.equal(studio.session.snapshot().playback.status, 'paused');

    const r2 = await execPaint(
      ['rect', '--x', '0', '--y', '0', '--width', '10', '--height', '10', '--replace', '--paused'],
      { env: { PAINT_URL: studio.url } }
    );
    assert.equal(r2.code, 0);
    assert.match(r2.stdout, /playback: paused, 1 remaining/);
    assert.equal(studio.session.snapshot().playback.remaining, 1);

    const r3 = await execPaint(
      ['stroke', '--points', '5,5 15,15', '--json'],
      { env: { PAINT_URL: studio.url } }
    );
    assert.equal(r3.code, 0);
    const parsed = JSON.parse(r3.stdout);
    assert.ok(parsed.instanceId);
    assert.ok(parsed.revision);
    assert.ok(parsed.document);
  } finally {
    await studio.close();
  }
});

test('batch submit via file and bounded stdin pipe', async () => {
  const studio = await startTestStudio();
  const tmpFile = join(tmpdir(), `codesketch-batch-${Date.now()}.json`);
  const batch = [
    { type: 'stroke', layer: 'paint', points: [[1, 1], [10, 10]], color: '#111111' },
    { type: 'stroke', layer: 'paint', points: [[20, 20], [30, 30]], color: '#222222' },
  ];
  writeFileSync(tmpFile, JSON.stringify(batch), 'utf8');

  try {
    const fileRes = await execPaint(['submit', tmpFile], { env: { PAINT_URL: studio.url } });
    assert.equal(fileRes.code, 0);
    assert.match(fileRes.stdout, /Queued 2 command\(s\) - playback: (playing|idle)/);

    const stdinRes = await execPaint(['submit', '-'], {
      env: { PAINT_URL: studio.url },
      stdin: JSON.stringify([{ type: 'fill', color: '#123456' }]),
    });
    assert.equal(stdinRes.code, 0);
    assert.match(stdinRes.stdout, /Queued 1 command\(s\)/);
  } finally {
    try { unlinkSync(tmpFile); } catch {}
    await studio.close();
  }
});
