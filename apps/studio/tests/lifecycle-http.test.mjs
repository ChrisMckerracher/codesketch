import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { validateLifecycle, authorizeLifecycle, readLifecycleStop } from '../src/transport/lifecycle-http.mjs';

const capability = 'a'.repeat(64);
const digest = 'b'.repeat(64);
const instanceId = '01890a5d-ac96-774b-bcce-b302099a8057';
const serverPortHolder = { port: 0 };

async function withServer(handler, run) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  try {
    return await run(port);
  } finally {
    server.close();
    server.closeAllConnections?.();
  }
}

function post(port, headers, body) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, method: 'POST', headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null') }));
    });
    request.on('error', reject);
    request.end(body);
  });
}

function send(port, method, path, headers) {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, path, method, headers }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode,
        body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.on('error', reject);
    request.end();
  });
}
describe('lifecycle http helpers', () => {
  test('validateLifecycle accepts and freezes exactly the approved pair', () => {
    const config = validateLifecycle({ capability, digest });
    assert.deepEqual(config, { capability, digest });
    assert.ok(Object.isFrozen(config));
  });

  test('validateLifecycle rejects wrong shapes with statusCode 400', () => {
    const bad = [
      null, 'x', [], {}, { capability }, { digest }, { capability, digest, extra: 1 },
      { capability: 'A'.repeat(64), digest }, { capability: 'g'.repeat(64), digest },
      { capability: 'a'.repeat(63), digest }, { capability: 42, digest },
      { capability, digest: 'c'.repeat(65) }, { capability, digest: null },
    ];
    for (const config of bad) {
      assert.throws(() => validateLifecycle(config), error => error.statusCode === 400,
        `expected rejection for ${JSON.stringify(config)}`);
    }
  });

  test('authorizeLifecycle passes a clean loopback browser-free request', async () => {
    const config = validateLifecycle({ capability, digest });
    let authorized = false;
    let serverPort = 0;
    await withServer((request, response) => {
      authorizeLifecycle(request, serverPort, config);
      authorized = true;
      response.end('{}');
    }, async port => {
      serverPort = port;
      const result = await post(port, { host: `127.0.0.1:${port}`, 'x-codesketch-capability': capability }, '');
      assert.equal(result.status, 200);
      assert.equal(authorized, true);
    });
  });

  test('authorizeLifecycle complements real HTTP with peer unit cases', () => {
    const config = validateLifecycle({ capability, digest });
    const port = 49152;
    const headers = { host: `127.0.0.1:${port}`, 'x-codesketch-capability': capability };
    authorizeLifecycle({ socket: { remoteAddress: '::ffff:127.0.0.1' }, headers }, port, config);
    assert.throws(() => authorizeLifecycle({ socket: { remoteAddress: '192.168.1.5' }, headers }, port, config),
      error => error.statusCode === 403, 'a non-loopback peer is forbidden');
  });

  test('authorizeLifecycle rejects forbidden auth variants over real HTTP with 403', async () => {
    const config = validateLifecycle({ capability, digest });
    await withServer((request, response) => {
      try {
        authorizeLifecycle(request, serverPortHolder.port, config);
        response.end('{}');
      } catch (error) {
        response.writeHead(error.statusCode ?? 500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: error.message }));
      }
    }, async port => {
      serverPortHolder.port = port;
      const host = `127.0.0.1:${port}`;
      const cases = [
        ['missing capability', { host }],
        ['wrong capability', { host, 'x-codesketch-capability': 'b'.repeat(64) }],
        ['uppercase capability', { host, 'x-codesketch-capability': 'A'.repeat(64) }],
        ['short capability', { host, 'x-codesketch-capability': 'a'.repeat(63) }],
        ['localhost host', { host: `localhost:${port}`, 'x-codesketch-capability': capability }],
        ['same-origin origin', { host, 'x-codesketch-capability': capability, origin: `http://${host}` }],
        ['empty origin', { host, 'x-codesketch-capability': capability, origin: '' }],
        ['sec-fetch-mode', { host, 'x-codesketch-capability': capability, 'sec-fetch-mode': 'cors' }],
        ['sec-fetch-site', { host, 'x-codesketch-capability': capability, 'sec-fetch-site': 'same-origin' }],
        ['sec-fetch-dest', { host, 'x-codesketch-capability': capability, 'sec-fetch-dest': 'document' }],
      ];
      for (const [label, headers] of cases) {
        const result = await send(port, 'GET', '/api/lifecycle/status', headers);
        assert.equal(result.status, 403, `${label} must be forbidden`);
        assert.ok(!result.body.includes(capability), 'rejections never contain the capability');
      }
    });
  });

  test('readLifecycleStop consumes bounded bodies and enforces shape and identity', async () => {
    let received = null;
    await withServer(async (request, response) => {
      try {
        received = await readLifecycleStop(request, instanceId);
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: true }));
      } catch (error) {
        response.writeHead(error.statusCode ?? 500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: error.message }));
      }
    }, async port => {
      const good = await post(port, { 'content-type': 'application/json' }, JSON.stringify({ instanceId }));
      assert.equal(good.status, 200);
      assert.equal(received, instanceId, 'the validated identity is returned');

      const mismatch = await post(port, { 'content-type': 'application/json' }, JSON.stringify({ instanceId: 'other' }));
      assert.equal(mismatch.status, 409, 'a different identity is a conflict');

      const cases = [
        ['malformed JSON', '{"instanceId":'],
        ['array body', '[1]'],
        ['string body', '"identity"'],
        ['extra field', JSON.stringify({ instanceId, extra: true })],
        ['missing identity', '{}'],
        ['empty identity', JSON.stringify({ instanceId: '' })],
        ['non-string identity', JSON.stringify({ instanceId: 7 })],
        ['oversized body', JSON.stringify({ instanceId }) + ' '.repeat(2048)],
      ];
      for (const [label, body] of cases) {
        const result = await post(port, { 'content-type': 'application/json' }, body);
        assert.equal(result.status, 400, `${label} must be a bad request`);
        assert.ok(!`${result.body.error}`.includes(capability), 'errors never contain the capability');
      }
      const wrongType = await post(port, { 'content-type': 'text/plain' }, JSON.stringify({ instanceId }));
      assert.equal(wrongType.status, 400, 'a non-JSON content type is a bad request');
    });
  });
});
