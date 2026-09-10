# Browser scenarios

These scripts exercise the live studio through the installed `playwright-cli` against an ephemeral loopback server.

## Scenarios

- [`studio.mjs`](studio.mjs) covers drawing, playback, project download, and PNG export.
- [`layers-keyboard.mjs`](layers-keyboard.mjs) and [`layers-opacity.mjs`](layers-opacity.mjs) cover layer controls and compositing.
- [`comments.mjs`](comments.mjs) covers whole-canvas and region comments.
- [`comments-races.mjs`](comments-races.mjs) covers polling and pause-handshake races.
- [`finish.mjs`](finish.mjs) covers completing pending playback.

The harness is [`tools/browser-check.mjs`](../../../../tools/browser-check.mjs); it starts `createStudio({ root, ... })` on port 0,
uses a named isolated browser session, verifies project v2 JSON and 1000 × 700 PNG output, then closes both resources.

## Invariants

Scenarios assert observable labels and canvas behavior, not implementation-only state.
Use fresh temporary persistence and never connect to production 4317.
Keep generated `artifacts/browser-check` output outside commits.

## Verification

Run [`npm run test:browser`](../../../../package.json) from the repository root with `playwright-cli` available.
