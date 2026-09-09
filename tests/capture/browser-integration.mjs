// Real-browser integration check: validates actual PNG pixels, layers, eraser, crop, and cleanup.
import assert from 'node:assert/strict';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { capture } from '../../src/cli/capture/index.mjs';
import { runReadinessBrowserCheck } from './browser-readiness.mjs';

export function parsePngRgba(buffer) {
  assert.ok(buffer.length >= 24, 'PNG buffer is too small');
  const magic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.ok(buffer.subarray(0, 8).equals(magic), 'Invalid PNG signature');

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  let offset = 8;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idatChunks.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }

  const decompressed = inflateSync(Buffer.concat(idatChunks));
  const bpp = 4;
  const stride = 1 + width * bpp;
  const raw = Buffer.alloc(width * height * bpp);

  for (let y = 0; y < height; y++) {
    const filter = decompressed[y * stride];
    const prev = y > 0 ? raw.subarray((y - 1) * width * bpp, y * width * bpp) : null;
    const curr = raw.subarray(y * width * bpp, (y + 1) * width * bpp);
    const src = decompressed.subarray(y * stride + 1, (y + 1) * stride);

    for (let i = 0; i < width * bpp; i++) {
      const a = i >= bpp ? curr[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= bpp ? prev[i - bpp] : 0;
      let val = src[i];
      if (filter === 1) val = (val + a) & 0xff;
      else if (filter === 2) val = (val + b) & 0xff;
      else if (filter === 3) val = (val + Math.floor((a + b) / 2)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        val = (val + pr) & 0xff;
      }
      curr[i] = val;
    }
  }

  return {
    width,
    height,
    pixel(x, y) {
      assert.ok(x >= 0 && x < width && y >= 0 && y < height, `Pixel out of bounds: (${x}, ${y})`);
      const idx = (y * width + x) * bpp;
      return [raw[idx], raw[idx + 1], raw[idx + 2], raw[idx + 3]];
    },
  };
}

