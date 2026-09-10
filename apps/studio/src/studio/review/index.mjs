import { createReviewSession } from './session.mjs';

export { mount } from './presentation/index.mjs';

export function createReview({ model, requests, dispatch } = {}) {
  let destroyed = false;
  const session = createReviewSession({ model, requests, dispatch });
  const dispose = model.subscribe((value) => session.observeModel(value));
  return {
    handle(intent) {
      if (destroyed || !intent || typeof intent !== 'object') return false;
      return session.handle(intent);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      dispose();
      session.destroy();
    },
  };
}
