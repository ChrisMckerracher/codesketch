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

const post = (path, body, extra = {}) => json({ method: 'POST', path,
  headers: { 'content-type': 'application/json', ...extra }, body });
const stroke = points => ({ type: 'stroke', layer: 'paint', points,
  color: '#253d38', size: 8, brush: 'brush' });

test('serves the studio HTML with a strict CSP and hardening headers', async () => {
  const response = await request({ path: '/' });
  assert.equal(response.status, 200);
  assert.match(response.headers['content-type'], /^text\/html/);
  const csp = response.headers['content-security-policy'];
  for (const directive of ["default-src 'self'", "script-src 'self'", "object-src 'none'",
    "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'"]) {
    assert.ok(csp.includes(directive), `CSP must include ${directive}`);
  }
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
});

test('blocks host rebinding, foreign origins, and cross-site fetch metadata', async () => {
  const rebound = await request({ path: '/api/state', headers: { host: 'evil.example:80' } });
  assert.equal(rebound.status, 403, 'foreign Host header must be rejected');
  const foreign = await request({ path: '/api/state', headers: { origin: 'http://evil.example' } });
  assert.equal(foreign.status, 403, 'foreign Origin header must be rejected');
  const crossSite = await request({ path: '/api/state', headers: { 'sec-fetch-site': 'cross-site' } });
  assert.equal(crossSite.status, 403, 'cross-site fetch metadata must be rejected');
});

test('refuses text/plain posts, malformed JSON, and unknown commands atomically', async () => {
  const before = (await json({ path: '/api/state' })).data;
  const plain = await post('/api/commands', JSON.stringify({ commands: [stroke([[1, 1]])] }),
    { 'content-type': 'text/plain' });
  assert.equal(plain.status, 400);
  assert.match(plain.data.error, /Content-Type must be application\/json/);
  const malformed = await request({ method: 'POST', path: '/api/commands',
    headers: { 'content-type': 'application/json' }, body: '{"commands": [oops' });
  assert.equal(malformed.status, 400);
  const unknown = await post('/api/commands', { commands: [{ type: 'smear', layer: 'paint' }] });
  assert.equal(unknown.status, 400);
  assert.match(unknown.data.error, /Unknown command type/);
  const after = (await json({ path: '/api/state' })).data;
  assert.equal(after.revision, before.revision, 'failed posts must not bump the revision');
  assert.deepEqual(after.document.marks, before.document.marks, 'failed posts must not mark');
});

test('blocks dot-dot traversal, source exfiltration, and encoded escapes', async () => {
  for (const path of ['/.git/config', '/src/transport/server.mjs',
    '/..%2f.git%2fconfig', '/%2e%2e/%2e%2e/.git/config']) {
    const response = await request({ path });
    assert.equal(response.status, 404, `${path} must not be served`);
    assert.equal(response.headers['content-type'], 'application/json');
  }
});

test('valid commands commit immediately, feedback pauses, and projects roundtrip', async () => {
  const submitted = await post('/api/commands',
    { commands: [stroke([[10, 10], [400, 400]]), stroke([[500, 100], [900, 600]])], immediate: true });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.data.document.marks.length, 2, 'immediate submit commits at once');
  assert.equal(submitted.data.playback.status, 'paused');
  const feedback = await post('/api/feedback', { text: 'thicken the trunk here' });
  assert.equal(feedback.status, 200);
  assert.equal(feedback.data.playback.status, 'paused', 'feedback interrupts playback');
  assert.equal(feedback.data.feedback.length, 1);
  const saved = (await json({ path: '/api/project' })).data;
  assert.equal(saved.format, 'codesketch');
  assert.equal(saved.commands.length, 2);
  const reloaded = await post('/api/project', saved);
  assert.equal(reloaded.status, 200);
  assert.deepEqual(reloaded.data.document, submitted.data.document, 'roundtrip preserves the art');
  assert.deepEqual(reloaded.data.feedback.map(item => item.text), ['thicken the trunk here']);
});

test('conditional GET returns unchanged only for matching revision and instanceId', async () => {
  const snapshot = (await json({ path: '/api/state' })).data;
  const match = await json({ path:
    `/api/state?since=${snapshot.revision}&instanceId=${encodeURIComponent(snapshot.instanceId)}` });
  assert.equal(match.data.unchanged, true, 'current client gets a tiny unchanged reply');
  const staleRevision = await json({ path:
    `/api/state?since=${snapshot.revision - 1}&instanceId=${encodeURIComponent(snapshot.instanceId)}` });
  assert.equal(staleRevision.data.unchanged, undefined, 'old revision gets full state');
  assert.equal(staleRevision.data.revision, snapshot.revision);
});

test('wrong instanceId at the same revision still returns full state', async () => {
  const snapshot = (await json({ path: '/api/state' })).data;
  const staleInstance = await json({ path:
    `/api/state?since=${snapshot.revision}&instanceId=retired-session` });
  assert.equal(staleInstance.status, 200);
  assert.equal(staleInstance.data.unchanged, undefined, 'stale instance must resynchronize');
  assert.equal(staleInstance.data.instanceId, session.instanceId);
  assert.ok(staleInstance.data.document, 'full snapshot includes the document');
});

test('revision advances across mutations while instanceId stays stable', async () => {
  const first = (await json({ path: '/api/state' })).data;
  await post('/api/commands', { commands: [stroke([[5, 5]])], immediate: true });
  const second = (await json({ path: '/api/state' })).data;
  assert.ok(second.revision > first.revision, 'revision reflects new art');
  assert.equal(second.instanceId, first.instanceId, 'instance survives within one server');
});
