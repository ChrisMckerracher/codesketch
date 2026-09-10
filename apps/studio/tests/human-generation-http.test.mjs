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
        text: Buffer.concat(chunks).toString('utf8') }));
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

const stroke = points => ({ type: 'stroke', layer: 'paint', points,
  color: '#253d38', size: 8, brush: 'brush' });

const emptyProject = () => ({ format: 'codesketch', version: 2,
  commands: [], cursor: 0, queue: [], comments: [] });

const snapshot = async () => (await json({ path: '/api/state' })).data;

function partialPost(path, payload, chunk = 8) {
  let open;
  const response = new Promise((resolveRequest, rejectRequest) => {
    open = http.request({ host: '127.0.0.1', port, method: 'POST', path,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } },
      res => {
        const chunks = [];
        res.on('data', part => chunks.push(part));
        res.on('end', () => resolveRequest({ status: res.statusCode,
          text: Buffer.concat(chunks).toString('utf8') }));
      });
    open.setTimeout(5000, () => open.destroy(new Error('client timeout')));
    open.on('error', rejectRequest);
    open.write(payload.slice(0, chunk));
  });
  return { response, finish: () => open.end(payload.slice(chunk)) };
}

test('human writes need the current generation on commands, control, project, and demo', async () => {
  const before = await snapshot();
  for (const expectedDocGeneration of [undefined, '', 7, null, {}, 'not-the-generation']) {
    const cases = [
      ['/api/commands', { commands: [stroke([[5, 5]])], immediate: true,
        source: 'human', expectedDocGeneration }],
      ['/api/control', { action: 'pause', source: 'human', expectedDocGeneration }],
      ['/api/control', { action: 'speed', speed: 2, source: 'human', expectedDocGeneration }],
      ['/api/project', { project: emptyProject(), source: 'human', expectedDocGeneration }],
      ['/api/demo', { source: 'human', expectedDocGeneration }],
    ];
    for (const [path, body] of cases) {
      const rejected = await post(path, body);
      assert.equal(rejected.status, 409,
        `${path} with ${JSON.stringify(expectedDocGeneration)} must reject`);
      assert.equal(typeof rejected.data.error, 'string', `${path} keeps the error envelope`);
    }
  }
  const after = await snapshot();
  assert.deepEqual(after, before, 'rejections leave the complete snapshot unchanged');
});

test('current human pause, speed, commands, and demo are accepted', async () => {
  const current = (await snapshot()).docGeneration;
  const paused = await post('/api/control', { action: 'pause', source: 'human',
    expectedDocGeneration: current });
  assert.equal(paused.status, 200);
  assert.equal(paused.data.playback.status, 'paused');
  assert.equal(paused.data.requiresGrant, true);
  const speed = await post('/api/control', { action: 'speed', speed: 4, source: 'human',
    expectedDocGeneration: paused.data.docGeneration });
  assert.equal(speed.status, 200);
  assert.equal(speed.data.playback.speed, 4);
  const queued = await post('/api/commands', { commands: [stroke([[10, 10], [300, 300]])],
    source: 'human', expectedDocGeneration: speed.data.docGeneration });
  assert.equal(queued.status, 200);
  assert.equal(queued.data.playback.remaining, 1);
  const demo = await post('/api/demo', { source: 'human',
    expectedDocGeneration: queued.data.docGeneration });
  assert.equal(demo.status, 200);
  assert.ok(demo.data.playback.remaining > 0, 'demo stages its trusted example queue after the caller check');
  assert.notEqual(demo.data.docGeneration, queued.data.docGeneration, 'demo rotates the generation');
});

test('a delayed body is guarded against a generation rotated by another client new', async () => {
  const current = (await snapshot()).docGeneration;
  const payload = JSON.stringify({ commands: [stroke([[8, 8]])], immediate: true,
    source: 'human', expectedDocGeneration: current });
  const slow = partialPost('/api/commands', payload);
  await new Promise(resolve => setTimeout(resolve, 100));
  const rotation = await post('/api/demo', { source: 'human', expectedDocGeneration: current });
  assert.equal(rotation.status, 200, 'the other client rotates while the first body is open');
  slow.finish();
  const result = await slow.response;
  assert.equal(result.status, 409, 'the completed body is guarded after the body read');
  assert.equal(JSON.parse(result.text).error.includes('expectedDocGeneration'), true);
  assert.equal((await snapshot()).docGeneration, rotation.data.docGeneration);
});

test('a delayed body is guarded against a generation rotated by another client load', async () => {
  const current = (await snapshot()).docGeneration;
  const project = (await json({ path: '/api/project' })).data;
  const payload = JSON.stringify({ action: 'pause', source: 'human',
    expectedDocGeneration: current });
  const slow = partialPost('/api/control', payload);
  await new Promise(resolve => setTimeout(resolve, 100));
  const rotation = await post('/api/project', { project, source: 'human',
    expectedDocGeneration: current });
  assert.equal(rotation.status, 200, 'the load rotates while the first body is open');
  slow.finish();
  const result = await slow.response;
  assert.equal(result.status, 409, 'the delayed pause is guarded after the body read');
  assert.equal((await snapshot()).docGeneration, rotation.data.docGeneration);
});

test('a stale generation after a load is rejected without mutating', async () => {
  const stale = (await snapshot()).docGeneration;
  const project = (await json({ path: '/api/project' })).data;
  const reloaded = await post('/api/project', { project, source: 'human',
    expectedDocGeneration: stale });
  assert.equal(reloaded.status, 200);
  const rejected = await post('/api/commands', { commands: [stroke([[7, 7]])],
    immediate: true, source: 'human', expectedDocGeneration: stale });
  assert.equal(rejected.status, 409);
  assert.equal((await snapshot()).history.total, 0, 'the reloaded project stays untouched');
});

test('unknown POST paths keep their 404', async () => {
  const response = await post('/api/nope', { source: 'human' });
  assert.equal(response.status, 404);
});

test('agent requests keep their existing generation and grant enforcement', async () => {
  const state = await snapshot();
  const missingContext = await post('/api/commands',
    { commands: [stroke([[2, 2]])], source: 'agent' });
  assert.equal(missingContext.status, 409, 'the direction-level agent guard still rejects');
  const staged = await post('/api/commands', {
    commands: [stroke([[3, 3]])], play: false, source: 'agent',
    expectedDocGeneration: state.docGeneration, epoch: state.controlEpoch,
    grantToken: state.activeGrant?.grantToken });
  assert.equal(staged.status, 200, 'a guarded agent batch with current context still stages');
});
