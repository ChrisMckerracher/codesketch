import { createModel } from '../model/index.mjs';
import { StudioRequests } from '../requests/index.mjs';
import { createReview } from '../review/index.mjs';
import { createDocuments } from '../documents/index.mjs';
import { handleView } from '../viewport/index.mjs';
import { handleLocal } from './local.mjs';
import { createMutations } from './mutations.mjs';
import { createActions } from './actions.mjs';

const DOCUMENT_INTENTS = new Set(['document.new', 'document.demo', 'project.open', 'project.save', 'png.export']);
const MUTATION_INTENTS = new Set(['layer.add', 'layer.update', 'background.set', 'stroke.commit']);
const REVIEW_INTENTS = new Set(['review.begin', 'review.rect', 'review.text', 'review.hold', 'review.reselect', 'review.cancel', 'review.submit', 'review.retry', 'review.transition']);

function validation(message) {
  return Object.assign(new TypeError(message), { code: 'INVALID_INPUT', outcome: 'validation' });
}

const ACTION_LABELS = {
  'stroke.commit': 'Drawing', 'layer.add': 'Adding layer', 'layer.update': 'Layer change',
  'background.set': 'Background change', 'playback.control': 'Playback control',
  'playback.pause': 'Pausing', 'document.new': 'New document', 'document.demo': 'Loading example',
  'project.open': 'Opening project', 'project.save': 'Saving project', 'png.export': 'Exporting PNG',
  'review.begin': 'Starting review',
};

export function createApplication({ state, api }) {
  const model = createModel(state);
  const pendingCounts = new Map();
  let destroyed = false;
  const requests = new StudioRequests({
    api,
    acceptSnapshot: (snapshot) => {
      if (destroyed) return false;
      if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
      if (typeof snapshot.revision !== 'number' || !snapshot.instanceId || !snapshot.document) return false;
      return state.setSnapshot(snapshot) === true;
    },
    onHeartbeat: (heartbeat) => {
      if (destroyed || !heartbeat) return;
      const snapshot = model.get().snapshot;
      if (!snapshot) return;
      state.setSnapshot({ ...snapshot, heartbeat });
    },
  });
  const mutations = createMutations({ model, requests });
  const actions = createActions({ model, requests });
  const review = createReview({ model, requests, dispatch });
  const documents = createDocuments({ model, requests });

  let rotationContext = model.get().snapshot
    ? { instanceId: model.get().snapshot.instanceId, docGeneration: model.get().snapshot.docGeneration }
    : null;

  model.subscribe((value) => {
    const snapshot = value.snapshot;
    const nextContext = snapshot ? { instanceId: snapshot.instanceId, docGeneration: snapshot.docGeneration } : null;
    if (rotationContext && nextContext
      && (nextContext.instanceId !== rotationContext.instanceId || nextContext.docGeneration !== rotationContext.docGeneration)
      && model.get().draft !== null) {
      model.patch({ draft: null });
    }
    rotationContext = nextContext;
  });

  function syncPendingModel() {
    const keys = [...pendingCounts.keys()].sort();
    const current = model.get().pending;
    if (current.length !== keys.length || current.some((key, index) => key !== keys[index])) {
      model.patch({ pending: keys });
    }
  }

  function tracked(label, key, run, { dedupe = true } = {}) {
    if (destroyed) return Promise.reject(validation('Application has been destroyed'));
    if (dedupe && (pendingCounts.get(key) ?? 0) > 0) {
      return Promise.reject(validation(`Action ${key} is already in progress`));
    }
    pendingCounts.set(key, (pendingCounts.get(key) ?? 0) + 1);
    syncPendingModel();
    let promise;
    try {
      promise = Promise.resolve(run());
    } catch (error) {
      promise = Promise.reject(error);
    }
    return promise.then(
      (value) => {
        const count = (pendingCounts.get(key) ?? 1) - 1;
        if (count > 0) pendingCounts.set(key, count);
        else pendingCounts.delete(key);
        if (!destroyed) syncPendingModel();
        return value;
      },
      (error) => {
        const count = (pendingCounts.get(key) ?? 1) - 1;
        if (count > 0) pendingCounts.set(key, count);
        else pendingCounts.delete(key);
        if (!destroyed) {
          syncPendingModel();
          const reason = error && error.message ? String(error.message) : 'unknown error';
          model.patch({ notice: { message: `${label} failed: ${reason}`, tone: 'error' } });
        }
        throw error;
      },
    );
  }

  function dispatch(intent) {
    if (destroyed) return Promise.reject(validation('Application has been destroyed'));
    if (!intent || typeof intent !== 'object' || Array.isArray(intent) || typeof intent.type !== 'string') {
      return Promise.reject(validation('Dispatch requires an intent object with a string type'));
    }
    const type = intent.type;
    if (MUTATION_INTENTS.has(type)) {
      return tracked(ACTION_LABELS[type] ?? type, type, () => mutations.handle(intent));
    }
    if (type === 'playback.control') {
      const key = intent.action === 'pause' ? 'playback.pause' : 'playback.control';
      return tracked('Playback control', key, () => actions.playbackControl(intent), { dedupe: intent.action !== 'pause' });
    }
    if (DOCUMENT_INTENTS.has(type)) {
      return tracked(ACTION_LABELS[type] ?? type, type, () => {
        const handled = documents.handle(intent);
        if (handled === false) throw validation(`Unknown document intent: ${type}`);
        return handled;
      });
    }
    if (type === 'tool.select' && intent.tool === 'comment') {
      return tracked('Starting review', 'review.begin', () => {
        const handled = review.handle({ type: 'review.begin', scope: 'region' });
        if (handled === false) throw validation('Review service is unavailable');
        return handled;
      });
    }
    if (type === 'tool.select' || type === 'tool.return') {
      return tracked('Tool selection', type, () => {
        if (model.get().review.phase !== 'closed') {
          const cancelled = review.handle({ type: 'review.cancel' });
          if (cancelled === false) throw validation('Review service is unavailable');
        }
        if (!handleLocal(intent, { state, model })) throw validation(`Unhandled intent type: ${type}`);
      });
    }
    if (REVIEW_INTENTS.has(type)) {
      return tracked('Review', type, () => {
        const handled = review.handle(intent);
        if (handled === false) throw validation(`Unknown review intent: ${type}`);
        return handled;
      });
    }
    return tracked('Action', type, () => {
      if (handleLocal(intent, { state, model })) return;
      if (handleView(intent, { model })) return;
      throw validation(`Unhandled intent type: ${type}`);
    });
  }

  return {
    model,
    dispatch,
    requests,
    destroy() {
      destroyed = true;
      review.destroy();
      documents.destroy();
      pendingCounts.clear();
      model.destroy();
    },
  };
}
