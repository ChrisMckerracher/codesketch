import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCapture } from '../../src/cli/capture/cdp.mjs';

const URL = 'http://127.0.0.1:54321/capture.html';
const NAVIGATED = { code: -32000, message: 'Inspected target navigated or closed' };
const png = Buffer.alloc(24);
Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
png.writeUInt32BE(1000, 16);
png.writeUInt32BE(700, 20);
const payload = { dataUrl: 'data:image/png;base64,' + png.toString('base64') };

function protocol(t, handler) {
  const original = globalThis.WebSocket;
  const sockets = [];
  class Socket {
    sent = [];
    closed = false;
    constructor() { sockets.push(this); queueMicrotask(() => this.onopen?.()); }
    send(raw) {
      const command = JSON.parse(raw);
      this.sent.push(command);
      queueMicrotask(() => {
        if (command.method.endsWith('.enable')) this.receive({ id: command.id, result: {} });
        else handler(command, this);
      });
    }
    receive(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
    event(method = 'Runtime.executionContextCreated') { this.receive({ method, params: {} }); }
    result(id, value) { this.receive({ id, result: { result: { value } } }); }
    close() { this.closed = true; }
  }
  globalThis.WebSocket = Socket;
  t.after(() => { globalThis.WebSocket = original; });
  return sockets;
}

for (const eventFirst of [false, true]) {
  test('capture retries context replacement with readiness event ' + (eventFirst ? 'before' : 'after') + ' error', async t => {
    let attempts = 0;
    const sockets = protocol(t, (command, ws) => {
      attempts++;
      if (attempts === 1) {
        if (eventFirst) ws.event();
        ws.receive({ id: command.id, error: NAVIGATED });
        if (!eventFirst) ws.event();
      } else ws.result(command.id, payload);
    });
    const result = await evaluateCapture('ws://fixture', 1000, null, URL);
    assert.equal(result.width, 1000);
    assert.equal(result.height, 700);
    assert.equal(attempts, 2);
    assert.deepEqual(sockets[0].sent.slice(0, 2).map(c => c.method), ['Page.enable', 'Runtime.enable']);
    assert.ok(sockets[0].closed);
  });
}

test('capture waits for module readiness and preserves an event received during the probe', async t => {
  let attempts = 0;
  const sockets = protocol(t, (command, ws) => {
    if (++attempts === 1) {
      ws.event('Page.domContentEventFired');
      ws.result(command.id, null);
    } else ws.result(command.id, payload);
  });
  const result = await evaluateCapture('ws://fixture', 1000, null, URL);
  assert.equal(result.width, 1000);
  assert.equal(attempts, 2);
  assert.ok(sockets[0].closed);
});

test('capture reports unrelated top-level CDP errors without retrying', async t => {
  let attempts = 0;
  const sockets = protocol(t, (command, ws) => {
    attempts++;
    ws.receive({ id: command.id, error: { code: -32000, message: 'Permission denied' } });
  });
  await assert.rejects(evaluateCapture('ws://fixture', 1000, null, URL), /CDP error -32000: Permission denied/);
  assert.equal(attempts, 1);
  assert.ok(sockets[0].closed);
});

test('capture bounds repeated context replacement even with continual readiness events', async t => {
  let attempts = 0;
  const sockets = protocol(t, (command, ws) => {
    attempts++;
    ws.event();
    ws.receive({ id: command.id, error: NAVIGATED });
  });
  await assert.rejects(evaluateCapture('ws://fixture', 1000, null, URL), /context replacement retry limit/);
  assert.equal(attempts, 9);
  assert.ok(sockets[0].closed);
});

for (const pending of ['not-ready', 'navigated', 'rendering']) {
  test('capture deadline closes protocol while ' + pending, async t => {
    let attempts = 0;
    const sockets = protocol(t, (command, ws) => {
      attempts++;
      if (pending === 'not-ready') ws.result(command.id, null);
      if (pending === 'navigated') ws.receive({ id: command.id, error: NAVIGATED });
    });
    await assert.rejects(evaluateCapture('ws://fixture', 20, null, URL), /timed out/);
    assert.equal(attempts, 1, 'No polling or blind retries while waiting');
    assert.ok(sockets[0].closed);
    sockets[0].event();
    assert.equal(attempts, 1, 'Late events cannot restart a settled capture');
  });
}

test('capture abort during context replacement closes protocol and ignores late readiness', async t => {
  const controller = new AbortController();
  let attempts = 0;
  const sockets = protocol(t, (command, ws) => {
    attempts++;
    ws.receive({ id: command.id, error: NAVIGATED });
    controller.abort(new Error('Cancelled fixture capture'));
    ws.event();
  });
  await assert.rejects(evaluateCapture('ws://fixture', 1000, controller.signal, URL), /Cancelled fixture capture/);
  assert.equal(attempts, 1);
  assert.ok(sockets[0].closed);
});

test('capture pre-abort creates no protocol connection', async t => {
  const controller = new AbortController();
  controller.abort(new Error('Already cancelled'));
  const sockets = protocol(t, () => assert.fail('No request expected'));
  await assert.rejects(evaluateCapture('ws://fixture', 1000, controller.signal, URL), /Already cancelled/);
  assert.equal(sockets.length, 0);
});
