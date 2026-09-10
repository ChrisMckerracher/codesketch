let completed = false;
async function reportError(error) {
  if (completed) return;
  completed = true;
  const message = String(error?.message || error || 'Capture failed').slice(0, 2000);
  try { await fetch('error', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: message }); } catch {}
}
globalThis.addEventListener('error', event => reportError(event.error || event.message));
globalThis.addEventListener('unhandledrejection', event => reportError(event.reason));

try {
  const { createRenderer } = await import('./rendering/index.mjs');
  const response = await fetch('snapshot.json');
  if (!response.ok) throw new Error(`Snapshot failed: ${response.status}`);
  const { document: doc, active, crop, width, height } = await response.json();
  const canvas = document.getElementById('canvas');
  createRenderer(canvas)(doc, active);
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const context = output.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(canvas, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
  const blob = await new Promise((resolve, reject) => output.toBlob(value => {
    if (value) resolve(value); else reject(new Error('PNG encoding failed'));
  }, 'image/png'));
  if (!completed) {
    const result = await fetch('result', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
    if (!result.ok) throw new Error(`PNG callback failed: ${result.status}`);
    completed = true;
  }
} catch (error) { await reportError(error); }
