import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createStudio } from '../src/transport/index.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const { server } = await createStudio({ root });
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

const post = (path, body, extra = {}) => json({ method: 'POST', path,
  headers: { 'content-type': 'application/json', ...extra }, body });
const stroke = points => ({ type: 'stroke', layer: 'paint', points,
  color: '#253d38', size: 8, brush: 'brush' });
const state = async () => (await json({ path: '/api/state' })).data;
const context = async () => {
  const s = await state();
  return { expectedDocGeneration: s.docGeneration, epoch: s.controlEpoch };
};

test('after a human pause agent new/load/demo/undo/redo reject 409 atomically and reset nothing', async () => {
  const prepared = await post('/api/commands', { commands: [stroke([[10, 10], [400, 400]])],
    immediate: true, ...(await context()) });
  assert.equal(prepared.status, 200, 'the observed-context setup batch commits');
  const paused = await post('/api/control', { action: 'pause', source: 'human' });
  assert.equal(paused.status, 200);
  await post('/api/comments/poll', { since: null });
  const before = await state();
  const saved = (await json({ path: '/api/project' })).data;
  const current = { expectedDocGeneration: before.docGeneration, epoch: before.controlEpoch };
  const stale = { expectedDocGeneration: 'stale-generation', epoch: 42 };
  for (const action of ['new', 'undo', 'redo']) {
    assert.equal((await post('/api/control', { action })).status, 409, `contextless agent ${action} conflicts`);
    assert.equal((await post('/api/control', { action, ...current })).status, 409,
      `current context without token ${action} conflicts`);
    assert.equal((await post('/api/control', { action, ...stale })).status, 409, `stale ${action} conflicts`);
  }
  assert.equal((await post('/api/project', saved)).status, 400, 'a raw project body requires the wrapper');
  assert.equal((await post('/api/project', { project: saved })).status, 409, 'a wrapper without a source defaults to agent');
  assert.equal((await post('/api/project', { project: saved, ...stale, grantToken: 'guess' })).status, 409);
  assert.equal((await post('/api/project', { ...saved, source: 'human' })).status, 400,
    'a raw file is wrapper-rejected before any source consideration');
  assert.equal((await post('/api/project', { project: { ...saved, source: 'human' } })).status, 409,
    'nested project metadata cannot impersonate the caller');
  assert.equal((await post('/api/demo', {})).status, 409, 'demo is guarded like new');
  assert.equal((await post('/api/demo', stale)).status, 409);
  const after = await state();
  assert.deepEqual(after, before, 'every rejected reset leaves the entire state untouched');
  assert.equal(after.heartbeat.lastSeenAt, before.heartbeat.lastSeenAt, 'guard failures never reset the heartbeat');
});

test('wrapped human load and human demo are permitted, land paused, and clear the heartbeat', async () => {
  const demo = await post('/api/demo', { source: 'human' });
  assert.equal(demo.status, 200);
  assert.equal(demo.data.playback.status, 'paused');
  assert.ok(demo.data.playback.remaining > 0, 'the demo stages its landscape queue');
  assert.equal(demo.data.requiresGrant, true);
  assert.equal(demo.data.heartbeat.lastSeenAt, null, 'a successful demo rotates the generation and clears the heartbeat');
  const generation = demo.data.docGeneration;
  const saved = (await json({ path: '/api/project' })).data;
  const loaded = await post('/api/project', { project: saved, source: 'human' });
  assert.equal(loaded.status, 200);
  assert.equal(loaded.data.playback.status, 'paused');
  assert.equal(loaded.data.requiresGrant, true);
  assert.equal(loaded.data.activeGrant, null, 'load clears any active grant');
  assert.equal(loaded.data.controlEpoch, 0);
  assert.notEqual(loaded.data.docGeneration, generation);
  assert.equal(loaded.data.heartbeat.lastSeenAt, null);
  const broken = await post('/api/project', { project: { format: 'nope' }, source: 'human' });
  assert.equal(broken.status, 400, 'a trusted wrapper still validates the project');
  const settled = await state();
  assert.equal(settled.revision, loaded.data.revision, 'malformed imports mutate nothing');
  assert.equal(settled.docGeneration, loaded.data.docGeneration);
});

test('an active grant authorizes the agent reset over HTTP and spent grants go stale', async () => {
  assert.equal((await post('/api/control', { action: 'new', source: 'human' })).status, 200);
  assert.equal((await post('/api/commands', { commands: [stroke([[10, 10], [400, 400]])],
    immediate: true, ...(await context()) })).status, 200);
  assert.equal((await post('/api/control', { action: 'pause', source: 'human' })).status, 200);
  const resumed = await post('/api/control', { action: 'resume', source: 'human' });
  const grant = resumed.data.activeGrant;
  assert.ok(grant && grant.grantToken, 'human resume issues a continuation grant');
  const reset = await post('/api/control', { action: 'new',
    expectedDocGeneration: grant.docGeneration, epoch: grant.controlEpoch, grantToken: grant.grantToken });
  assert.equal(reset.status, 200);
  assert.notEqual(reset.data.docGeneration, grant.docGeneration);
  assert.equal(reset.data.controlEpoch, 0);
  assert.equal(reset.data.activeGrant, null);
  const replay = await post('/api/control', { action: 'new',
    expectedDocGeneration: grant.docGeneration, epoch: grant.controlEpoch, grantToken: grant.grantToken });
  assert.equal(replay.status, 409, 'the consumed grant cannot reset again');
});
