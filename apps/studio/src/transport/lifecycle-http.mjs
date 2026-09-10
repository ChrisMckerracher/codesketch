import { timingSafeEqual } from 'node:crypto';

const HEX64 = /^[0-9a-f]{64}$/;
const STOP_BUDGET_BYTES = 1024;

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

export function validateLifecycle(config) {
  const keys = config === null || typeof config !== 'object' || Array.isArray(config) ? [] : Object.keys(config);
  if (keys.length !== 2 || !keys.includes('capability') || !keys.includes('digest')) {
    throw httpError(400, 'Lifecycle config requires exactly the keys capability and digest');
  }
  for (const key of ['capability', 'digest']) {
    if (typeof config[key] !== 'string' || !HEX64.test(config[key])) {
      throw httpError(400, `Lifecycle ${key} must be a string of 64 lowercase hex characters`);
    }
  }
  return Object.freeze({ capability: config.capability, digest: config.digest });
}

export function authorizeLifecycle(request, port, config) {
  const forbidden = () => httpError(403,
    'Lifecycle requests require the loopback peer, exact loopback host, no browser metadata, and a valid capability header');
  const supplied = request.headers['x-codesketch-capability'];
  if (request.socket.remoteAddress !== '127.0.0.1' && request.socket.remoteAddress !== '::ffff:127.0.0.1') throw forbidden();
  if (request.headers.host !== `127.0.0.1:${port}`) throw forbidden();
  if (request.headers.origin !== undefined) throw forbidden();
  if (Object.keys(request.headers).some(name => name.startsWith('sec-fetch-'))) throw forbidden();
  if (typeof supplied !== 'string' || !HEX64.test(supplied)) throw forbidden();
  if (!timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(config.capability, 'hex'))) throw forbidden();
}

export async function readLifecycleStop(request, instanceId) {
  if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
    throw httpError(400, 'Content-Type must be application/json');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > STOP_BUDGET_BYTES) throw httpError(400, `Stop request exceeds ${STOP_BUDGET_BYTES} bytes`);
    chunks.push(chunk);
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw httpError(400, 'Stop request body must be well-formed JSON');
  }
  const shaped = body !== null && typeof body === 'object' && !Array.isArray(body) &&
    Object.keys(body).length === 1 && Object.hasOwn(body, 'instanceId');
  if (!shaped || typeof body.instanceId !== 'string' || !body.instanceId) {
    throw httpError(400, 'Stop requires JSON exactly {"instanceId":"<identity>"} with a nonempty identity string');
  }
  if (body.instanceId !== instanceId) {
    throw httpError(409, 'Stop identity does not match this studio instance');
  }
  return body.instanceId;
}
