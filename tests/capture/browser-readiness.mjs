import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, rmSync } from 'node:fs';
import { capture } from '../../src/cli/capture/index.mjs';
import { startCaptureServer } from '../../src/cli/capture/server.mjs';
import { evaluateCapture } from '../../src/cli/capture/cdp.mjs';
import {
  findBrowser, createProfileDir, cleanupProfile, launchBrowser,
  terminateBrowser, getPageWebSocketUrl,
} from '../../src/cli/capture/browser.mjs';

const snapshot = {
  instanceId: 'immutable-readiness-fixture', revision: 7,
  document: {
    version: 1, width: 32, height: 24, background: '#ffffff',
    layers: [{ id: 'paint', name: 'Paint', visible: true, opacity: 1 }], marks: [],
  },
};

async function runNavigationCheck(parsePng, firstCondition) {
  const source = await startCaptureServer({ document: snapshot.document, active: null, crop: null, scale: 1 });
  let heldSnapshot;
  let navigationSent = false;
  let contextError = false;
  let initialProbeId;
  let wrongDocumentRejected = false;
  let requests = 0;
  let profile;
  let child;
  let captureSocket;
  let pendingEvaluation = null;
  let deferredCondition;
  const observedConditions = [];
  const outstandingEvaluations = new Set();
  let intendedUrl;
  const NativeWebSocket = globalThis.WebSocket;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Readiness fixture deadline')), 10000);
  function maybeNavigate() {
    if (!heldSnapshot || pendingEvaluation === null || navigationSent || controller.signal.aborted) return;
    if (!outstandingEvaluations.has(pendingEvaluation)) return;
    navigationSent = true;
    try {
      NativeWebSocket.prototype.send.call(captureSocket,
        JSON.stringify({ id: 100001, method: 'Page.navigate', params: { url: intendedUrl } }));
    } catch (error) { controller.abort(error); }
  }
  // Exercise both callback orderings explicitly, without time-based scheduling.
  function observeCondition(name, accept) {
    if (!observedConditions.length && name !== firstCondition) {
      deferredCondition = () => observeCondition(name, accept);
      return;
    }
    observedConditions.push(name);
    accept();
    maybeNavigate();
    const deferred = deferredCondition;
    deferredCondition = null;
    deferred?.();
  }
  // Holding the first immutable snapshot keeps the render promise pending.
  // Navigating after its evaluation begins deterministically replaces that context.
  const proxy = createServer(async (req, res) => {
    if (req.url === '/snapshot.json' && ++requests === 1) {
      observeCondition('snapshot', () => { heldSnapshot = res; });
      return;
    }
    try {
      const upstream = await fetch(new URL(req.url, source.url), { signal: controller.signal });
      res.writeHead(upstream.status, Object.fromEntries(upstream.headers));
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) { res.destroy(error); }
  });

  try {
    await new Promise((resolve, reject) => {
      proxy.once('error', reject);
      proxy.listen(0, '127.0.0.1', resolve);
    });
    intendedUrl = 'http://127.0.0.1:' + proxy.address().port + '/capture.html';
    profile = createProfileDir();
    child = launchBrowser(findBrowser(), profile, 'about:blank');
    const wsUrl = await getPageWebSocketUrl(child, profile, 10000, controller.signal);
    globalThis.WebSocket = class extends NativeWebSocket {
      constructor(...args) {
        super(...args);
        captureSocket = this;
        this.addEventListener('message', event => {
          const message = JSON.parse(event.data);
          if (message.id !== undefined) outstandingEvaluations.delete(message.id);
          if (message.method === 'Runtime.bindingCalled' && message.params.name === '__fixtureCapturePending') {
            const id = Number(message.params.payload);
            observeCondition('evaluation', () => { pendingEvaluation = id; });
          }
          if (message.id === 99998 && message.error) controller.abort(new Error(message.error.message));
          if (message.error?.code === -32000 && /navigated|context/i.test(message.error.message)) contextError = true;
          if (initialProbeId !== undefined && message.id === initialProbeId) {
            wrongDocumentRejected = message.result?.result?.value === null;
            this.send(JSON.stringify({ id: 100000, method: 'Page.navigate', params: { url: intendedUrl } }));
          }
        });
      }
      send(raw) {
        const command = JSON.parse(raw);
        if (command.method === 'Page.enable') {
          super.send(JSON.stringify({ id: 99998, method: 'Runtime.addBinding', params: { name: '__fixtureCapturePending' } }));
        }
        if (command.method === 'Runtime.evaluate' && initialProbeId === undefined) {
          initialProbeId = command.id;
          super.send(JSON.stringify({ id: 99999, method: 'Runtime.evaluate', params: {
            expression: 'window.__renderPromise = Promise.resolve({error: "Wrong capture document"})',
          } }));
        }
        if (command.method === 'Runtime.evaluate') {
          outstandingEvaluations.add(command.id);
          // The binding proves Chrome is awaiting the actual render promise;
          // sending an evaluation alone could still produce a not-ready result.
          command.params.expression = '(() => { const result = (' + command.params.expression + '); ' +
            'if (result instanceof Promise) globalThis.__fixtureCapturePending(' + JSON.stringify(String(command.id)) + '); ' +
            'return result; })()';
        }
        super.send(JSON.stringify(command));
      }
    };
    const result = await evaluateCapture(wsUrl, 10000, controller.signal, intendedUrl);
    assert.ok(wrongDocumentRejected, 'A ready promise on another document must be ignored');
    assert.ok(navigationSent, 'Fixture must replace the document during evaluation');
    assert.ok(contextError, 'Real Chrome must produce a context-replacement CDP error');
    assert.equal(observedConditions[0], firstCondition, 'Fixture must exercise the requested condition ordering');
    assert.equal(result.width, 32);
    assert.equal(result.height, 24);
    assert.deepEqual(parsePng(result.buffer).pixel(0, 0), [255, 255, 255, 255]);
    console.log('   ✓ Capture recovers from real navigation (' + firstCondition + ' condition first).');
  } finally {
    globalThis.WebSocket = NativeWebSocket;
    clearTimeout(timer);
    controller.abort();
    if (child) await terminateBrowser(child, 1000);
    if (profile) cleanupProfile(profile);
    heldSnapshot?.destroy();
    proxy.closeAllConnections();
    await new Promise(resolve => proxy.close(resolve));
    await source.close();
    if (child?.pid) {
      assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' });
      assert.equal(existsSync(profile), false, 'Owned profile must be removed');
    }
  }
}

export async function runReadinessBrowserCheck(parsePng) {
  await runNavigationCheck(parsePng, 'snapshot');
  await runNavigationCheck(parsePng, 'evaluation');
  for (let attempt = 0; attempt < 3; attempt++) {
    let result;
    try {
      result = await capture(snapshot);
      assert.equal(result.width, 32);
      assert.equal(result.height, 24);
      assert.equal(result.instanceId, snapshot.instanceId);
      assert.equal(result.revision, snapshot.revision);
    } finally {
      if (result) rmSync(result.path, { force: true });
    }
  }
  console.log('   ✓ Three fresh immutable captures succeeded.');
}