export async function runBrowserIntegrationCheck() {
  console.log('Running Codesketch real-browser capture check...');
  await runReadinessBrowserCheck(parsePngRgba);

  const testSnapshot = {
    instanceId: 'check-' + randomUUID().slice(0, 8),
    revision: 10,
    document: {
      version: 1,
      width: 400,
      height: 300,
      background: '#ffffff',
      layers: [
        { id: 'base', name: 'Base Layer', visible: true, opacity: 1 },
        { id: 'hidden', name: 'Hidden Layer', visible: false, opacity: 1 },
        { id: 'overlay', name: 'Overlay Layer', visible: true, opacity: 1 },
      ],
      marks: [
        { type: 'rect', layer: 'base', x: 20, y: 20, width: 120, height: 120, color: '#0000ff', opacity: 1 },
        { type: 'rect', layer: 'hidden', x: 20, y: 20, width: 120, height: 120, color: '#ff0000', opacity: 1 },
        { type: 'rect', layer: 'overlay', x: 60, y: 60, width: 120, height: 120, color: '#00ff00', opacity: 1 },
        { type: 'stroke', layer: 'overlay', brush: 'eraser', size: 24, color: '#000000', opacity: 1, points: [[80, 80]] },
      ],
    },
    playback: {
      active: {
        command: {
          type: 'stroke',
          layer: 'overlay',
          brush: 'brush',
          size: 8,
          color: '#ff8800',
          opacity: 1,
          points: [[220, 40], [360, 40]],
        },
        progress: 0.5,
      },
    },
  };

  const tempFiles = [];

  try {
    // 1. View capture (committed: false)
    console.log('1. Testing view capture (active partial stroke + layer visibility + eraser)...');
    const viewOutput = join(tmpdir(), `check-view-${Date.now()}-${randomUUID().slice(0, 6)}.png`);
    tempFiles.push(viewOutput);

    const viewRes = await capture(testSnapshot, { output: viewOutput, committed: false });
    assert.equal(viewRes.width, 400);
    assert.equal(viewRes.height, 300);
    assert.equal(viewRes.mimeType, 'image/png');
    assert.equal(viewRes.instanceId, testSnapshot.instanceId);
    assert.equal(viewRes.revision, 10);

    const viewImg = parsePngRgba(readFileSync(viewRes.path));

    // Base blue pixel visible outside overlay
    const basePx = viewImg.pixel(30, 30);
    assert.deepEqual(basePx, [0, 0, 255, 255], 'Base layer must be visible as pure blue');

    // Hidden layer red pixel must NOT be rendered
    assert.notEqual(basePx[0], 255, 'Hidden red layer must not be visible');

    // Overlay green pixel visible where not erased
    const overlayPx = viewImg.pixel(140, 140);
    assert.deepEqual(overlayPx, [0, 255, 0, 255], 'Overlay green rect must be visible');

    // Erased region on overlay reveals underlying blue base layer
    const erasedPx = viewImg.pixel(80, 80);
    assert.deepEqual(erasedPx, [0, 0, 255, 255], 'Eraser on overlay must reveal blue base layer');

    // Active partial stroke (orange at halfway point)
    const activeDrawnPx = viewImg.pixel(250, 40);
    assert.ok(
      activeDrawnPx[0] > 200 && activeDrawnPx[1] > 100 && activeDrawnPx[2] < 150,
      'Active stroke first half must be rendered orange'
    );

    // Active partial stroke beyond progress 0.5 must NOT be drawn (canvas white)
    const activeUndrawnPx = viewImg.pixel(340, 40);
    assert.deepEqual(activeUndrawnPx, [255, 255, 255, 255],
      'Active stroke second half beyond progress 0.5 must remain white canvas');

    console.log('   ✓ Layer visibility, eraser, and active partial stroke verified via actual pixels.');

    // 2. Export capture (committed: true)
    console.log('2. Testing committed export capture (committed-only artwork)...');
    const exportOutput = join(tmpdir(), `check-export-${Date.now()}-${randomUUID().slice(0, 6)}.png`);
    tempFiles.push(exportOutput);

    const exportRes = await capture(testSnapshot, { output: exportOutput, committed: true });
    const exportImg = parsePngRgba(readFileSync(exportRes.path));

    // In export, the active partial stroke is completely omitted
    const exportStrokeAreaPx = exportImg.pixel(250, 40);
    assert.deepEqual(exportStrokeAreaPx, [255, 255, 255, 255],
      'Committed export must omit active partial stroke entirely');
    console.log('   ✓ Committed export excludes uncommitted active marks via actual pixels.');

    // 3. Crop and scale
    console.log('3. Testing crop and scale capture dimensions and pixels...');
    const cropOutput = join(tmpdir(), `check-crop-${Date.now()}-${randomUUID().slice(0, 6)}.png`);
    tempFiles.push(cropOutput);

    const cropRes = await capture(testSnapshot, {
      output: cropOutput,
      crop: { x: 20, y: 20, width: 100, height: 100 },
      scale: 1.5,
    });

    assert.equal(cropRes.width, 150, '100px cropped width at 1.5x scale must equal 150px');
    assert.equal(cropRes.height, 150, '100px cropped height at 1.5x scale must equal 150px');

    const cropImg = parsePngRgba(readFileSync(cropRes.path));
    assert.equal(cropImg.width, 150);
    assert.equal(cropImg.height, 150);

    const cropBluePx = cropImg.pixel(10, 10);
    assert.deepEqual(cropBluePx, [0, 0, 255, 255], 'Cropped image pixel must match base blue');
    console.log('   ✓ Crop and scale dimensions (150x150) and pixel mapping verified.');

    console.log('\nAll capture checks passed successfully.');
    return true;
  } finally {
    for (const f of tempFiles) {
      try { rmSync(f, { force: true }); } catch {}
    }
  }
}
