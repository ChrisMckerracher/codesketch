// Studio HTTP client communicating with local loopback server

import { snapshotProblem, projectProblem, stateReadExpect, protocolError } from './response.mjs';

const DEFAULT_TIMEOUT_MS = 10000;
const OFFLINE_MESSAGE = 'Studio server unreachable. Check connection.';

function normalizeTimeoutMs(value) {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError('timeoutMs must be a positive finite number');
  }
  return value;
}

function requireGeneration(expectedDocGeneration) {
  if (typeof expectedDocGeneration !== 'string' || !expectedDocGeneration) {
    throw Object.assign(new TypeError('expectedDocGeneration must be a nonempty string'), { code: 'INVALID_INPUT' });
  }
  return expectedDocGeneration;
}

function requireInstanceId(expectedInstanceId) {
  if (typeof expectedInstanceId !== 'string' || !expectedInstanceId) {
    throw Object.assign(new TypeError('expectedInstanceId must be a nonempty string'), { code: 'INVALID_INPUT' });
  }
  return expectedInstanceId;
}

function errorBodyMessage(data, text, response) {
  if (typeof data === 'object' && data !== null && !Array.isArray(data) && typeof data.error === 'string' && data.error) {
    return data.error;
  }
  if (data === undefined && text) return text;
  return `HTTP ${response.status} ${response.statusText}`;
}

export class StudioApi {
  constructor({ onOfflineChange, onError, onReconnect, timeoutMs } = {}) {
    this.onOfflineChange = onOfflineChange || (() => {});
    this.onError = onError || (() => {});
    this.onReconnect = onReconnect || (() => {});
    this.timeoutMs = normalizeTimeoutMs(timeoutMs);
    this.nextConnectionIssue = 1;
    this.appliedConnectionIssue = 0;
    this.isOffline = false;
  }

  setOffline(offline, error = null) {
    const wasOffline = this.isOffline;
    if (wasOffline !== offline) {
      this.isOffline = offline;
      this.onOfflineChange(offline);
      if (wasOffline && !offline) {
        this.onReconnect();
      }
    }
    if (error) {
      this.onError(error);
    }
  }

  async request(path, { signal = null, expect = null, ...options } = {}) {
    const issue = this.nextConnectionIssue++;
    const applyConnection = (offline, error = null) => {
      if (issue < this.appliedConnectionIssue) return;
      this.appliedConnectionIssue = issue;
      this.setOffline(offline, error);
    };
    const reserveConnection = () => {
      this.appliedConnectionIssue = Math.max(this.appliedConnectionIssue, issue);
    };
    const controller = new AbortController();
    let timedOut = false;
    let callerCancelled = false;
    const onCallerAbort = () => {
      callerCancelled = true;
      controller.abort();
    };
    if (signal) {
      if (signal.aborted) onCallerAbort();
      else signal.addEventListener('abort', onCallerAbort, { once: true });
    }
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      const response = await fetch(path, { ...options, signal: controller.signal });
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = undefined;
      }
      if (!response.ok) {
        const error = new Error(errorBodyMessage(data, text, response));
        error.status = response.status;
        applyConnection(false);
        throw error;
      }
      if (data === undefined) {
        reserveConnection();
        throw protocolError(text ? 'Malformed JSON in successful response' : 'Empty response body');
      }
      if (expect) {
        const problem = expect(data);
        if (problem) {
          reserveConnection();
          throw protocolError(`Invalid response from ${path}: ${problem}`);
        }
      }
      applyConnection(false);
      return data;
    } catch (error) {
      if (callerCancelled) throw error;
      if (timedOut || error.name === 'TypeError') {
        applyConnection(true, OFFLINE_MESSAGE);
      } else {
        this.onError(error.message);
      }
      throw error;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onCallerAbort);
    }
  }

  async fetchState(sinceRevision = null, instanceId = null) {
    let query = '';
    if (sinceRevision !== null && sinceRevision >= 0 && instanceId) {
      query = `?since=${sinceRevision}&instanceId=${encodeURIComponent(instanceId)}`;
    }
    return await this.request(`/api/state${query}`, { expect: stateReadExpect(query !== '') });
  }

  async sendCommands(commands, { expectedDocGeneration, replace = false, play = true, immediate = false } = {}) {
    requireGeneration(expectedDocGeneration);
    return await this.request('/api/commands', {
      expect: snapshotProblem,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands, replace, play, immediate, source: 'human', expectedDocGeneration }),
    });
  }

  async sendControl(action, context = {}) {
    if (typeof context !== 'object' || context === null || Array.isArray(context)) {
      throw Object.assign(new TypeError('sendControl expects a {expectedDocGeneration, speed} options object'), { code: 'INVALID_INPUT' });
    }
    const { expectedDocGeneration, speed } = context;
    requireGeneration(expectedDocGeneration);
    const payload = { action, source: 'human', expectedDocGeneration };
    if (action === 'speed' && speed !== undefined) {
      payload.speed = Number(speed);
    }
    return await this.request('/api/control', {
      expect: snapshotProblem,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async createComment({ requestId, text, rect, continuePlayback, expectedDocGeneration,
    expectedArtRevision, expectedControlEpoch }) {
    return await this.request('/api/comments', {
      expect: snapshotProblem,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId,
        text,
        rect,
        continuePlayback,
        expectedDocGeneration,
        expectedArtRevision,
        expectedControlEpoch,
      }),
    });
  }

  async replyComment({ id, requestId, text, source, expectedDocGeneration, expectedSeq }) {
    requireGeneration(expectedDocGeneration);
    return await this.request('/api/comments/reply', {
      expect: snapshotProblem,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, requestId, text, source, expectedDocGeneration, expectedSeq }),
    });
  }

  async resolveComment({ id, reopen, expectedDocGeneration, expectedSeq }) {
    return await this.request('/api/comments/resolve', {
      expect: snapshotProblem,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, reopen, source: 'human', expectedDocGeneration, expectedSeq }),
    });
  }

  async fetchProject({ expectedInstanceId, expectedDocGeneration } = {}) {
    const instanceId = requireInstanceId(expectedInstanceId);
    const generation = requireGeneration(expectedDocGeneration);
    const query = `?expectedInstanceId=${encodeURIComponent(instanceId)}&expectedDocGeneration=${encodeURIComponent(generation)}`;
    return await this.request(`/api/project${query}`, { expect: projectProblem });
  }

  async loadProject(projectData, { expectedDocGeneration } = {}) {
    requireGeneration(expectedDocGeneration);
    return await this.request('/api/project', {
      expect: snapshotProblem,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: projectData, source: 'human', expectedDocGeneration }),
    });
  }

  async loadDemo({ expectedDocGeneration } = {}) {
    requireGeneration(expectedDocGeneration);
    return await this.request('/api/demo', {
      expect: snapshotProblem,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'human', expectedDocGeneration }),
    });
  }
}
