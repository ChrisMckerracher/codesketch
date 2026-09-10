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
const state = async () => (await json({ path: '/api/state' })).data;
const fresh = async () => post('/api/control', { action: 'new', source: 'human', ...(await context()) });
const isISO = value => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const context = async () => {
  const s = await state();
  return { expectedDocGeneration: s.docGeneration, epoch: s.controlEpoch, grantToken: s.activeGrant?.grantToken };
};

test('comment posts validate requestId and generation, then dedupe identical retries', async () => {
  const s0 = await state();
  const missing = await post('/api/comments', { text: 'no request id' });
  assert.equal(missing.status, 400);
  assert.match(missing.data.error, /requestId/);
  const long = await post('/api/comments', { requestId: 'x'.repeat(81), text: 'long' });
  assert.equal(long.status, 400);
  const omittedGen = await post('/api/comments', { requestId: 'no-gen', text: 'sky', rect: null,
    expectedArtRevision: s0.artRevision });
  assert.equal(omittedGen.status, 400, 'omitted generation is a malformed request');
  const malformedGen = await post('/api/comments', { requestId: 'bad-gen', text: 'sky', rect: null,
    expectedDocGeneration: 'g'.repeat(81), expectedArtRevision: s0.artRevision });
  assert.equal(malformedGen.status, 400, 'oversized generation is a malformed request');
  const stale = await post('/api/comments', { requestId: 'stale-1', text: 'sky', rect: null,
    expectedDocGeneration: 'previous-generation', expectedArtRevision: s0.artRevision });
  assert.equal(stale.status, 409, 'a well-formed stale generation is a conflict');
  const created = await post('/api/comments', { requestId: 'http-req-1', text: '  check the sky  ',
    rect: { x: 1, y: 2, width: 3, height: 4 }, continuePlayback: false,
    expectedDocGeneration: s0.docGeneration, expectedArtRevision: s0.artRevision });
  assert.equal(created.status, 200);
  assert.equal(created.data.playback.status, 'paused', 'comments pause the painter');
  const comment = created.data.comments[0];
  assert.equal(comment.text, 'check the sky');
  assert.equal(comment.status, 'open');
  assert.equal(comment.number, 1);
  assert.equal(comment.seq, 1);
  assert.deepEqual(comment.rect, { x: 1, y: 2, width: 3, height: 4 });
  assert.equal(comment.artRevision, s0.artRevision);
  assert.deepEqual(comment.visibleLayers, [{ id: 'paint', opacity: 1 }]);
  assert.equal(comment.request.id, 'http-req-1');
  assert.ok(isISO(comment.at));
  const retry = await post('/api/comments', { requestId: 'http-req-1', text: 'check the sky',
    rect: { x: 1, y: 2, width: 3, height: 4 }, continuePlayback: false,
    expectedDocGeneration: s0.docGeneration, expectedArtRevision: s0.artRevision });
  assert.equal(retry.status, 200);
  assert.equal(retry.data.comments.length, 1, 'identical retry dedupes');
  const changed = await post('/api/comments', { requestId: 'http-req-1', text: 'changed', rect: null,
    expectedDocGeneration: s0.docGeneration, expectedArtRevision: s0.artRevision });
  assert.equal(changed.status, 409);
});

test('visible layers come from the server document, not the caller', async () => {
  assert.equal((await fresh()).status, 200);
  const prepared = await post('/api/commands', { commands: [
    { type: 'layer.add', id: 'sketch', name: 'Sketch' },
    { type: 'layer.update', id: 'sketch', visible: false },
    stroke([[10, 10], [400, 400]]) ], immediate: true, ...(await context()) });
  assert.equal(prepared.status, 200);
  const s = await state();
  const created = await post('/api/comments', { requestId: 'http-req-2', text: 'layers look flat',
    rect: null, expectedDocGeneration: s.docGeneration, expectedArtRevision: s.artRevision });
  assert.equal(created.status, 200);
  const comment = created.data.comments.find(item => item.request?.id === 'http-req-2');
  assert.deepEqual(comment.visibleLayers, [{ id: 'paint', opacity: 1 }],
    'hidden sketch layer must not appear');
  assert.equal(comment.cursor, prepared.data.history.cursor);
});

