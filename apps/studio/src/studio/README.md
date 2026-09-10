# Studio UI

This context owns browser interaction, presentation state, controls, and rendering coordination.

## Public entrypoint and key files

- [`index.mjs`](index.mjs) exports `bootstrap()` and wires the browser application.
- [`state.mjs`](state.mjs) tracks tools, snapshots, instance revisions, drafts, and notifications.
- [`api.mjs`](api.mjs) is the HTTP client for state, commands, controls, projects, and comments.
- [`canvas-controller.mjs`](canvas-controller.mjs) turns pointer input into commands and drafts.
- [`renderer.mjs`](renderer.mjs), [`tools-ui.mjs`](tools-ui.mjs), [`playback-ui.mjs`](playback-ui.mjs), and [`layers-ui.mjs`](layers-ui.mjs) coordinate visible controls.
- [`comments/`](comments/README.md) owns comment interaction.

## Boundaries and invariants

UI code talks to the server through `StudioApi` and consumes painting through its renderer seam.
It does not mutate direction or persistence state directly.
Snapshots are accepted by instance identity and monotonic revision; delayed retired-instance snapshots are ignored.
Canvas input pauses/commits through the session contract, while polling observes changes at 150 ms intervals.
Keep the canvas prominent, controls compact, and feedback accessible in both appearance modes.

## Verification

Run [`npm run verify`](../../../../package.json) and [`npm run test:browser`](../../../../package.json).
Relevant unit coverage is in [`../../tests/`](../../tests/README.md).
