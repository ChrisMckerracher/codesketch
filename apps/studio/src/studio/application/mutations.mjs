function validation(message) {
  return Object.assign(new TypeError(message), { code: 'INVALID_INPUT', outcome: 'validation' });
}

function stale(message) {
  return Object.assign(new Error(message), { outcome: 'stale' });
}

export function createMutations({ model, requests }) {
  function generationFor(intent) {
    if (intent.generation !== undefined) {
      if (typeof intent.generation !== 'string' || !intent.generation) {
        throw validation('generation must be a nonempty string when supplied');
      }
      return intent.generation;
    }
    const generation = model.get().snapshot?.docGeneration;
    if (typeof generation !== 'string' || !generation) throw stale('No current session; refresh required');
    return generation;
  }

  function uniqueLayerId(layers) {
    const ids = new Set(layers.map((layer) => layer?.id));
    let count = layers.length + 1;
    while (ids.has(`layer-${count}`)) count += 1;
    return `layer-${count}`;
  }

  function submit(command, generation) {
    return requests.mutate({
      expectedDocGeneration: generation,
      run: (api) => api.sendCommands([command], { expectedDocGeneration: generation, immediate: true, play: false }),
    });
  }

  return {
    handle(intent) {
      const generation = generationFor(intent);
      if (intent.type === 'stroke.commit') {
        if (!intent.command || typeof intent.command !== 'object' || Array.isArray(intent.command)) {
          throw validation('stroke.commit requires a command object');
        }
        return submit(intent.command, generation);
      }
      if (intent.type === 'background.set') {
        if (typeof intent.color !== 'string' || !intent.color) throw validation('background.set requires a color');
        return submit({ type: 'fill', color: intent.color }, generation);
      }
      if (intent.type === 'layer.add') {
        const layers = model.get().snapshot?.document?.layers ?? [];
        const name = typeof intent.name === 'string' && intent.name.trim() ? intent.name.trim() : `Layer ${layers.length + 1}`;
        return submit({ type: 'layer.add', id: uniqueLayerId(layers), name }, generation);
      }
      const update = { type: 'layer.update', id: intent.id };
      if (intent.name !== undefined) update.name = intent.name;
      if (intent.visible !== undefined) update.visible = intent.visible;
      if (intent.opacity !== undefined) update.opacity = intent.opacity;
      return submit(update, generation);
    },
  };
}