test('a comment pauses with queue kept, continuePlayback clears it and grants the agent', async () => {
  assert.equal((await fresh()).status, 200);
  const queued = await post('/api/commands', { commands: [stroke([[5, 5]]), stroke([[9, 9]])],
    play: false, ...(await context()) });
  assert.equal(queued.status, 200);
  assert.equal(queued.data.playback.remaining, 2);
  const s = await state();
  const created = await post('/api/comments', { requestId: 'http-req-3', text: 'wrong direction',
    rect: null, expectedDocGeneration: s.docGeneration, expectedArtRevision: s.artRevision });
  assert.equal(created.status, 200);
  assert.equal(created.data.playback.status, 'paused');
  assert.equal(created.data.playback.remaining, 2, 'the queue is preserved for review');
  assert.equal(created.data.requiresGrant, true, 'human input revokes the agent grant');
  const agentWrite = await post('/api/commands', { commands: [stroke([[1, 1]])] });
  assert.equal(agentWrite.status, 409, 'agent needs a grant after human input');
  const redirect = await post('/api/comments', { requestId: 'http-req-3b', text: 'try downward instead',
    rect: null, continuePlayback: true, expectedDocGeneration: s.docGeneration,
    expectedArtRevision: s.artRevision });
  assert.equal(redirect.status, 200);
  assert.equal(redirect.data.playback.status, 'paused');
  assert.equal(redirect.data.playback.remaining, 0, 'continuePlayback clears pending work');
  const grant = redirect.data.activeGrant;
  assert.ok(grant && grant.grantToken, 'continuePlayback issues a control grant');
  const resumed = await post('/api/commands', { commands: [stroke([[20, 20]])], source: 'agent',
    epoch: grant.controlEpoch, grantToken: grant.grantToken,
    expectedDocGeneration: redirect.data.docGeneration });
  assert.equal(resumed.status, 200, 'the granted agent may paint again');
  assert.equal(resumed.data.playback.status, 'playing');
  const demo = await post('/api/demo', { source: 'human', ...(await context()) });
  assert.equal(demo.status, 200);
  assert.equal(demo.data.playback.status, 'paused');
  assert.ok(demo.data.playback.remaining > 0, 'demo loads its paused queue');
  assert.equal(demo.data.heartbeat.lastSeenAt, null, 'demo generation clears the heartbeat');
});

test('lifecycle transitions over HTTP: idempotency, stale 409, reopen, 404 and 400', async () => {
  await post('/api/control', { action: 'pause' });
  const s = await state();
  const gen = s.docGeneration;
  const created = await post('/api/comments', { requestId: 'http-req-4', text: 'lifecycle',
    rect: null, expectedDocGeneration: gen, expectedArtRevision: s.artRevision });
  const { id, seq } = created.data.comments.find(item => item.request?.id === 'http-req-4');
  const ack = await post('/api/comments/ack', { id, expectedSeq: seq, expectedDocGeneration: gen });
  assert.equal(ack.status, 200);
  const acked = ack.data.comments.find(item => item.id === id);
  assert.equal(acked.status, 'acknowledged');
  const repeat = await post('/api/comments/ack', { id, expectedSeq: acked.seq, expectedDocGeneration: gen });
  assert.equal(repeat.status, 200);
  assert.equal(repeat.data.comments.find(item => item.id === id).seq, acked.seq, 'repeat is idempotent');
  const stale = await post('/api/comments/ack', { id, expectedSeq: acked.seq + 9, expectedDocGeneration: gen });
  assert.equal(stale.status, 409, 'stale expectedSeq is a conflict');
  const addressed = await post('/api/comments/address', { id, expectedSeq: acked.seq, expectedDocGeneration: gen });
  assert.equal(addressed.status, 200);
  const addressedItem = addressed.data.comments.find(item => item.id === id);
  const resolved = await post('/api/comments/resolve', { id, expectedSeq: addressedItem.seq, expectedDocGeneration: gen });
  assert.equal(resolved.data.comments.find(item => item.id === id).status, 'resolved');
  const resolvedSeq = resolved.data.comments.find(item => item.id === id).seq;
  const reopened = await post('/api/comments/resolve', { id, expectedSeq: resolvedSeq, reopen: true, expectedDocGeneration: gen });
  assert.equal(reopened.status, 200);
  const reopenedItem = reopened.data.comments.find(item => item.id === id);
  assert.equal(reopenedItem.status, 'open');
  assert.equal(reopenedItem.acknowledgedAt, null);
  assert.equal(reopenedItem.resolvedAt, null);
  const ghost = await post('/api/comments/resolve', { id: 'ghost', expectedSeq: 1, expectedDocGeneration: gen });
  assert.equal(ghost.status, 404);
  const badReopen = await post('/api/comments/resolve', { id, expectedSeq: reopenedItem.seq, reopen: 'yes', expectedDocGeneration: gen });
  assert.equal(badReopen.status, 400);
  const staleGen = await post('/api/comments/ack', { id, expectedSeq: reopenedItem.seq, expectedDocGeneration: 'old-generation' });
  assert.equal(staleGen.status, 409, 'lifecycle under a stale generation is a conflict');
  const omittedGen = await post('/api/comments/ack', { id, expectedSeq: reopenedItem.seq });
  assert.equal(omittedGen.status, 400, 'lifecycle requires a well-formed generation');
});

