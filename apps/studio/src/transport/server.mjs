import { createServer } from 'node:http';
import { Session } from '../direction/index.mjs';
import { landscape } from '../compositions/index.mjs';
import { send, readJSON, trusted, serveStatic } from './http.mjs';
import { attachPersistence } from './persistence.mjs';
import { createLifecycle } from './lifecycle.mjs';
import { checkHumanGeneration } from './human-context.mjs';
import { createCommentHeartbeat, heartbeatOf, resetHeartbeat, createComment, transitionComment,
  replyComment, pollComments } from './comments.mjs';

export async function createStudio({ root, persistence, lifecycle: options } = {}) {
  const session = new Session();
  const { flush } = persistence ? await attachPersistence(session, persistence) : { flush: async () => {} };
  const heartbeat = createCommentHeartbeat();
  const comments = { session, heartbeat, flush };
  let lifecycle = null;
  const server = createServer(async (request, response) => {
    try {
      if (!trusted(request, server.address().port)) return send(response, 403, { error: 'Only same-origin loopback requests are allowed' });
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname.startsWith('/api/lifecycle/')) {
        if (!lifecycle) return send(response, 404, { error: 'Not found' });
        return await lifecycle.handle(request, response);
      }
      if (request.method === 'GET') {
        if (url.pathname === '/api/state') {
          const since = url.searchParams.get('since');
          const instanceId = url.searchParams.get('instanceId');
          if (since === String(session.revision) && instanceId === session.instanceId) {
            return send(response, 200, { unchanged: true, ...heartbeatOf(heartbeat) });
          }
          return send(response, 200, { ...session.snapshot(), ...heartbeatOf(heartbeat) });
        }
        if (url.pathname === '/api/comments') return pollComments(response, comments, null);
        if (url.pathname === '/api/project') {
          const expectedInstanceIds = url.searchParams.getAll('expectedInstanceId');
          const expectedGenerations = url.searchParams.getAll('expectedDocGeneration');
          const hasInstance = expectedInstanceIds.length > 0;
          const hasGeneration = expectedGenerations.length > 0;
          if (hasInstance !== hasGeneration || expectedInstanceIds.length > 1 || expectedGenerations.length > 1
            || (hasInstance && (!expectedInstanceIds[0] || !expectedGenerations[0]))) {
            throw Object.assign(new Error('Project context query requires one expectedInstanceId and expectedDocGeneration'), { statusCode: 400 });
          }
          if (hasInstance && (expectedInstanceIds[0] !== session.instanceId
            || expectedGenerations[0] !== session.controlGrant.docGeneration)) {
            throw Object.assign(new Error('Project context is stale'), { statusCode: 409 });
          }
          return send(response, 200, session.project());
        }
        const target = request.url.split('?')[0].split('#')[0];
        return await serveStatic(response, target, root);
      }
      if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed' });
      lifecycle?.gate();
      const body = await readJSON(request);
      lifecycle?.gate();
      if (url.pathname === '/api/comments') return await createComment(response, comments, body);
      if (url.pathname === '/api/comments/ack') return await transitionComment(response, comments, 'ack', body);
      if (url.pathname === '/api/comments/address') return await transitionComment(response, comments, 'address', body);
      if (url.pathname === '/api/comments/resolve') return await transitionComment(response, comments, 'resolve', body);
      if (url.pathname === '/api/comments/reply') return await replyComment(response, comments, body);
      if (url.pathname === '/api/comments/poll') return pollComments(response, comments, body.since, { markSeen: true });
      if (url.pathname === '/api/commands') {
        checkHumanGeneration(body, session);
        session.submit(body);
      } else if (url.pathname === '/api/control') {
        checkHumanGeneration(body, session);
        session.control(body.action, body.speed, body);
      } else if (url.pathname === '/api/project') {
        if (body === null || typeof body !== 'object' || Array.isArray(body) ||
            !Object.prototype.hasOwnProperty.call(body, 'project')) {
          throw Object.assign(new Error('Expected a JSON object wrapping the project in a project field'),
            { statusCode: 400 });
        }
        checkHumanGeneration(body, session);
        session.load(body.project, body);
      } else if (url.pathname === '/api/demo') {
        checkHumanGeneration(body, session);
        session.control('new', undefined, body);
        session.submit({ commands: landscape(), play: false, source: 'human' });
      } else return send(response, 404, { error: 'Not found' });
      await flush();
      const generationChanged = url.pathname === '/api/project' || url.pathname === '/api/demo' ||
        (url.pathname === '/api/control' && body.action === 'new');
      if (generationChanged) resetHeartbeat(heartbeat);
      send(response, 200, { ...session.snapshot(), ...heartbeatOf(heartbeat) });
    } catch (error) {
      if (!response.headersSent) {
        const status = error.statusCode ?? (error.code === 'ENOENT' ? 404 : 400);
        send(response, status, { error: error.message });
      }
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.maxConnections = 32;
  lifecycle = createLifecycle({ server, session, flush, lifecycle: options });
  const timer = setInterval(() => {
    if (lifecycle.playbackSuspended()) return;
    try {
      session.tick(40);
    } catch (error) {
      session.status = 'paused';
      session.playbackError = error.message;
      session.changed();
    }
  }, 40);
  server.on('close', () => clearInterval(timer));
  return { server, session, flush, markReady: () => lifecycle.markReady(), shutdown: () => lifecycle.shutdown() };
}
