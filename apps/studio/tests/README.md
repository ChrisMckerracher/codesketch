# Studio tests

These Node tests cover the JavaScript domain, HTTP transport, persistence, lifecycle, recovery, comments, and UI state seams.

## Coverage map

- [`document.test.mjs`](document.test.mjs) covers command validation, reduction, replay, and limits.
- [`session.test.mjs`](session.test.mjs), [`finish-session.test.mjs`](finish-session.test.mjs), and recovery tests cover direction state.
- `comments-*.test.mjs` covers feedback schemas, grants, session behavior, project persistence, and HTTP routes.
- [`http.test.mjs`](http.test.mjs), [`lifecycle-http.test.mjs`](lifecycle-http.test.mjs), and [`lifecycle.test.mjs`](lifecycle.test.mjs) cover trust, readiness, authenticated shutdown, and recovery preservation seams.
- [`studio-state.test.mjs`](studio-state.test.mjs) covers revision and instance synchronization.
- [`browser/`](browser/README.md) contains observable Playwright CLI scenarios.

## Invariants

Tests create ephemeral loopback servers and temporary persistence; they never use production port 4317 or `.studio/session.json`.
Server and timer resources are closed in each test.
Assertions cover rejection before mutation, current-only contracts, bounded inputs, recovery flush behavior, strict recovery v1, project v2, human-pause preservation, and exact HTTP trust rules. Native lifecycle tests cover runtime discovery and managed operations separately.
Generated browser artifacts stay outside committed source.

## Verification

From the root, run [`npm test`](../../../package.json), [`npm run verify`](../../../package.json),
and [`npm run test:browser`](../../../package.json) for browser workflows.
