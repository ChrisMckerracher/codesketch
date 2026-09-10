import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Session } from '../src/direction/index.mjs';
import { createStudio } from '../src/transport/index.mjs';
import { createLifecycle } from '../src/transport/lifecycle.mjs';

const capability = 'a'.repeat(64);
const digest = 'b'.repeat(64);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

function request(port, method, path, headers = {}, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null') }));
    });
    req.setTimeout(5000, () => req.destroy(new Error('client timeout')));
    req.on('error', reject);
    if (body === undefined) req.end(); else req.end(body);
  });
}

const jsonHeaders = host => ({ host, 'content-type': 'application/json' });
const cleanup = (t, server) => t.after(() => {
  server.closeAllConnections?.();
  return new Promise(resolve => server.close(() => resolve()));
});
const stopStudio = (port, session) => request(port, 'POST', '/api/lifecycle/stop',
  { host: `127.0.0.1:${port}`, 'x-codesketch-capability': capability, 'content-type': 'application/json' },
  JSON.stringify({ instanceId: session.instanceId }));

async function managedStudio(t, options = {}) {
  const studio = await createStudio({ persistence: options.persistence,
    lifecycle: { capability, digest } });
  cleanup(t, studio.server);
  await listen(studio.server);
  studio.markReady();
  return studio;
}

