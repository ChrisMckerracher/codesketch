// Studio HTTP client communicating with local loopback server

export class StudioApi {
  constructor({ onOfflineChange, onError, onReconnect } = {}) {
    this.onOfflineChange = onOfflineChange || (() => {});
    this.onError = onError || (() => {});
    this.onReconnect = onReconnect || (() => {});
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

  async request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(path, {
        signal: controller.signal,
        ...options,
        headers: {
          ...(options.headers || {}),
        },
      });
      clearTimeout(timer);
      this.setOffline(false);
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text || 'Invalid JSON response' };
      }
      if (!response.ok) {
        const message = data.error || `HTTP ${response.status} ${response.statusText}`;
        throw new Error(message);
      }
      return data;
    } catch (error) {
      clearTimeout(timer);
      const isNetError = error.name === 'AbortError' || error.name === 'TypeError';
      if (isNetError) {
        this.setOffline(true, 'Studio server unreachable. Check connection.');
      } else {
        this.onError(error.message);
      }
      throw error;
    }
  }

  async fetchState(sinceRevision = null, instanceId = null) {
    let query = '';
    if (sinceRevision !== null && sinceRevision >= 0 && instanceId) {
      query = `?since=${sinceRevision}&instanceId=${encodeURIComponent(instanceId)}`;
    }
    return await this.request(`/api/state${query}`);
  }

  async sendCommands(commands, { replace = false, play = true, immediate = false } = {}) {
    return await this.request('/api/commands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands, replace, play, immediate }),
    });
  }

  async sendControl(action, speed = null) {
    const payload = { action };
    if (action === 'speed' && speed !== null) {
      payload.speed = Number(speed);
    }
    return await this.request('/api/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  async sendFeedback(text) {
    return await this.request('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  }

  async fetchProject() {
    return await this.request('/api/project');
  }

  async loadProject(projectData) {
    return await this.request('/api/project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(projectData),
    });
  }

  async loadDemo() {
    return await this.request('/api/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  }
}
