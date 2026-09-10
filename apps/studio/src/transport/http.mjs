import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { MAX_IMPORT_BYTES } from '../direction/index.mjs';

export const headers = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store', 'Cross-Origin-Resource-Policy': 'same-origin',
};

export function send(response, status, value) {
  response.writeHead(status, { ...headers, 'Content-Type': 'application/json' });
  response.end(JSON.stringify(value));
}

export async function readJSON(request) {
  if (request.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new Error('Content-Type must be application/json');
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_IMPORT_BYTES) throw new Error('Request exceeds 8 MiB');
    chunks.push(chunk);
  }
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Expected a JSON object');
  return data;
}

export function trusted(request, port) {
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!hosts.includes(request.headers.host)) return false;
  const origin = request.headers.origin;
  if (origin && !hosts.some(host => origin === `http://${host}`)) return false;
  return !request.headers['sec-fetch-site'] || ['same-origin', 'none'].includes(request.headers['sec-fetch-site']);
}

export async function serveStatic(response, pathname, root) {
  const path = decodeURIComponent(pathname);
  if (!/^\/src\/(studio|painting)\//.test(path) || path.includes('\0')) return send(response, 404, { error: 'Not found' });
  const filename = resolve(root, `.${path}`);
  const allowed = ['src/studio', 'src/painting'].map(folder => resolve(root, folder) + sep);
  let actual;
  try {
    actual = await realpath(filename);
  } catch (error) {
    if (error?.code === 'ENOENT') return send(response, 404, { error: 'Not found' });
    throw error;
  }
  if (!allowed.some(folder => actual.startsWith(folder))) return send(response, 404, { error: 'Not found' });
  const mime = { '.mjs': 'text/javascript' }[extname(actual)];
  if (!mime) return send(response, 404, { error: 'Not found' });
  const data = await readFile(actual);
  response.writeHead(200, { ...headers, 'Content-Type': `${mime}; charset=utf-8` });
  response.end(data);
}