describe('transport lifecycle integration', () => {
  test('unmanaged studios keep routes unavailable and stay ready without markReady', async t => {
    const studio = await createStudio({});
    cleanup(t, studio.server);
    await listen(studio.server);
    const port = studio.server.address().port;
    const host = `127.0.0.1:${port}`;
    assert.equal((await request(port, 'GET', '/api/lifecycle/status', { host })).status, 404);
    assert.equal((await request(port, 'POST', '/api/lifecycle/stop', jsonHeaders(host), '{}')).status, 404);
    assert.throws(() => studio.markReady(), /managed/, 'markReady is managed-only');
    const paused = await request(port, 'POST', '/api/control', jsonHeaders(host),
      JSON.stringify({ action: 'pause', source: 'human' }));
    assert.equal(paused.status, 200, 'ordinary behavior is ready without markReady');
    await studio.shutdown();
    assert.equal(studio.server.listening, false, 'shutdown resolves completed closure');
    assert.equal(studio.session.status, 'paused');
  });

  test('managed readiness gates status, mutations and ticks behind markReady', async t => {
    const studio = await createStudio({ lifecycle: { capability, digest } });
    cleanup(t, studio.server);
    assert.throws(() => studio.markReady(), /listening/, 'markReady before listen throws');
    await listen(studio.server);
    const port = studio.server.address().port;
    const host = `127.0.0.1:${port}`;
    const cap = { 'x-codesketch-capability': capability };
    assert.equal((await request(port, 'GET', '/api/lifecycle/status', { host, ...cap })).status, 503);
    const state = await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
    const early = await request(port, 'POST', '/api/commands', jsonHeaders(host), JSON.stringify({
      commands: [{ type: 'stroke', points: [[0, 0], [10, 10]] }], immediate: true,
      expectedDocGeneration: state.docGeneration, epoch: state.controlEpoch,
      grantToken: state.activeGrant?.grantToken }));
    assert.equal(early.status, 503, 'ordinary mutations are 503 before publication');
    const hanging = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/api/commands',
      headers: jsonHeaders(host) });
    hanging.flushHeaders();
    const prompt = await Promise.race([
      new Promise(resolve => hanging.on('response', async response => { response.resume(); resolve(response.statusCode); })),
      sleep(300).then(() => 'timeout')]);
    assert.equal(prompt, 503, 'the gate fires before the body is read');
    hanging.destroy();
    studio.markReady();
    assert.throws(() => studio.markReady(), /at most once/);
    const status = await request(port, 'GET', '/api/lifecycle/status', { host, ...cap });
    assert.deepEqual(status.body, { instanceId: studio.session.instanceId, pid: process.pid,
      url: `http://127.0.0.1:${port}`, digest, state: 'running' });
    assert.equal((await request(port, 'GET', '/api/lifecycle/status', { host })).status, 403);
    assert.equal((await request(port, 'GET', '/api/lifecycle/status',
      { host: `localhost:${port}`, ...cap })).status, 403);
    assert.equal((await request(port, 'GET', '/api/lifecycle/status',
      { host, ...cap, origin: `http://127.0.0.1:${port}` })).status, 403);
  });

  test('invalid lifecycle config rejects createStudio before any listener', async t => {
    t.after(() => {});
    await assert.rejects(createStudio({ lifecycle: { capability: 'x', digest } }), /64 lowercase hex/);
    await assert.rejects(createStudio({ lifecycle: { capability, digest, extra: 1 } }), /exactly the keys/);
    for (const malformed of [false, null, 0]) {
      await assert.rejects(createStudio({ lifecycle: malformed }), /exactly the keys/,
        'provided falsy config is rejected, never treated as unmanaged');
    }
  });

  test('stop preserves partial preview and queue while pausing and revoking grants', async t => {
    const studio = await managedStudio(t);
    const { session } = studio;
    const port = studio.server.address().port;
    const host = `127.0.0.1:${port}`;
    const context = () => request(port, 'GET', '/api/state').then(r => r.body)
      .then(state => ({ expectedDocGeneration: state.docGeneration, epoch: state.controlEpoch,
        grantToken: state.activeGrant?.grantToken }));
    await request(port, 'POST', '/api/commands', jsonHeaders(host), JSON.stringify({ commands: [
      { type: 'stroke', points: [[0, 0], [100, 0]] }], immediate: true, ...(await context()) }));
    await request(port, 'POST', '/api/commands', jsonHeaders(host), JSON.stringify({ commands: [
      { type: 'stroke', points: [[5, 5], [60, 60]] }, { type: 'fill', color: '#112233' }],
      replace: false, play: false, source: 'human' }));
    await request(port, 'POST', '/api/control', jsonHeaders(host),
      JSON.stringify({ action: 'speed', speed: 0.25, source: 'human' }));
    await request(port, 'POST', '/api/control', jsonHeaders(host),
      JSON.stringify({ action: 'resume', source: 'human' }));
    session.tick(1);
    await request(port, 'POST', '/api/control', jsonHeaders(host),
      JSON.stringify({ action: 'pause', source: 'human' }));
    const progress = session.active.progress;
    assert.ok(progress > 0 && progress < 1, 'the session holds partial preview');
    const stopped = await stopStudio(port, session);
    assert.equal(stopped.status, 200);
    assert.deepEqual(stopped.body, { instanceId: session.instanceId, state: 'stopping' });
    assert.equal(session.status, 'paused', 'stop pauses via the domain human pause');
    assert.deepEqual(session.active.command, { type: 'stroke', layer: 'paint', color: '#253d38',
      opacity: 1, points: [[5, 5], [60, 60]], size: 8, brush: 'brush' },
      'the partial stroke preview is intact');
    assert.equal(session.active.progress, progress, 'partial preview progress is preserved');
    assert.equal(session.queue.length, 1, 'remaining queued work is preserved');
    assert.equal(session.speed, 0.25, 'speed is untouched');
    assert.equal(session.controlGrant.activeGrant, null, 'continuation grants are invalidated');
    await studio.shutdown();
    assert.equal(studio.server.listening, false);
    assert.equal(session.status, 'paused');
    assert.equal(session.active.progress, progress, 'shutdown preserves the partial stroke preview');
    assert.equal(session.queue.length, 1);
  });

  test('a late awaited body write is rejected with 503 after stop engages', async t => {
    const studio = await managedStudio(t);
    const port = studio.server.address().port;
    const host = `127.0.0.1:${port}`;
    const late = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/api/commands',
      headers: jsonHeaders(host) });
    late.flushHeaders();
    await sleep(30);
    assert.equal((await stopStudio(port, studio.session)).status, 200);
    await sleep(20);
    late.end(JSON.stringify({ commands: [{ type: 'stroke', points: [[1, 1], [2, 2]] }],
      immediate: true, source: 'human' }));
    const outcome = await new Promise((resolve, reject) => late.on('error', reject)
      .on('response', async response => { response.resume(); resolve(response.statusCode); }));
    assert.equal(outcome, 503, 'the late mutation is rejected by the stopping gate');
    await studio.shutdown();
  });

  test('concurrent valid stops coalesce into one attempt and share acknowledgements', async t => {
    let flushes = 0;
    const session = new Session();
    let lifecycle = null;
    const server = http.createServer((request, response) => lifecycle.handle(request, response));
    cleanup(t, server);
    lifecycle = createLifecycle({ server, session, flush: async () => { flushes += 1; await sleep(40); },
      lifecycle: { capability, digest } });
    await listen(server);
    lifecycle.markReady();
    const port = server.address().port;
    const outcomes = await Promise.all([stopStudio(port, session), stopStudio(port, session)]);
    assert.deepEqual(outcomes.map(outcome => outcome.status), [200, 200]);
    assert.deepEqual(outcomes.map(outcome => outcome.body), outcomes.map(() => outcomes[0].body));
    assert.equal(flushes, 1, 'both requests share one flush attempt');
    await lifecycle.shutdown();
    assert.equal(server.listening, false);
  });

  test('a pause failure clears the gate and the attempt stays retryable', async t => {
    let flushes = 0;
    let pauses = 0;
    const session = { instanceId: 'lifecycle-fault-fixture',
      control() { pauses += 1; throw new Error('pause fault'); } };
    let lifecycle = null;
    const server = http.createServer((request, response) => lifecycle.handle(request, response));
    cleanup(t, server);
    lifecycle = createLifecycle({ server, session, flush: async () => { flushes += 1; },
      lifecycle: { capability, digest } });
    await listen(server);
    lifecycle.markReady();
    const port = server.address().port;
    const failed = await stopStudio(port, session);
    assert.equal(failed.status, 500);
    assert.match(failed.body.error, /pause fault/);
    const status = await request(port, 'GET', '/api/lifecycle/status',
      { host: `127.0.0.1:${port}`, 'x-codesketch-capability': capability });
    assert.equal(status.body.state, 'running', 'the failed attempt cleared the stopping gate');
    const retried = await stopStudio(port, session);
    assert.equal(retried.status, 500, 'the attempt resets instead of caching a rejected outcome');
    assert.equal(pauses, 2);
    assert.equal(flushes, 0, 'a failed pause never reaches flush');
    await assert.rejects(lifecycle.shutdown(), error => error.statusCode === 500);
  });

  test('a flush failure returns 500, clears the gate and leaves a paused live studio', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'codesketch-lifecycle-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const file = join(dir, 'session.json');
    const studio = await managedStudio(t, { persistence: file });
    const port = studio.server.address().port;
    const host = `127.0.0.1:${port}`;
    const cap = { 'x-codesketch-capability': capability };
    await request(port, 'POST', '/api/commands', jsonHeaders(host), JSON.stringify({
      commands: [{ type: 'stroke', points: [[0, 0], [10, 10]] }], replace: false, play: false, source: 'human' }));
    await chmod(dir, 0o555);
    const failed = await stopStudio(port, studio.session);
    assert.equal(failed.status, 500);
    assert.match(failed.body.error, /could not be saved/);
    const status = await request(port, 'GET', '/api/lifecycle/status', { host, ...cap });
    assert.equal(status.body.state, 'running', 'a failed attempt clears the stopping gate');
    assert.equal(studio.session.status, 'paused', 'the session stays paused');
    await chmod(dir, 0o700);
    const resumed = await request(port, 'POST', '/api/control', jsonHeaders(host),
      JSON.stringify({ action: 'resume', source: 'human' }));
    assert.equal(resumed.status, 200, 'the live studio resumes once storage is writable again');
    assert.equal(studio.session.status, 'playing');
    studio.session.control('pause', undefined, { source: 'human' });
    const retried = await stopStudio(port, studio.session);
    assert.equal(retried.status, 200, 'a retried stop succeeds after the flush works');
    await studio.shutdown();
    assert.equal(studio.server.listening, false);
  });

  test('status identity stays stable after the listener closes', async t => {
    const session = new Session();
    let lifecycle = null;
    const server = http.createServer((request, response) => lifecycle.handle(request, response));
    cleanup(t, server);
    lifecycle = createLifecycle({ server, session, flush: async () => {}, lifecycle: { capability, digest } });
    await listen(server);
    lifecycle.markReady();
    const port = server.address().port;
    const before = await request(port, 'GET', '/api/lifecycle/status',
      { host: `127.0.0.1:${port}`, 'x-codesketch-capability': capability });
    assert.equal(before.body.state, 'running');
    await lifecycle.shutdown();
    assert.equal(server.address(), null, 'the closed server no longer reports an address');
    const fakeResponse = { statusCode: 0, headersSent: false, body: null,
      writeHead(code) { this.statusCode = code; this.headersSent = true; },
      end(chunk) { this.body = chunk; } };
    const fakeRequest = { method: 'GET', url: '/api/lifecycle/status', socket: { remoteAddress: '127.0.0.1' },
      headers: { host: `127.0.0.1:${port}`, 'x-codesketch-capability': capability } };
    await lifecycle.handle(fakeRequest, fakeResponse);
    assert.equal(fakeResponse.statusCode, 200);
    assert.deepEqual(JSON.parse(fakeResponse.body), { ...before.body, state: 'stopping' },
      'identity is captured at publication, not re-read from the closed server');
  });
});
