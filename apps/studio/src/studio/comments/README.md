# Studio comments

This context provides the browser-side comment workflow: selection, composition, pins, overlays, and listening state.

## Public entrypoint and key files

- [`index.mjs`](index.mjs) exports geometry, selection, overlay, list, composer, status, shortcuts, and `CommentsUI`.
- [`geometry.mjs`](geometry.mjs) maps client coordinates to the 1000 × 700 canvas and normalizes rectangles.
- [`selection.mjs`](selection.mjs), [`composer.mjs`](composer.mjs), and [`comments-list.mjs`](comments-list.mjs) manage input and inspection.
- [`overlay.mjs`](overlay.mjs) renders DOM pins/highlights without touching canvas pixels.
- [`handshake.mjs`](handshake.mjs) scopes pause acknowledgement to the current token and accepted snapshot.

## Boundaries and invariants

Comments use `StudioApi`; this UI context does not write session state directly.
Whole-canvas comments appear in the list; region comments receive pins and highlights.
The overlay never intercepts painting except for clickable pin buttons.
Snapshot races must not activate stale pause acknowledgements or disturb focused controls.
Use text-safe DOM APIs for feedback content and preserve keyboard/pointer accessibility.

## Verification

Run [`npm run test:browser`](../../../../../package.json), especially [`comments-races.mjs`](../../../tests/browser/comments-races.mjs),
and the geometry tests at [`../../../tests/comments-geometry.test.mjs`](../../../tests/comments-geometry.test.mjs).
