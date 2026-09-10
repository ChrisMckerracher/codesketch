# Studio comments

The browser-side comment presentation (selection, composer, list, overlay,
status, shortcuts, UI controller) was removed for the from-zero UI
reconstruction. Retained logic only:

- [`index.mjs`](index.mjs) exports geometry and `PauseHandshake`.
- [`geometry.mjs`](geometry.mjs) maps client coordinates to the 1000 × 700 canvas and normalizes rectangles.
- [`handshake.mjs`](handshake.mjs) scopes pause acknowledgement to the current token and accepted snapshot.

## Verification

Browser comment scenarios are suspended until the reconstructed UI lands.
The geometry tests at [`../../../tests/comments-geometry.test.mjs`](../../../tests/comments-geometry.test.mjs) still run.
