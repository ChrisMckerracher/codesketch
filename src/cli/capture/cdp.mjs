const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DATA_URL_PREFIX = 'data:image/png;base64,';
const MAX_PROTOCOL_MESSAGES = 120;
const MAX_MESSAGE_BYTES = 25 * 1024 * 1024;
const MAX_CONTEXT_RETRIES = 8;
const READINESS_EVENTS = new Set([
  'Runtime.executionContextCreated', 'Page.frameNavigated',
  'Page.domContentEventFired', 'Page.loadEventFired',
]);
const CONTEXT_REPLACED = /^(?:Inspected target navigated or closed|Execution context was destroyed\.?|Cannot find (?:default execution context|context with specified id))$/;

export async function evaluateCapture(webSocketUrl, timeoutMs = 15000, signal = null, expectedUrl) {
  if (typeof expectedUrl !== 'string' || !expectedUrl) throw new Error('Capture requires the intended document URL');
  return new Promise((resolve, reject) => {
    let ws;
    let messageCount = 0;
    let settled = false;
    let nextId = 3;
    let evaluationId = null;
    let pendingProbe = false;
    let contextRetries = 0;
    const enabling = new Set([1, 2]);
    const timer = setTimeout(() => finish(new Error('CDP capture timed out after ' + timeoutMs + 'ms')), timeoutMs);

    function finish(err, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (ws) {
        ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
        try { ws.close(); } catch {}
      }
      if (err) reject(err);
      else resolve(result);
    }

    function onAbort() { finish(signal.reason || new Error('Capture aborted')); }

    function send(command) {
      try { ws.send(JSON.stringify(command)); }
      catch (err) { finish(err); }
    }

    // Subscribe before probing. Document/module readiness events replay a probe
    // that raced navigation, including events received during an outstanding call.
    function probe() {
      if (settled) return;
      if (enabling.size || evaluationId !== null) { pendingProbe = true; return; }
      pendingProbe = false;
      evaluationId = nextId++;
      send({ id: evaluationId, method: 'Runtime.evaluate', params: {
        expression: 'location.href === ' + JSON.stringify(expectedUrl) +
          ' && window.__renderPromise instanceof Promise ? window.__renderPromise : null',
        awaitPromise: true, returnByValue: true,
      } });
    }

    if (signal?.aborted) { onAbort(); return; }
    signal?.addEventListener('abort', onAbort, { once: true });
    try { ws = new globalThis.WebSocket(webSocketUrl); }
    catch (err) { finish(err); return; }

    ws.onerror = event => finish(new Error(event?.message || 'WebSocket error connecting to DevTools'));
    ws.onclose = () => finish(new Error('WebSocket connection closed before capture completed'));
    ws.onopen = () => {
      send({ id: 1, method: 'Page.enable' });
      if (!settled) send({ id: 2, method: 'Runtime.enable' });
    };

    ws.onmessage = event => {
      if (settled) return;
      if (++messageCount > MAX_PROTOCOL_MESSAGES) {
        finish(new Error('Exceeded maximum protocol message limit (' + MAX_PROTOCOL_MESSAGES + ')'));
        return;
      }
      const raw = typeof event.data === 'string' ? event.data : event.data?.toString?.();
      if (!raw || Buffer.byteLength(raw, 'utf8') > MAX_MESSAGE_BYTES) {
        finish(new Error('CDP message exceeded payload byte budget'));
        return;
      }
      let parsed;
      try { parsed = JSON.parse(raw); }
      catch (err) { finish(new Error('Failed to parse CDP message: ' + err.message)); return; }
      if (!parsed || typeof parsed !== 'object') { finish(new Error('Invalid CDP response')); return; }

      if (enabling.has(parsed.id)) {
        if (parsed.error) { finish(new Error('CDP error ' + parsed.error.code + ': ' + parsed.error.message)); return; }
        enabling.delete(parsed.id);
        if (!enabling.size) probe();
        return;
      }
      if (READINESS_EVENTS.has(parsed.method)) { probe(); return; }
      if (evaluationId === null || parsed.id !== evaluationId) return;
      evaluationId = null;

      if (parsed.error) {
        const { code, message } = parsed.error;
        if (code === -32000 && CONTEXT_REPLACED.test(message)) {
          if (++contextRetries > MAX_CONTEXT_RETRIES) {
            finish(new Error('Capture exceeded context replacement retry limit'));
          } else if (pendingProbe) probe();
          // Otherwise wait for a readiness event in the new context. The original
          // timer and AbortSignal remain active; no retry extends the deadline.
        } else finish(new Error('CDP error ' + code + ': ' + message));
        return;
      }
      if (parsed.result?.exceptionDetails) {
        finish(new Error('Browser evaluation failed: ' + (parsed.result.exceptionDetails.text || 'Unknown exception')));
        return;
      }
      const value = parsed.result?.result?.value;
      if (value === null) { if (pendingProbe) probe(); return; }
      if (!value || typeof value !== 'object') {
        finish(new Error('Render completed without returning image payload'));
        return;
      }
      if (value.error) { finish(new Error('Capture render error: ' + value.error)); return; }
      if (typeof value.dataUrl !== 'string' || !value.dataUrl.startsWith(DATA_URL_PREFIX)) {
        finish(new Error('Invalid image data URL returned from renderer'));
        return;
      }
      const buffer = Buffer.from(value.dataUrl.slice(DATA_URL_PREFIX.length), 'base64');
      if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_HEADER)) {
        finish(new Error('Renderer produced malformed PNG data (invalid PNG signature)'));
        return;
      }
      finish(null, { buffer, width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) });
    };
  });
}
