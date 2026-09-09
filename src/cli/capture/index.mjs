import { validateSnapshot, validateOptions, writePngAtomically } from './validate.mjs';
import { findBrowser, createProfileDir, cleanupProfile, launchBrowser, terminateBrowser, getPageWebSocketUrl } from './browser.mjs';
import { startCaptureServer } from './server.mjs';
import { evaluateCapture } from './cdp.mjs';

export async function capture(snapshot, options = {}) {
  const { document, instanceId, revision, active } = validateSnapshot(snapshot, options.committed);
  const validated = validateOptions(options, document);
  const browserPath = findBrowser(validated.browser);

  const controller = new AbortController();
  const { signal } = controller;

  let server = null;
  let child = null;
  let profileDir = null;
  let timeoutTimer = null;
  let cleanupPromise = null;

  const onSigInt = () => {
    controller.abort(new Error('Capture cancelled due to SIGINT'));
  };
  const onSigTerm = () => {
    controller.abort(new Error('Capture cancelled due to SIGTERM'));
  };

  process.on('SIGINT', onSigInt);
  process.on('SIGTERM', onSigTerm);

  timeoutTimer = setTimeout(() => {
    controller.abort(new Error(`Capture timed out after ${validated.timeoutMs}ms`));
  }, validated.timeoutMs);

  const cleanup = async () => {
    if (cleanupPromise) return cleanupPromise;
    cleanupPromise = (async () => {
      clearTimeout(timeoutTimer);
      process.off('SIGINT', onSigInt);
      process.off('SIGTERM', onSigTerm);

      if (child) {
        await terminateBrowser(child, 1000);
      }
      if (profileDir) {
        cleanupProfile(profileDir);
      }
      if (server) {
        try { await server.close(); } catch {}
      }
    })();
    return cleanupPromise;
  };

  try {
    signal.throwIfAborted();

    server = await startCaptureServer({
      document,
      active,
      crop: validated.crop,
      scale: validated.scale,
    });

    signal.throwIfAborted();
    profileDir = createProfileDir();

    signal.throwIfAborted();
    child = launchBrowser(browserPath, profileDir, server.url);

    const pageWsUrl = await getPageWebSocketUrl(child, profileDir, validated.timeoutMs, signal);
    signal.throwIfAborted();

    const { buffer, width, height } = await evaluateCapture(pageWsUrl, validated.timeoutMs, signal, server.url);

    signal.throwIfAborted();
    const writtenPath = await writePngAtomically(buffer, validated.output, signal);

    return {
      path: writtenPath,
      mimeType: 'image/png',
      width,
      height,
      instanceId,
      revision,
    };
  } catch (err) {
    if (signal.aborted) {
      throw signal.reason || err;
    }
    throw err;
  } finally {
    await cleanup();
  }
}
