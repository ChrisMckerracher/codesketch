import { resolve, dirname, join } from 'node:path';
import { mkdirSync, promises as fsPromises, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

export const LIMITS = Object.freeze({
  maxSnapshotBytes: 8 * 1024 * 1024, // 8 MiB
  maxCanvasDimension: 4096,
  maxOutputPixels: 16_000_000, // 16 Megapixels
  maxOutputDimension: 8192,
  maxLayers: 24,
  maxMarks: 3000,
  maxPointsPerStroke: 2000,
  maxTotalPoints: 150000,
  minScale: 0.05,
  maxScale: 16,
});

export function validateSnapshot(snapshot, committed = false) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('Capture requires a valid snapshot or document object');
  }

  const rawJson = JSON.stringify(snapshot);
  const byteLength = Buffer.byteLength(rawJson, 'utf8');
  if (byteLength > LIMITS.maxSnapshotBytes) {
    throw new Error(`Snapshot exceeds 8 MiB budget (${byteLength} bytes)`);
  }

  const doc = snapshot.document && typeof snapshot.document === 'object' && !Array.isArray(snapshot.document)
    ? snapshot.document
    : snapshot;

  if (!Number.isFinite(doc.width) || doc.width <= 0 || !Number.isFinite(doc.height) || doc.height <= 0) {
    throw new Error('Document must have positive finite width and height');
  }
  if (doc.width > LIMITS.maxCanvasDimension || doc.height > LIMITS.maxCanvasDimension) {
    throw new Error(`Source canvas dimensions (${doc.width}x${doc.height}) exceed maximum allowed of ${LIMITS.maxCanvasDimension}`);
  }

  if (!Array.isArray(doc.layers) || !Array.isArray(doc.marks)) {
    throw new Error('Document must have layers and marks arrays');
  }
  if (doc.layers.length > LIMITS.maxLayers) {
    throw new Error(`Layer count (${doc.layers.length}) exceeds maximum limit of ${LIMITS.maxLayers}`);
  }
  if (doc.marks.length > LIMITS.maxMarks) {
    throw new Error(`Mark count (${doc.marks.length}) exceeds maximum limit of ${LIMITS.maxMarks}`);
  }

  let totalPoints = 0;
  for (const mark of doc.marks) {
    if (mark.points && Array.isArray(mark.points)) {
      if (mark.points.length > LIMITS.maxPointsPerStroke) {
        throw new Error(`Stroke points (${mark.points.length}) exceed limit of ${LIMITS.maxPointsPerStroke}`);
      }
      totalPoints += mark.points.length;
    }
  }
  if (totalPoints > LIMITS.maxTotalPoints) {
    throw new Error(`Total stroke points (${totalPoints}) exceed limit of ${LIMITS.maxTotalPoints}`);
  }

  if (typeof doc.background !== 'string' || !doc.background) {
    throw new Error('Document must have a background color string');
  }

  const instanceId = typeof snapshot.instanceId === 'string' ? snapshot.instanceId : null;
  const revision = typeof snapshot.revision === 'number'
    ? snapshot.revision
    : (typeof snapshot.document?.revision === 'number' ? snapshot.document.revision : 0);

  let active = null;
  if (!committed) {
    const rawActive = snapshot.playback?.active ?? snapshot.active ?? null;
    if (rawActive && typeof rawActive === 'object' && rawActive.command) {
      active = {
        command: rawActive.command,
        progress: typeof rawActive.progress === 'number' ? rawActive.progress : 1,
      };
    }
  }

  return { document: doc, instanceId, revision, active };
}

export function validateOptions(options = {}, doc) {
  const { crop = null, scale = 1, committed = false, browser, timeoutMs = 15000, output } = options;

  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('timeoutMs must be a positive finite number');
  }

  if (typeof scale !== 'number' || !Number.isFinite(scale) || scale < LIMITS.minScale || scale > LIMITS.maxScale) {
    throw new Error(`scale must be a finite positive number between ${LIMITS.minScale} and ${LIMITS.maxScale}`);
  }

  let validatedCrop = null;
  if (crop !== null && crop !== undefined) {
    if (typeof crop !== 'object' || Array.isArray(crop)) {
      throw new Error('crop must be an object with {x, y, width, height}');
    }
    const { x, y, width, height } = crop;
    if (![x, y, width, height].every(n => typeof n === 'number' && Number.isFinite(n))) {
      throw new Error('crop coordinates must be finite numbers');
    }
    if (width <= 0 || height <= 0) {
      throw new Error('crop width and height must be positive numbers');
    }
    if (x < 0 || y < 0 || x + width > doc.width || y + height > doc.height) {
      throw new Error('crop rectangle exceeds canvas boundaries');
    }
    validatedCrop = { x, y, width, height };
  }

  const baseW = validatedCrop ? validatedCrop.width : doc.width;
  const baseH = validatedCrop ? validatedCrop.height : doc.height;
  const outW = Math.max(1, Math.round(baseW * scale));
  const outH = Math.max(1, Math.round(baseH * scale));

  if (outW > LIMITS.maxOutputDimension || outH > LIMITS.maxOutputDimension || (outW * outH) > LIMITS.maxOutputPixels) {
    throw new Error(
      `Output dimensions (${outW}x${outH}, ${outW * outH} pixels) exceed maximum limit of ${LIMITS.maxOutputPixels} pixels / ${LIMITS.maxOutputDimension}px`
    );
  }

  if (output !== undefined && (typeof output !== 'string' || !output.trim())) {
    throw new Error('output must be a non-empty string path if provided');
  }

  return {
    crop: validatedCrop,
    scale,
    committed: Boolean(committed),
    browser,
    timeoutMs,
    output,
    expectedWidth: outW,
    expectedHeight: outH,
  };
}

export async function writePngAtomically(buffer, outputPath, signal = null) {
  signal?.throwIfAborted();
  const targetPath = outputPath
    ? resolve(process.cwd(), outputPath)
    : join(tmpdir(), `codesketch-${Date.now()}-${randomUUID().slice(0, 8)}.png`);

  mkdirSync(dirname(targetPath), { recursive: true });
  const tmpPath = `${targetPath}.tmp-${randomUUID()}`;

  try {
    await fsPromises.writeFile(tmpPath, buffer, { signal: signal ?? undefined });
    signal?.throwIfAborted();
    await fsPromises.rename(tmpPath, targetPath);
    return targetPath;
  } catch (err) {
    try { rmSync(tmpPath, { force: true }); } catch {}
    throw err;
  }
}
