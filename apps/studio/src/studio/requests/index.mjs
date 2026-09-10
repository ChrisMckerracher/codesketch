const VALIDATION_STATUSES = new Set([400, 403, 404, 405, 413]);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function stale(message) {
  return Object.assign(new Error(message), { outcome: 'stale' });
}

function validation(message) {
  return Object.assign(new Error(message), { outcome: 'validation' });
}

function classify(error) {
  if (error && error.code === 'INVALID_INPUT') return 'validation';
  if (!error || typeof error.status !== 'number') return 'uncertain';
  if (error.status === 409) return 'stale';
  if (VALIDATION_STATUSES.has(error.status)) return 'validation';
  return 'uncertain';
}

function labeled(error, outcome) {
  if (error && typeof error === 'object') error.outcome = outcome;
  return error;
}

export class StudioRequests {
  constructor({ api, acceptSnapshot, onHeartbeat } = {}) {
    this.api = api;
    this.acceptSnapshot = acceptSnapshot || (() => false);
    this.onHeartbeat = onHeartbeat || (() => {});
    this.snapshot = null;
    this.identity = null;
    this.revision = -1;
    this.synchronized = false;
    this.invalidationCounter = 0;
    this.pending = [];
    this.sent = null;
    this.readPromise = null;
    this.readAgain = false;
    this.forceFull = false;
    this.pauseKey = null;
    this.pausePromise = null;
    this.lastSeenAt = null;
  }

  observe(snapshot) {
    if (!this.acceptSnapshot(snapshot)) return false;
    const rotated = !this.identity || this.identity.instanceId !== snapshot.instanceId ||
      this.identity.docGeneration !== snapshot.docGeneration;
    this.snapshot = snapshot;
    this.identity = { instanceId: snapshot.instanceId, docGeneration: snapshot.docGeneration };
    this.revision = snapshot.revision;
    this.synchronized = true;
    if (rotated) {
      this.invalidationCounter += 1;
      this.lastSeenAt = null;
      this.#cancelUnsent();
    }
    const stamp = snapshot.heartbeat && typeof snapshot.heartbeat === 'object'
      ? snapshot.heartbeat.lastSeenAt : null;
    if (typeof stamp === 'string' && stamp && (!this.lastSeenAt || stamp > this.lastSeenAt)) {
      this.lastSeenAt = stamp;
    }
    return true;
  }

  invalidate() {
    this.invalidationCounter += 1;
    this.synchronized = false;
    this.#cancelUnsent();
    if (this.readPromise) {
      this.readAgain = true;
      this.forceFull = true;
    }
  }

  readState() {
    if (!this.readPromise) this.readPromise = this.#readCycle();
    return this.readPromise;
  }

  mutate({ expectedDocGeneration, run }) {
    if (typeof expectedDocGeneration !== 'string' || !expectedDocGeneration || typeof run !== 'function') {
      return Promise.reject(validation('mutate requires an expectedDocGeneration string and a run function'));
    }
    if (!this.synchronized || !this.snapshot) {
      return Promise.reject(stale('Coordinator is not synchronized; refresh required'));
    }
    const entry = {
      kind: 'mutate',
      expectedDocGeneration,
      run,
      instanceId: this.snapshot.instanceId,
      deferred: deferred(),
    };
    this.pending.push(entry);
    this.#dispatch();
    return entry.deferred.promise;
  }

  pause({ expectedDocGeneration }) {
    if (typeof expectedDocGeneration !== 'string' || !expectedDocGeneration) {
      return Promise.reject(validation('pause requires an expectedDocGeneration string'));
    }
    if (!this.snapshot) {
      return Promise.reject(stale('Coordinator has no current session; refresh required'));
    }
    const instanceId = this.snapshot.instanceId;
    const key = `${instanceId}:${expectedDocGeneration}`;
    if (this.pausePromise) {
      return this.pauseKey === key ? this.pausePromise : Promise.reject(stale('Another pause is already pending'));
    }
    const entry = {
      kind: 'pause',
      expectedDocGeneration,
      instanceId,
      priority: true,
      deferred: deferred(),
    };
    this.pauseKey = key;
    this.pausePromise = entry.deferred.promise;
    this.#cancelUnsent();
    this.pending.push(entry);
    this.#dispatch();
    return entry.deferred.promise;
  }

