import { createServer } from 'node:http';
import { Session } from '../direction/index.mjs';
import { landscape } from '../compositions/index.mjs';
import { send, readJSON, trusted, serveStatic } from './http.mjs';
import { attachPersistence } from './persistence.mjs';

export async function createStudio({ root, persistence } = {}) {
  const session = new Session();
  const flush = persistence ? await attachPersistence(session, persistence) : async () => {};
  const server = createServer(async (request, response) => {
    try {
      if (!trusted(request, server.address().port)) return send(response, 403, { error: 'Only same-origin loopback requests are allowed' });
      const url = new URL(request.url, 'http://127.0.0.1');
      if (request.method === 'GET') {
        if (url.pathname === '/api/state') {
          const since = url.searchParams.get('since');
          const instanceId = url.searchParams.get('instanceId');
          if (since === String(session.revision) && instanceId === session.instanceId) {
            return send(response, 200, { unchanged: true });
          }
          return send(response, 200, session.snapshot());
        }
        if (url.pathname === '/api/project') return send(response, 200, session.project());
        return await serveStatic(response, url.pathname, root);
      }
      if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed' });
      const body = await readJSON(request);
      if (url.pathname === '/api/commands') session.submit(body);
      else if (url.pathname === '/api/control') session.control(body.action, body.speed);
      else if (url.pathname === '/api/feedback') session.addFeedback(body.text);
      else if (url.pathname === '/api/project') session.load(body);
      else if (url.pathname === '/api/demo') {
        session.control('new');
        session.submit({ commands: landscape(), play: false });
      } else return send(response, 404, { error: 'Not found' });
      await flush();
      send(response, 200, session.snapshot());
    } catch (error) {
      await flush();
      if (!response.headersSent) send(response, error.code === 'ENOENT' ? 404 : 400, { error: error.message });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.maxConnections = 32;
  const timer = setInterval(() => {
    try {
      session.tick(40);
    } catch (error) {
      session.status = 'paused';
      session.playbackError = error.message;
      session.changed();
    }
  }, 40);
  server.on('close', () => clearInterval(timer));
  return { server, session, flush };
}
