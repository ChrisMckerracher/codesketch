# Studio UI

The browser interaction UI was removed for the from-zero reconstruction.
Only retained logic modules remain:

- [`api.mjs`](api.mjs) is the HTTP client for state, commands, controls, projects, and comments.
- [`state.mjs`](state.mjs) tracks snapshots, instance revisions, drafts, and notifications.
- [`renderer.mjs`](renderer.mjs) is the painting renderer seam.
- [`comments/`](comments/README.md) retains geometry and the pause handshake.

Presentation modules (bootstrap, canvas controller, tools, playback,
layers, dialogs, icons) and the comments UI workflow are gone; a fresh
creative session will author the rebuilt hierarchy without the old layout.

## Verification

Browser verification is pending until the reconstructed UI lands.
Run [`npm run verify`](../../../../package.json) for non-UI checks.
Relevant retained coverage is in [`../../tests/`](../../tests/README.md).
