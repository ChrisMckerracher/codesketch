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
const currentContext = async () => {
  const state = (await json({ path: '/api/state' })).data;
  return { expectedDocGeneration: state.docGeneration, epoch: state.controlEpoch,
    grantToken: state.activeGrant?.grantToken };
};

test('root serves the rebuilt shell and static policy holds', async () => {
  const rootResponse = await request({ path: '/' });
  assert.equal(rootResponse.status, 200, 'the rebuilt UI serves from the root');
  assert.match(rootResponse.headers['content-type'], /^text\/html/);
  const csp = rootResponse.headers['content-security-policy'];
  for (const directive of ["default-src 'self'", "script-src 'self'", "object-src 'none'",
    "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'"]) {
    assert.ok(csp.includes(directive), `CSP must include ${directive}`);
  }
  assert.equal(rootResponse.headers['x-content-type-options'], 'nosniff');
  assert.equal(rootResponse.headers['referrer-policy'], 'no-referrer');
  assert.equal(rootResponse.headers['cache-control'], 'no-store');
  const entrypoint = await request({ path: '/public/index.html' });
  assert.equal(entrypoint.status, 200, 'the explicit entrypoint serves the same shell');
  assert.match(entrypoint.headers['content-type'], /^text\/html/);
  for (const path of ['/public/base.css', '/public/layout.css', '/public/tools.css',
    '/src/studio/tools-ui.mjs', '/src/studio/layers-ui.mjs',
    '/src/studio/comments/comments-ui.mjs']) {
    const removed = await request({ path });
    assert.equal(removed.status, 404, `${path} was removed with the UI and must not be served`);
    assert.equal(removed.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(removed.text), { error: 'Not found' });
  }
  for (const path of ['/public/tokens.css', '/public/workspace.css', '/public/controls.css',
    '/public/layers.css', '/public/inspector.css', '/public/stage.css', '/public/feedback.css']) {
    const stylesheet = await request({ path });
    assert.equal(stylesheet.status, 200, `${path} is an allowed UI stylesheet`);
    assert.match(stylesheet.headers['content-type'], /^text\/css/);
  }
  const entryModule = await request({ path: '/src/studio/index.mjs' });
  assert.equal(entryModule.status, 200, 'the rebuilt UI entrypoint module serves');
  assert.match(entryModule.headers['content-type'], /^text\/javascript/);
  const retained = await request({ path: '/src/studio/api.mjs' });
  assert.equal(retained.status, 200, 'retained studio logic modules still serve');
  assert.match(retained.headers['content-type'], /^text\/javascript/);
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
  const unknown = await post('/api/commands',
    { commands: [{ type: 'smear', layer: 'paint' }], ...(await currentContext()) });
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

test('retired feedback route is gone and project loads demand the wrapper plus context', async () => {
  const retired = await post('/api/feedback', { text: 'legacy note' });
  assert.equal(retired.status, 404, 'the feedback endpoint is retired');
  const rawProject = { format: 'codesketch', version: 2, commands: [], cursor: 0, queue: [], comments: [] };
  const before = (await json({ path: '/api/state' })).data;
  const raw = await post('/api/project', rawProject);
  assert.equal(raw.status, 400, 'a raw project body is rejected before any mutation');
  assert.match(raw.data.error, /project field/);
  const missingContext = await post('/api/project', { project: rawProject });
  assert.equal(missingContext.status, 409, 'agent loads need context even on a fresh session');
  const after = (await json({ path: '/api/state' })).data;
  assert.equal(after.revision, before.revision, 'rejected loads never mutate');
  assert.deepEqual(after.document.marks, [], 'the fresh session stays empty');
  assert.deepEqual(after.comments, []);
});

test('valid commands commit immediately, comments pause, and projects roundtrip', async () => {
  const submitted = await post('/api/commands',
    { commands: [stroke([[10, 10], [400, 400]]), stroke([[500, 100], [900, 600]])],
      immediate: true, ...(await currentContext()) });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.data.document.marks.length, 2, 'immediate submit commits at once');
  assert.equal(submitted.data.playback.status, 'paused');
  const comment = await post('/api/comments', { requestId: 'req-http-1', text: 'thicken the trunk here',
    rect: null, expectedDocGeneration: submitted.data.docGeneration,
    expectedArtRevision: submitted.data.artRevision });
  assert.equal(comment.status, 200);
  assert.equal(comment.data.playback.status, 'paused', 'a comment keeps the painter paused');
  assert.equal(comment.data.comments.length, 1);
  const blocked = await post('/api/commands', { commands: [stroke([[2, 2]])], immediate: true });
  assert.equal(blocked.status, 409, 'a stale agent batch without grant context is rejected');
  const saved = (await json({ path: '/api/project' })).data;
  assert.equal(saved.format, 'codesketch');
  assert.equal(saved.version, 2);
  assert.equal(saved.commands.length, 2);
  assert.equal(saved.comments.length, 1);
  const reloaded = await post('/api/project', { project: saved, source: 'human',
    expectedDocGeneration: submitted.data.docGeneration });
  assert.equal(reloaded.status, 200);
  assert.deepEqual(reloaded.data.document, submitted.data.document, 'roundtrip preserves the art');
  assert.deepEqual(reloaded.data.comments.map(item => item.text), ['thicken the trunk here']);
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
  await post('/api/commands', { commands: [stroke([[5, 5]])], immediate: true, source: 'human',
    expectedDocGeneration: first.docGeneration });
  const second = (await json({ path: '/api/state' })).data;
  assert.ok(second.revision > first.revision, 'revision reflects new art');
  assert.equal(second.instanceId, first.instanceId, 'instance survives within one server');
});
