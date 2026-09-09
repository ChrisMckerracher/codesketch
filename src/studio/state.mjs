// Central studio state management, instanceId tracking, and revision synchronization

export class StudioState {
  constructor() {
    this.tool = 'brush';
    this.size = 12;
    this.opacity = 1.0;
    this.color = '#253d38';
    this.bgColor = '#f7f3e8';
    this.targetLayer = 'paint';

    this.snapshot = null;
    this.currentInstanceId = null;
    this.retiredInstanceIds = new Set();
    this.highestRevision = -1;
    this.playbackError = null;

    this.draft = null;
    this.isOffline = false;
    this.notification = null;

    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  emit(event, payload) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const cb of handlers) {
        cb(payload);
      }
    }
  }

  setTool(tool) {
    if (this.tool !== tool) {
      this.tool = tool;
      this.emit('tool', this.tool);
    }
  }

  setSize(size) {
    const val = Math.max(1, Math.min(100, Number(size) || 12));
    if (this.size !== val) {
      this.size = val;
      this.emit('size', this.size);
    }
  }

  setOpacity(opacity) {
    const val = Math.max(0, Math.min(1, Number(opacity) || 1));
    if (this.opacity !== val) {
      this.opacity = val;
      this.emit('opacity', this.opacity);
    }
  }

  setColor(color) {
    if (typeof color === 'string' && /^#[\da-f]{6}$/i.test(color)) {
      this.color = color.toLowerCase();
      this.emit('color', this.color);
    }
  }

  setBgColor(color) {
    if (typeof color === 'string' && /^#[\da-f]{6}$/i.test(color)) {
      this.bgColor = color.toLowerCase();
      this.emit('bgColor', this.bgColor);
    }
  }

  setTargetLayer(layerId) {
    if (this.targetLayer !== layerId) {
      this.targetLayer = layerId;
      this.emit('targetLayer', this.targetLayer);
    }
  }

  setDraft(draft) {
    this.draft = draft;
    this.emit('draft', this.draft);
  }

  setSnapshot(snapshot) {
    if (!snapshot || typeof snapshot.revision !== 'number') return false;

    const incomingInstanceId = snapshot.instanceId || null;

    // Reject delayed snapshots from retired server instances
    if (incomingInstanceId && this.retiredInstanceIds.has(incomingInstanceId)) {
      return false;
    }

    // Accept lower revision only for a genuinely new instanceId
    const isNewInstance = incomingInstanceId && incomingInstanceId !== this.currentInstanceId;

    if (isNewInstance) {
      if (this.currentInstanceId) {
        this.retiredInstanceIds.add(this.currentInstanceId);
      }
      this.currentInstanceId = incomingInstanceId;
      this.highestRevision = snapshot.revision;
    } else {
      if (this.highestRevision >= 0 && snapshot.revision < this.highestRevision) {
        return false;
      }
      this.highestRevision = snapshot.revision;
      if (incomingInstanceId) {
        this.currentInstanceId = incomingInstanceId;
      }
    }

    // Persistent playbackError display
    const pError = snapshot.playbackError || snapshot.playback?.playbackError || null;
    if (pError !== this.playbackError) {
      this.playbackError = pError;
      if (pError) {
        this.showNotification(`Playback error: ${pError}`, { persistent: true });
      }
    }

    if (snapshot.storageError) {
      this.showNotification(`Storage warning: ${snapshot.storageError}`);
    }

    const prevArtRevision = this.snapshot?.artRevision;
    const prevDocument = this.snapshot?.document;
    this.snapshot = snapshot;

    // Layer target synchronization: auto-select newly added top layer when no draft active
    if (snapshot.document?.layers) {
      const prevLayers = prevDocument?.layers || [];
      const currentLayers = snapshot.document.layers;
      const prevIds = new Set(prevLayers.map((l) => l.id));
      const topLayer = currentLayers.length > 0 ? currentLayers[currentLayers.length - 1] : null;

      const isNewTopLayer = topLayer && !prevIds.has(topLayer.id);
      const exists = currentLayers.some((l) => l.id === this.targetLayer);

      if (isNewTopLayer && !this.draft) {
        this.setTargetLayer(topLayer.id);
      } else if (!exists && topLayer) {
        this.setTargetLayer(topLayer.id);
      }
    }

    this.emit('snapshot', snapshot);
    if (snapshot.artRevision !== prevArtRevision || snapshot.document !== prevDocument) {
      this.emit('artChange', snapshot);
    }
    return true;
  }

  setOffline(offline) {
    if (this.isOffline !== offline) {
      this.isOffline = offline;
      this.emit('offline', this.isOffline);
    }
  }

  showNotification(message, options = {}) {
    this.notification = { message, options };
    this.emit('notification', this.notification);
  }

  clearNotification() {
    this.notification = null;
    this.emit('notification', null);
  }
}
