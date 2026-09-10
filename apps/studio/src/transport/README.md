# Transport

Transport owns the local HTTP server, trust boundary, static allowlist, persistence, and lifecycle seam.

## Public entrypoint and key files

- [`index.mjs`](index.mjs) exports `createStudio` and `attachPersistence`.
- [`server.mjs`](server.mjs) routes state, commands, controls, projects, demo, comments, and lifecycle requests.
- [`human-context.mjs`](human-context.mjs) enforces the human HTTP document-generation guard.
- [`http.mjs`](http.mjs) enforces JSON input, loopback same-origin checks, CSP, and static serving.
- [`persistence.mjs`](persistence.mjs) restores current recovery and writes atomic snapshots with explicit `flush()`.
- [`lifecycle.mjs`](lifecycle.mjs) implements configured readiness, gated requests, pause-and-flush stop, and shutdown.
- [`lifecycle-http.mjs`](lifecycle-http.mjs) validates capability-protected status/stop requests.
- [`runtime-manifest.mjs`](runtime-manifest.mjs) verifies served runtime files and their digest.

## Boundaries and invariants

Transport calls direction through [`../direction/index.mjs`](../direction/index.mjs) and never imports UI internals.
Bind only to loopback; validate Host/Origin, JSON content type, request size, and static paths before mutation.
Human POSTs to commands, controls, projects, and demo carry a top-level `expectedDocGeneration` that must equal the
current session generation; the guard runs after the complete body is read and rejects with 409 without mutating.
Agent batches and comment lifecycle requests keep their existing direction-level generation and grant checks.
Recovery is bounded, private, atomic, and visible through `storageError`; explicit flush failures reach the caller.
Configured lifecycle status/stop is authenticated to the loopback owner and waits for recovery flush before close.
The managed entrypoint publishes ownership, readiness, and recovery state; the Go manager verifies the digest, discovers the owner, starts or reuses the runtime, opens the browser, and performs graceful stop/restart.

## Verification

Run [`npm run verify`](../../../../package.json), transport/lifecycle/recovery tests under [`../../tests/`](../../tests/README.md),
and [`npm run test:browser`](../../../../package.json).
