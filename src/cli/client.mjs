import { URL, URLSearchParams } from 'node:url';

const DEFAULT_BASE = 'http://127.0.0.1:4317';
export const MAX_RESPONSE_BYTES = 16 * 1024 * 1024; // 16 MiB
export const MAX_REQUEST_BYTES = 8 * 1024 * 1024;   // 8 MiB

export function getBaseUrl() {
  const raw = process.env.PAINT_URL || DEFAULT_BASE;
  const trimmed = raw.replace(/\/+$/, '');
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`PAINT_URL is not a valid URL: "${raw}"`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`PAINT_URL must use http: or https:, got "${parsed.protocol}"`);
  }
  const host = parsed.hostname;
  const isLoopback =
    host === '127.0.0.1' ||
    host === 'localhost' ||
    host === '::1' ||
    host === '[::1]';
  if (!isLoopback) {
    throw new Error(`PAINT_URL must target a loopback address, got "${host}"`);
  }
  return trimmed;
}

export async function request(path, options = {}) {
  const base = getBaseUrl();
  const url = new URL(path, base).toString();
  const timeoutMs = options.timeoutMs ?? 10_000;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  try {
    let response;
    try {
      response = await fetch(url, {
        ...options,
        redirect: 'error',
        signal: controller.signal,
      });
    } catch (error) {
      const code = error.cause?.code ?? error.name ?? 'FETCH_ERROR';
      const err = new Error(`request to ${url} failed (${code}: ${error.message})`);
      err.code = code;
      throw err;
    }

    let text = '';
    if (response.body) {
      let size = 0;
      const chunks = [];
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            throw new Error(`Response exceeds limit of ${MAX_RESPONSE_BYTES} bytes`);
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      text = Buffer.concat(chunks).toString('utf8');
    }

    let parsedJson;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      parsedJson = null;
    }

    if (!response.ok) {
      const detail = parsedJson?.error ?? text.slice(0, 300);
      const err = new Error(`${response.status} ${response.statusText}: ${detail}`);
      err.status = response.status;
      err.code = parsedJson?.error ? 'API_ERROR' : 'HTTP_ERROR';
      throw err;
    }
    return parsedJson ?? text;
  } finally {
    clearTimeout(timer);
  }
}

export async function get(path, params = {}, options = {}) {
  let search = '';
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length > 0) {
    const sp = new URLSearchParams();
    for (const [k, v] of entries) sp.append(k, String(v));
    search = `?${sp.toString()}`;
  }
  return request(`${path}${search}`, { method: 'GET', ...options });
}

export async function post(path, body = {}, options = {}) {
  const jsonStr = typeof body === 'string' ? body : JSON.stringify(body);
  if (Buffer.byteLength(jsonStr, 'utf8') > MAX_REQUEST_BYTES) {
    throw new Error(`Request body exceeds limit of ${MAX_REQUEST_BYTES} bytes`);
  }
  return request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: jsonStr,
    ...options,
  });
}