test('only polls mark the heartbeat; reads and lifecycle never do; new clears it', async () => {
  await fresh();
  let s = await state();
  assert.equal(s.heartbeat.lastSeenAt, null, 'new clears any stale heartbeat');
  const created = await post('/api/comments', { requestId: 'http-req-5', text: 'heartbeat probe',
    rect: null, expectedDocGeneration: s.docGeneration, expectedArtRevision: s.artRevision });
  assert.equal(created.status, 200);
  assert.equal(created.data.heartbeat.lastSeenAt, null, 'create must not imply listening');
  const createdItem = created.data.comments.find(item => item.request?.id === 'http-req-5');
  const ack = await post('/api/comments/ack', { id: createdItem.id, expectedSeq: createdItem.seq,
    expectedDocGeneration: s.docGeneration });
  assert.equal(ack.data.heartbeat.lastSeenAt, null, 'lifecycle must not imply listening');
  const listed = await json({ path: '/api/comments' });
  assert.equal(listed.data.reset, true);
  assert.equal(listed.data.heartbeat.lastSeenAt, null, 'list GET never marks');
  const stateAgain = await state();
  assert.equal(stateAgain.heartbeat.lastSeenAt, null, 'state GET never marks');
  const match = await json({ path:
    `/api/state?since=${stateAgain.revision}&instanceId=${encodeURIComponent(stateAgain.instanceId)}` });
  assert.equal(match.data.unchanged, true);
  assert.ok('heartbeat' in match.data, 'unchanged replies include the heartbeat');
  const revision = stateAgain.revision;
  const poll = await post('/api/comments/poll', { since: null });
  assert.equal(poll.status, 200);
  assert.equal(poll.data.reset, true);
  assert.ok(isISO(poll.data.heartbeat.lastSeenAt), 'poll POST marks the heartbeat');
  const afterPoll = await state();
  assert.equal(afterPoll.revision, revision, 'polling never mutates the session');
  await fresh();
  const cleared = await state();
  assert.equal(cleared.heartbeat.lastSeenAt, null, 'new clears the listening heartbeat');
});

test('poll cursors survive until load or new, and projects roundtrip comments', async () => {
  const s = await state();
  await post('/api/comments', { requestId: 'http-req-6', text: 'save me', rect: null,
    expectedDocGeneration: s.docGeneration, expectedArtRevision: s.artRevision });
  const first = await post('/api/comments/poll', { since: null });
  const cursor = first.data.cursor;
  assert.equal(first.data.reset, true);
  assert.ok(first.data.comments.some(item => item.request?.id === 'http-req-6'));
  const quiet = await post('/api/comments/poll', { since: cursor });
  assert.deepEqual(quiet.data.comments, []);
  assert.equal(quiet.data.reset, false);
  const beforeLoad = await state();
  const saved = (await json({ path: '/api/project' })).data;
  assert.equal(saved.version, 2);
  assert.ok(Array.isArray(saved.comments) && saved.comments.length >= 1, 'projects store comments');
  const loaded = await post('/api/project', { project: saved, source: 'human',
    expectedDocGeneration: beforeLoad.docGeneration });
  assert.equal(loaded.status, 200);
  assert.deepEqual(loaded.data.document, beforeLoad.document, 'art survives the roundtrip');
  assert.equal(loaded.data.heartbeat.lastSeenAt, null, 'load clears the listening heartbeat');
  const afterLoad = await post('/api/comments/poll', { since: cursor });
  assert.equal(afterLoad.data.reset, true, 'the loaded generation resets old cursors');
  assert.ok(afterLoad.data.comments.some(item => item.text === 'save me'),
    'comments survive the roundtrip');
  assert.ok(afterLoad.data.comments.every(item => item.request === null),
    'load clears request metadata for the new generation');
  await fresh();
  const afterNew = await post('/api/comments/poll', { since: null });
  assert.equal(afterNew.data.reset, true);
  assert.deepEqual(afterNew.data.comments, []);
  const badSince = await post('/api/comments/poll', { since: 5 });
  assert.equal(badSince.status, 400);
  const longSince = await post('/api/comments/poll', { since: 'x'.repeat(257) });
  assert.equal(longSince.status, 400);
});

test('retired feedback endpoint is gone and snapshots carry no feedback projection', async () => {
  await fresh();
  const feedback = await post('/api/feedback', { text: 'legacy note' });
  assert.equal(feedback.status, 404, 'the feedback endpoint is retired');
  const s = await state();
  assert.equal(s.feedback, undefined, 'snapshots no longer carry a feedback projection');
  assert.deepEqual(s.comments, []);
});
