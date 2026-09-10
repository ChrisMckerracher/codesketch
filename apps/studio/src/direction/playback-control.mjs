const CONTROL_ACTIONS = ['pause', 'clear', 'undo', 'redo', 'step', 'finish'];

export function controlSource(grant, options = {}) {
  const source = options?.source;
  if (source === undefined || source === 'agent') return 'agent';
  if (source === 'human') return 'human';
  grant.check({ source });
  return 'agent';
}

// Runs every pre-mutation grant check for a control action and reports the
// post-success grant transition. Never mutates the grant itself.
export function planControl(grant, action, options = {}) {
  const source = controlSource(grant, options);
  if (action === 'speed') return { source, authorize: false, invalidate: false };
  if (source === 'human') {
    return { source, authorize: action === 'resume', invalidate: CONTROL_ACTIONS.includes(action) };
  }
  if (action === 'pause') return { source, authorize: false, invalidate: true };
  if (action === 'clear') {
    grant.check(options, { execute: false });
    return { source, authorize: false, invalidate: true };
  }
  if (action === 'undo' || action === 'redo') {
    grant.check(options, { execute: true });
    return { source, authorize: false, invalidate: true };
  }
  if (action === 'new') {
    grant.check(options, { execute: true });
    return { source, authorize: false, invalidate: false };
  }
  if (action === 'resume' || action === 'step' || action === 'finish') {
    grant.check(options, { execute: true });
    return { source, authorize: false, invalidate: false };
  }
  return { source, authorize: false, invalidate: false };
}
