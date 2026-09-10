# Browser scenarios

These scenarios exercise the current Codesketch studio shell and its observable
painting workflows. They run against an isolated ephemeral loopback server
with temporary persistence; port 4317 and production artwork remain out of
scope.

- [`studio.mjs`](studio.mjs) covers the canvas, tools, history, documents,
  playback, viewport, and shell actions.
- [`layers-keyboard.mjs`](layers-keyboard.mjs) covers native keyboard layer
  selection and editing.
- [`layers-opacity.mjs`](layers-opacity.mjs) covers layer opacity and
  compositing.
- [`comments.mjs`](comments.mjs) covers paused region and whole-canvas review.
- [`comments-races.mjs`](comments-races.mjs) covers pause, generation, stale,
  and uncertain review races.
- [`finish.mjs`](finish.mjs) covers progressive playback, step, finish, and
  clear-pending behavior.
- [`connection.mjs`](connection.mjs) covers offline, uncertainty, and delayed
  response handling.
- [`appearance.mjs`](appearance.mjs) covers light/dark appearance, compact
  widths, focus, and reduced-motion presentation.

The runner must inspect browser console and network errors, actual canvas
pixels, light/dark appearance, compact drawers, keyboard focus, and pointer
holds. Generated browser artifacts stay outside commits. Current release
evidence is recorded in [`docs/verification.md`](../../../../docs/verification.md).
The browser runner is linked from
[`tools/browser-check.mjs`](../../../../../tools/browser-check.mjs).
