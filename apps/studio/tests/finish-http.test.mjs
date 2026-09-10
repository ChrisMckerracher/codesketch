import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createStudio } from '../src/transport/index.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { server, session } = await createStudio({ root });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

test.after(() => new Promise(resolve => {
  server.closeAllConnections();
  server.closeIdleConnections();
  server.close(resolve);
}));

function request({ method = 'GET', path = '/', headers = {}, body } = {}) {
  return new Promise((resolveRequest, rejectRequest) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolveRequest({ status: response.statusCode,
        headers: response.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.setTimeout(5000, () => req.destroy(new Error('client timeout')));
    req.on('error', rejectRequest);
    if (body === undefined) req.end();
    else req.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
}

async function json(options) {
  const response = await request(options);
  return { ...response, data: JSON.parse(response.text) };
}

const post = (path, body) => json({ method: 'POST', path,
  headers: { 'content-type': 'application/json' }, body });
const state = async () => (await json({ path: '/api/state' })).data;
const stroke = (points) => ({ type: 'stroke', layer: 'paint', color: '#253d38',
  points, size: 8, brush: 'brush' });

test('human finish over HTTP completes the queue atomically and revokes grants', async () => {
  const submitted = await post('/api/commands', { commands: [stroke([[5, 5], [15, 15]]), stroke([[25, 25], [35, 35]])],
    play: false, source: 'human' });
  assert.equal(submitted.status, 200);
  const before = await state();
  const response = await post('/api/control', { action: 'finish', source: 'human' });
  assert.equal(response.status, 200);
  const after = await state();
  assert.equal(after.playback.status, 'paused');
  assert.equal(after.playback.remaining, 0);
  assert.equal(after.history.total, 2);
  assert.equal(after.controlEpoch, before.controlEpoch + 1);
  assert.equal(after.requiresGrant, true);
  assert.equal(after.activeGrant, null);
});

test('guarded agent finish with a current execution grant succeeds', async () => {
  const queued = await post('/api/commands', { commands: [stroke([[45, 45], [55, 55]])], play: false, source: 'human' });
  assert.equal(queued.status, 200);
  const resumed = await post('/api/control', { action: 'resume', source: 'human' });
  assert.equal(resumed.status, 200);
  const snapshot = await state();
  const response = await post('/api/control', { action: 'finish',
    expectedDocGeneration: snapshot.docGeneration, epoch: snapshot.controlEpoch,
    grantToken: snapshot.activeGrant.grantToken });
  assert.equal(response.status, 200);
  const after = await state();
  assert.equal(after.playback.status, 'paused');
  assert.equal(after.playback.remaining, 0);
  assert.equal(after.history.total, 3);
});

test('agent finish with a stale epoch is rejected with 409 and keeps the queue', async () => {
  const queued = await post('/api/commands', { commands: [stroke([[65, 65], [75, 75]])], play: false, source: 'human' });
  assert.equal(queued.status, 200);
  const stale = await state();
  const paused = await post('/api/control', { action: 'pause', source: 'human' });
  assert.equal(paused.status, 200);
  const rejected = await post('/api/control', { action: 'finish',
    expectedDocGeneration: stale.docGeneration, epoch: stale.controlEpoch,
    grantToken: stale.activeGrant?.grantToken });
  assert.equal(rejected.status, 409);
  const after = await state();
  assert.equal(after.playback.remaining, 1, 'pending queue remains untouched');
});

test('human finish on an empty pending queue is a no-op', async () => {
  const drained = await post('/api/control', { action: 'finish', source: 'human' });
  assert.equal(drained.status, 200);
  const before = await state();
  const response = await post('/api/control', { action: 'finish', source: 'human' });
  assert.equal(response.status, 200);
  const after = await state();
  assert.equal(after.revision, before.revision, 'empty finish mutates nothing');
  assert.equal(after.playback.remaining, 0);
});
