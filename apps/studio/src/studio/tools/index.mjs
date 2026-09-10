import { createDock } from './dock.mjs';
import { handleShortcut } from './shortcuts.mjs';
import { wireCompact } from './compact.mjs';

export function mount({ root, model, dispatch }) {
  let current = model;
  const options = new AbortController();
  const dock = createDock(root, dispatch, options.signal);
  const compact = wireCompact({ signal: options.signal, dispatch });

  window.addEventListener('keydown', (event) => {
    handleShortcut(event, current, dispatch);
  }, { signal: options.signal });

  function render() {
    dock.update(current);
    compact.update(current);
  }
  render();

  return {
    update(next) {
      current = next;
      render();
    },
    destroy() {
      options.abort();
      dock.destroy();
    },
  };
}
