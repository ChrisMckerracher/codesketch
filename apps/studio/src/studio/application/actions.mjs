const CONTROL_ACTIONS = new Set(['pause', 'resume', 'step', 'clear', 'finish', 'undo', 'redo', 'speed']);

function validation(message) {
  return Object.assign(new TypeError(message), { code: 'INVALID_INPUT', outcome: 'validation' });
}

function stale(message) {
  return Object.assign(new Error(message), { outcome: 'stale' });
}

export function createActions({ model, requests }) {
  function currentGeneration() {
    const generation = model.get().snapshot?.docGeneration;
    if (typeof generation !== 'string' || !generation) throw stale('No current session; refresh required');
    return generation;
  }

  return {
    playbackControl(intent) {
      if (!CONTROL_ACTIONS.has(intent.action)) {
        throw validation(`Unknown playback action: ${String(intent.action)}`);
      }
      if (intent.action === 'pause') {
        if (intent.generation !== undefined) {
          if (typeof intent.generation !== 'string' || !intent.generation) {
            throw validation('pause generation must be a nonempty string when supplied');
          }
          return requests.pause({ expectedDocGeneration: intent.generation });
        }
        const expectedDocGeneration = currentGeneration();
        return requests.pause({ expectedDocGeneration });
      }
      let expectedDocGeneration;
      if (intent.generation !== undefined) {
        if (typeof intent.generation !== 'string' || !intent.generation) {
          throw validation('generation must be a nonempty string when supplied');
        }
        expectedDocGeneration = intent.generation;
      } else {
        expectedDocGeneration = currentGeneration();
      }
      const context = { expectedDocGeneration };
      if (intent.action === 'speed') {
        const speed = Number(intent.speed);
        if (!Number.isFinite(speed)) throw validation('Speed must be a number');
        context.speed = speed;
      }
      return requests.mutate({
        expectedDocGeneration,
        run: (api) => api.sendControl(intent.action, context),
      });
    },
  };
}
