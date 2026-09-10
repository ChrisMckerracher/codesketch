import { randomUUID } from 'node:crypto';

export class GrantConflictError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'GrantConflictError';
    this.statusCode = 409;
    this.reason = reason;
  }
}

export class ControlGrant {
  docGeneration = randomUUID();
  controlEpoch = 0;
  requiresGrant = false;
  activeGrant = null;

  snapshot() {
    return {
      docGeneration: this.docGeneration,
      controlEpoch: this.controlEpoch,
      requiresGrant: this.requiresGrant,
      activeGrant: this.activeGrant ? { ...this.activeGrant } : null,
    };
  }

  invalidate() {
    this.controlEpoch += 1;
    this.requiresGrant = true;
    this.activeGrant = null;
  }

  reset({ paused = false } = {}) {
    this.docGeneration = randomUUID();
    this.controlEpoch = 0;
    this.requiresGrant = paused;
    this.activeGrant = null;
  }

  authorize() {
    this.controlEpoch += 1;
    this.requiresGrant = true;
    this.activeGrant = {
      docGeneration: this.docGeneration,
      controlEpoch: this.controlEpoch,
      grantToken: randomUUID(),
    };
    return { ...this.activeGrant };
  }

  check(options = {}, { execute = false } = {}) {
    if (options.source === 'human') return this.#acknowledge();
    if (options.source !== undefined && options.source !== 'agent') {
      throw new GrantConflictError('unknown source actor');
    }

    if (options.expectedDocGeneration !== this.docGeneration) {
      throw new GrantConflictError('stale document generation');
    }
    const epoch = options.epoch;
    if (!Number.isSafeInteger(epoch) || epoch < 0 || epoch !== this.controlEpoch) {
      throw new GrantConflictError('stale control epoch');
    }

    if (execute && this.requiresGrant) {
      if (!this.activeGrant) throw new GrantConflictError('control grant required');
      if (options.grantToken !== this.activeGrant.grantToken) {
        throw new GrantConflictError('grant token mismatch');
      }
      if (
        this.activeGrant.docGeneration !== this.docGeneration ||
        this.activeGrant.controlEpoch !== this.controlEpoch
      ) {
        throw new GrantConflictError('stale control grant');
      }
    }

    if (options.grantToken !== undefined && this.activeGrant &&
        options.grantToken !== this.activeGrant.grantToken) {
      throw new GrantConflictError('grant token mismatch');
    }

    return this.#acknowledge();
  }

  #acknowledge() {
    return { ok: true, docGeneration: this.docGeneration, controlEpoch: this.controlEpoch };
  }
}
