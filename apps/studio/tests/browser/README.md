# Browser scenarios (suspended)

The studio UI was removed for the from-zero reconstruction, so these
scenarios are suspended coverage: they target the retired interface and
will be revised when the rebuilt UI lands. The runner
[`tools/browser-check.mjs`](../../../../tools/browser-check.mjs) reports
the pending reconstruction and exits nonzero before starting any server
or browser.

Scenarios kept for that future revision:

- [`studio.mjs`](studio.mjs), [`layers-keyboard.mjs`](layers-keyboard.mjs), [`layers-opacity.mjs`](layers-opacity.mjs),
  [`comments.mjs`](comments.mjs), [`comments-races.mjs`](comments-races.mjs), and [`finish.mjs`](finish.mjs).

## Invariants

When resumed, run against an ephemeral loopback server with fresh
temporary persistence and never connect to production 4317. Keep
generated `artifacts/browser-check` output outside commits.
