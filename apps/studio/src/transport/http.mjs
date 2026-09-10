import { readFile, realpath } from 'node:fs/promises';
import { resolve, sep, extname, join } from 'node:path';
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

const STYLESHEETS = new Set(['tokens', 'workspace', 'controls', 'layers', 'inspector', 'stage', 'feedback']);

async function containedDirectory(root, relative) {
  const canonicalRoot = await realpath(root);
  const expected = join(canonicalRoot, relative);
  const actual = await realpath(expected);
  return actual === expected ? expected : null;
}

async function servePublicFile(response, root, filename, mime) {
  let publicDir;
  try {
    publicDir = await containedDirectory(root, 'public');
  } catch (error) {
    if (error?.code === 'ENOENT') return send(response, 404, { error: 'Not found' });
    throw error;
  }
  if (!publicDir) return send(response, 404, { error: 'Not found' });
  const expected = join(publicDir, filename);
  let actual;
  try {
    actual = await realpath(expected);
  } catch (error) {
    if (error?.code === 'ENOENT') return send(response, 404, { error: 'Not found' });
    throw error;
  }
  if (actual !== expected) return send(response, 404, { error: 'Not found' });
  const data = await readFile(actual);
  response.writeHead(200, { ...headers, 'Content-Type': `${mime}; charset=utf-8` });
  response.end(data);
}

export async function serveStatic(response, pathname, root) {
  let path;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return send(response, 404, { error: 'Not found' });
  }
  if (path.includes('\0')) return send(response, 404, { error: 'Not found' });
  const segments = path.split('/');
  if (path.includes('\\') || segments.some(segment => segment === '.' || segment === '..')) {
    return send(response, 404, { error: 'Not found' });
  }
  if (path === '/' || path === '/public/index.html') {
    return servePublicFile(response, root, 'index.html', 'text/html');
  }
  const stylesheet = /^\/public\/([a-z]+)\.css$/.exec(path);
  if (stylesheet && STYLESHEETS.has(stylesheet[1])) {
    return servePublicFile(response, root, `${stylesheet[1]}.css`, 'text/css');
  }
  if (!/^\/src\/(studio|painting)\//.test(path)) return send(response, 404, { error: 'Not found' });
  const filename = resolve(root, `.${path}`);
  const allowed = [];
  try {
    for (const folder of ['src/studio', 'src/painting']) {
      const directory = await containedDirectory(root, folder);
      if (directory) allowed.push(directory + sep);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
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
