import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../..');
const CAPTURE_HTML_PATH = resolve(import.meta.dirname, 'capture.html');
const RENDERING_INDEX_PATH = resolve(ROOT, 'src/painting/rendering/index.mjs');
const RENDERING_STROKE_PATH = resolve(ROOT, 'src/painting/rendering/stroke.mjs');

const CAPTURE_HTML_CODE = readFileSync(CAPTURE_HTML_PATH, 'utf8');
const RENDERING_INDEX_CODE = readFileSync(RENDERING_INDEX_PATH, 'utf8');
const RENDERING_STROKE_CODE = readFileSync(RENDERING_STROKE_PATH, 'utf8');

const HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

function isTrusted(req, port) {
  const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!allowedHosts.includes(req.headers.host)) return false;
  const origin = req.headers.origin;
  if (origin && !allowedHosts.some((host) => origin === `http://${host}`)) return false;
  const secFetchSite = req.headers['sec-fetch-site'];
  if (secFetchSite && !['same-origin', 'none'].includes(secFetchSite)) return false;
  return true;
}

export async function startCaptureServer(snapshotPayload) {
  const jsonBody = JSON.stringify(snapshotPayload);
  const sockets = new Set();
  let port = null;

  const server = createServer((req, res) => {
    if (!isTrusted(req, port)) {
      res.writeHead(403, { ...HEADERS, 'Content-Type': 'text/plain' });
      res.end('Forbidden: Only same-origin loopback requests are allowed');
      return;
    }

    if (req.method !== 'GET') {
      res.writeHead(405, { ...HEADERS, 'Content-Type': 'text/plain' });
      res.end('Method Not Allowed');
      return;
    }

    if (req.url === '/' || req.url === '/capture.html') {
      res.writeHead(200, { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8' });
      res.end(CAPTURE_HTML_CODE);
    } else if (req.url === '/snapshot.json') {
      res.writeHead(200, { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(jsonBody);
    } else if (req.url === '/painting/rendering/index.mjs') {
      res.writeHead(200, { ...HEADERS, 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(RENDERING_INDEX_CODE);
    } else if (req.url === '/painting/rendering/stroke.mjs') {
      res.writeHead(200, { ...HEADERS, 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(RENDERING_STROKE_CODE);
    } else {
      res.writeHead(404, { ...HEADERS, 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', resolve);
    server.on('error', reject);
  });

  port = server.address().port;
  const url = `http://127.0.0.1:${port}/capture.html`;

  const close = async () => {
    try { server.closeAllConnections?.(); } catch {}
    for (const socket of sockets) {
      try { socket.destroy(); } catch {}
    }
    sockets.clear();
    await new Promise((resolve) => server.close(resolve));
  };

  return { url, port, close };
}
