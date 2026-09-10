# Model

[`index.mjs`](index.mjs) creates the immutable browser view model from the
shared state service and exports `MODEL_KEYS`.

It listens for snapshots, tool properties, target layer, drafts, connection,
and notices. `patch` changes local fields; `subscribe` publishes each changed
value with its predecessor; `destroy` removes all state listeners.

[`value.mjs`](value.mjs) defines initial values and controlled field merging.
Snapshot updates are accepted only through the snapshot path, while local
patches cannot replace server state. This keeps presentation consumers on a
single current value.

The model has no browser or network dependency. Application, requests,
gesture, inspector, and review contexts consume its public entrypoint.
Coverage: `studio-model.test.mjs` and `studio-state.test.mjs`.
