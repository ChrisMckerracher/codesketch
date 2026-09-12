import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStudio } from '../src/transport/index.mjs';
import { StudioApi } from '../src/studio/api.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'codesketch-replies-'));
const recoveryFile = join(directory, 'recovery.json');
let studio = await createStudio({ root, persistence: recoveryFile });
let port;
await listen();

test.after(async () => {
  await closeStudio();
  await rm(directory, { recursive: true, force: true });
});

async function listen() {
  await new Promise(resolve => studio.server.listen(0, '127.0.0.1', resolve));
  port = studio.server.address().port;
}

async function closeStudio() {
  if (!studio) return;
  studio.server.closeAllConnections();
  studio.server.closeIdleConnections();
  await new Promise(resolve => studio.server.close(resolve));
  studio = null;
}

function request({ method = 'GET', path = '/', body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path,
      headers: body === undefined ? {} : { 'content-type': 'application/json' } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try {
          resolve({ status: response.statusCode, data: JSON.parse(text) });
        } catch (error) {
          reject(new Error(`Non-JSON ${response.statusCode} for ${method} ${path}: ${text.slice(0, 80)}`, { cause: error }));
        }
      });
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

const post = (path, body) => request({ method: 'POST', path, body });
const state = async () => (await request({ path: '/api/state' })).data;

test('reply route validates, dedupes stale retries, polls, and persists replies', async () => {
  const before = await state();
  const created = await post('/api/comments', { requestId: 'http-comment-1', text: 'review this', rect: null,
    expectedDocGeneration: before.docGeneration, expectedArtRevision: before.artRevision,
    expectedControlEpoch: before.controlEpoch });
  assert.equal(created.status, 200);
  const comment = created.data.comments[0];
  const baseline = await post('/api/comments/poll', { since: null });
  const input = { id: comment.id, requestId: 'http-reply-1', text: '  agent handled this\nKeep spacing  ', source: 'agent',
    expectedDocGeneration: created.data.docGeneration, expectedSeq: comment.seq };
  const first = await post('/api/comments/reply', input);
  assert.equal(first.status, 200);
  const stored = first.data.comments[0].replies[0];
  assert.deepEqual(stored, { id: stored.id, requestId: input.requestId, author: 'agent',
    text: input.text, at: stored.at });
  assert.equal(first.data.playback.status, 'paused');
  assert.equal(first.data.comments[0].status, 'open');
  assert.equal(first.data.artRevision, created.data.artRevision);
  assert.equal(first.data.controlEpoch, created.data.controlEpoch);
  assert.equal(first.data.requiresGrant, created.data.requiresGrant);
  assert.deepEqual(first.data.activeGrant, created.data.activeGrant);
  assert.equal(first.data.revision, created.data.revision + 1);

  const delta = await post('/api/comments/poll', { since: baseline.data.cursor });
  assert.equal(delta.status, 200);
  assert.equal(delta.data.reset, false);
  assert.deepEqual(delta.data.comments[0].replies, [stored]);
  assert.equal(JSON.parse(delta.data.cursor)[2], first.data.comments[0].seq);

  const retry = await post('/api/comments/reply', input);
  assert.equal(retry.status, 200);
  assert.deepEqual(retry.data.comments[0].replies, [stored]);
  assert.equal(retry.data.revision, first.data.revision, 'duplicate retry is side-effect free');
  const changed = await post('/api/comments/reply', { ...input, text: 'changed' });
  assert.equal(changed.status, 409);
  const staleGeneration = await post('/api/comments/reply', { ...input,
    expectedDocGeneration: 'stale-generation' });
  assert.equal(staleGeneration.status, 409);
  const missing = { ...input };
  delete missing.requestId;
  assert.equal((await post('/api/comments/reply', missing)).status, 400);
  assert.equal((await post('/api/comments/reply', { ...input, source: 'robot' })).status, 400);
  assert.equal((await post('/api/comments/reply', { ...input, extra: true })).status, 400);
  const durable = JSON.parse(await readFile(recoveryFile, 'utf8'));
  assert.deepEqual(durable.project.comments[0].replies, [stored]);

  await closeStudio();
  studio = await createStudio({ root, persistence: recoveryFile });
  await listen();
  const restored = await state();
  assert.deepEqual(restored.comments[0].replies, [stored], 'recovery retains reply data');
});

test('StudioApi.replyComment uses the current reply route and exact input', async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (path, init) => {
    calls.push({ path, body: JSON.parse(init.body) });
    return { ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify(clientSnapshot()) };
  };
  try {
    const input = { id: 'comment-1', requestId: 'api-reply-1', text: 'noted', source: 'human',
      expectedDocGeneration: 'generation-1', expectedSeq: 12 };
    await new StudioApi().replyComment(input);
  } finally {
    globalThis.fetch = original;
  }
  assert.deepEqual(calls, [{ path: '/api/comments/reply', body: {
    id: 'comment-1', requestId: 'api-reply-1', text: 'noted', source: 'human',
    expectedDocGeneration: 'generation-1', expectedSeq: 12,
  } }]);
});

function clientSnapshot() {
  return { instanceId: 'instance-1', revision: 1, artRevision: 0, docGeneration: 'generation-1',
    controlEpoch: 0, requiresGrant: false, activeGrant: null,
    document: { version: 1, width: 1000, height: 700, background: '#f7f3e8', layers: [
      { id: 'paint', name: 'Painting', visible: true, opacity: 1 }], marks: [] },
    playback: { status: 'paused', speed: 1, remaining: 0, active: null }, history: { cursor: 0, total: 0 },
    comments: [], storageError: null, playbackError: null, heartbeat: { lastSeenAt: null },
  };
}
