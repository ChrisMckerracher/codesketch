import { createInitialValue, mergeFields } from './value.mjs';

export { MODEL_KEYS } from './value.mjs';

export function createModel(state) {
  let value = createInitialValue(state);
  const listeners = new Set();
  const disposers = [];

  function apply(fields, allowSnapshot) {
    const next = mergeFields(value, fields, { allowSnapshot });
    if (next === value) return;
    const previous = value;
    value = next;
    for (const listener of [...listeners]) listener(value, previous);
  }

  if (state && typeof state.on === 'function') {
    disposers.push(
      state.on('snapshot', (snapshot) => {
        const fields = { snapshot };
        if (value.connection === 'connecting' && !state.isOffline) {
          fields.connection = 'online';
        }
        apply(fields, true);
      }),
      state.on('tool', (tool) => apply({ tool }, true)),
      state.on('size', (size) => apply({ size }, true)),
      state.on('opacity', (opacity) => apply({ opacity }, true)),
      state.on('color', (color) => apply({ color }, true)),
      state.on('targetLayer', (targetLayer) => apply({ targetLayer }, true)),
      state.on('draft', (draft) => apply({ draft }, true)),
      state.on('offline', (offline) => apply({ connection: offline ? 'offline' : 'online' }, true)),
      state.on('notification', (notice) => apply({ notice }, true)),
    );
  }

  return {
    get() {
      return value;
    },
    patch(fields) {
      apply(fields, false);
      return value;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      for (const dispose of disposers) dispose();
      disposers.length = 0;
      listeners.clear();
    },
  };
}
