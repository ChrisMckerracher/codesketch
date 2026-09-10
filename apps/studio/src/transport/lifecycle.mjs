import { send } from './http.mjs';
import { validateLifecycle, authorizeLifecycle, readLifecycleStop } from './lifecycle-http.mjs';

const CLOSE_TIMEOUT_MS = 2000;
const NOT_READY = 'Lifecycle ownership is not published yet';
const FORBIDDEN = 'Lifecycle requests require authenticated loopback ownership';

export function createLifecycle({ server, session, flush, lifecycle }) {
  const config = lifecycle === undefined ? null : validateLifecycle(lifecycle);
  const managed = config !== null;
  let ready = false;
  let stopping = false;
  let stopOutcome = null;
  let closePromise = null;
  let closeTimer = null;
  let published = null;
  let boundPort = null;

  function markReady() {
    if (!managed) throw new Error('markReady requires managed lifecycle configuration');
    if (!server.listening) throw new Error('markReady requires a listening server');
    if (stopping) throw new Error('markReady cannot reopen readiness after stopping');
    if (ready) throw new Error('markReady must be called at most once');
    const address = server.address();
    if (address === null) throw new Error('markReady requires a bound server address');
    boundPort = address.port;
    published = { instanceId: session.instanceId, pid: process.pid,
      url: `http://127.0.0.1:${address.port}`, digest: config.digest };
    ready = true;
  }

  function gate() {
    if (stopping) throw Object.assign(new Error('The studio is stopping'), { statusCode: 503 });
    if (managed && !ready) throw Object.assign(new Error(NOT_READY), { statusCode: 503 });
  }

  function playbackSuspended() {
    return stopping || (managed && !ready);
  }

  function identity() {
    if (published) return published;
    const port = server.address()?.port;
    return { instanceId: session.instanceId, pid: process.pid,
      url: `http://127.0.0.1:${port ?? 0}`, digest: config?.digest ?? null };
  }

  function closeListener() {
    return new Promise(resolve => {
      server.close(() => {
        if (closeTimer) clearTimeout(closeTimer);
        closeTimer = null;
        resolve();
      });
      server.closeIdleConnections();
      closeTimer = setTimeout(() => server.closeAllConnections(), CLOSE_TIMEOUT_MS);
      closeTimer.unref();
    });
  }

  function finishStop() {
    if (!closePromise) closePromise = closeListener();
    return closePromise;
  }

  function requestStop() {
    if (!stopOutcome) {
      stopping = true;
      const attempt = (async () => {
        try {
          session.control('pause', undefined, { source: 'human' });
          await flush();
          return { ok: true };
        } catch (error) {
          return { ok: false, error };
        }
      })();
      stopOutcome = attempt.then(outcome => {
        if (!outcome.ok) {
          stopping = false;
          stopOutcome = null;
        }
        return outcome;
      });
    }
    return stopOutcome;
  }

  async function shutdown() {
    const outcome = await requestStop();
    if (!outcome.ok) throw Object.assign(outcome.error, { statusCode: 500 });
    await finishStop();
  }

  async function handle(request, response) {
    try {
      if (!managed) return send(response, 404, { error: 'Not found' });
      try {
        authorizeLifecycle(request, boundPort ?? server.address()?.port, config);
      } catch (error) {
        return send(response, 403, { error: FORBIDDEN });
      }
      const path = request.url.split('?')[0];
      if (path === '/api/lifecycle/status') {
        if (request.method !== 'GET') return send(response, 405, { error: 'Method not allowed' });
        if (!ready) return send(response, 503, { error: NOT_READY });
        return send(response, 200, { ...identity(), state: stopping ? 'stopping' : 'running' });
      }
      if (path === '/api/lifecycle/stop') {
        if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed' });
        if (!ready) return send(response, 503, { error: NOT_READY });
        let stopIdentity;
        try {
          stopIdentity = await readLifecycleStop(request, session.instanceId);
        } catch (error) {
          return send(response, error.statusCode ?? 400, { error: error.message });
        }
        const outcome = await requestStop();
        if (!outcome.ok) {
          return send(response, 500, { error: `Recovery could not be saved: ${outcome.error.message}` });
        }
        send(response, 200, { instanceId: stopIdentity, state: 'stopping' });
        finishStop();
        return;
      }
      return send(response, 404, { error: 'Not found' });
    } catch (error) {
      if (!response.headersSent) send(response, 500, { error: error.message });
    }
  }

  return { handle, markReady, shutdown, gate, playbackSuspended, get stopping() { return stopping; } };
}