  #cancelUnsent() {
    const waiting = this.pending;
    this.pending = [];
    for (const entry of waiting) {
      if (entry.kind === 'pause') {
        this.pending.push(entry);
        continue;
      }
      entry.deferred.reject(stale('Cancelled before dispatch; refresh required'));
    }
  }

  #dispatch() {
    if (this.sent || !this.pending.length) return;
    const index = this.pending.findIndex((entry) => entry.priority);
    const entry = this.pending.splice(index === -1 ? 0 : index, 1)[0];
    const unsynchronized = entry.kind !== 'pause' && !this.synchronized;
    const mismatch = !this.identity || this.identity.instanceId !== entry.instanceId ||
      this.identity.docGeneration !== entry.expectedDocGeneration;
    if (unsynchronized || mismatch) {
      entry.deferred.reject(stale('Superseded before dispatch; refresh required'));
      if (entry.kind === 'pause') {
        this.pausePromise = null;
        this.pauseKey = null;
      }
      this.#dispatch();
      return;
    }
    this.sent = entry;
    const settled = entry.kind === 'pause' ? this.#runPause(entry) : this.#runMutate(entry);
    settled.then(() => {}, () => {}).then(() => {
      if (this.sent === entry) this.sent = null;
      if (entry.kind === 'pause') {
        this.pausePromise = null;
        this.pauseKey = null;
      }
      this.#dispatch();
    });
  }

  async #runMutate(entry) {
    let result;
    try {
      result = await entry.run(this.api);
    } catch (error) {
      if (!error || typeof error !== 'object' || error.outcome === undefined) {
        labeled(error, classify(error));
      }
      const outcome = error && typeof error === 'object' ? error.outcome : 'uncertain';
      if (outcome === 'stale' || outcome === 'uncertain') this.invalidate();
      entry.deferred.reject(error);
      return;
    }
    const usable = result && typeof result === 'object' && !Array.isArray(result);
    const current = this.snapshot;
    if (!usable) {
      entry.deferred.reject(Object.assign(
        new Error('Mutation response was not a usable snapshot'), { outcome: 'uncertain' }));
      this.invalidate();
      return;
    }
    const contextCurrent = current && current.instanceId === entry.instanceId &&
      current.docGeneration === entry.expectedDocGeneration;
    if (!contextCurrent) {
      entry.deferred.reject(stale('Write acknowledgement arrived after rotation; refresh required'));
      return;
    }
    this.observe(result);
    entry.deferred.resolve(result);
  }

  async #runPause(entry) {
    try {
      if (!this.synchronized || this.readPromise) {
        await this.readState();
      }
      if (!this.identity || this.identity.instanceId !== entry.instanceId ||
          this.identity.docGeneration !== entry.expectedDocGeneration) {
        throw stale('Pause context rotated during refresh; refresh required');
      }
      const ack = await this.api.sendControl('pause', { expectedDocGeneration: entry.expectedDocGeneration });
      if (!ack || typeof ack !== 'object' || Array.isArray(ack)) {
        throw Object.assign(new Error('Pause response was not a usable snapshot'), { outcome: 'uncertain' });
      }
      const current = this.snapshot;
      if (!current || current.instanceId !== entry.instanceId ||
          current.docGeneration !== entry.expectedDocGeneration) {
        throw stale('Pause superseded by rotation; refresh required');
      }
      this.observe(ack);
      const latest = this.snapshot;
      const confirmed = latest && latest.instanceId === entry.instanceId &&
        latest.docGeneration === entry.expectedDocGeneration &&
        latest.playback && latest.playback.status === 'paused' &&
        latest.controlEpoch === ack.controlEpoch;
      if (!confirmed) {
        throw stale('Pause acknowledgement is superseded; refresh required');
      }
      entry.deferred.resolve(latest);
    } catch (error) {
      if (!error || typeof error !== 'object' || error.outcome === undefined) {
        labeled(error, classify(error));
      }
      const outcome = error && typeof error === 'object' ? error.outcome : 'uncertain';
      if (outcome === 'stale' || outcome === 'uncertain') this.invalidate();
      entry.deferred.reject(error);
    }
  }

  async #readCycle() {
    try {
      for (;;) {
        this.readAgain = false;
        try {
          await this.#fetchOnce();
        } catch (error) {
          this.synchronized = false;
          this.#cancelUnsent();
          if (!this.readAgain) throw error;
        }
        if (!this.readAgain) return;
      }
    } finally {
      this.readPromise = null;
    }
  }

  async #fetchOnce() {
    const conditional = this.synchronized && !this.forceFull;
    this.forceFull = false;
    const captured = {
      instanceId: conditional ? this.identity.instanceId : null,
      revision: conditional ? this.revision : null,
      docGeneration: conditional ? this.identity.docGeneration : null,
      invalidationCounter: this.invalidationCounter,
    };
    const result = await this.api.fetchState(captured.revision, captured.instanceId);
    if (captured.invalidationCounter !== this.invalidationCounter) return;
    if (result && typeof result === 'object' && result.unchanged === true) {
      const matches = captured.instanceId !== null && this.identity &&
        captured.instanceId === this.identity.instanceId &&
        captured.docGeneration === this.identity.docGeneration &&
        captured.invalidationCounter === this.invalidationCounter;
      if (matches) this.#mergeHeartbeat(result.heartbeat);
      return;
    }
    this.observe(result);
  }

  #mergeHeartbeat(heartbeat) {
    const stamp = heartbeat && typeof heartbeat === 'object' ? heartbeat.lastSeenAt : null;
    if (typeof stamp !== 'string' || !stamp) return;
    if (this.lastSeenAt && this.lastSeenAt >= stamp) return;
    this.lastSeenAt = stamp;
    this.onHeartbeat({ lastSeenAt: stamp });
  }
}
