# Repository map

Codesketch is a dependency-free local painting studio with a JavaScript browser runtime and a native Go CLI.

## Root contracts and build

- [`go.mod`](../go.mod) declares the native module and standard-library-only build boundary.
- [`package.json`](../package.json) declares native Node scripts: `start`, `test`, `test:browser`, and `verify`.
- [`Makefile`](../Makefile) builds, installs, vets, tests, and verifies the native `paint` executable with offline Go settings.
- [`AGENTS.md`](../AGENTS.md) records production protection and repository operating rules.

## Applications

- [`apps/studio/`](../apps/studio/README.md) is the canonical browser studio.
  Its JavaScript runtime lives in [`apps/studio/src/`](../apps/studio/src/README.md),
  its shell/assets in [`apps/studio/public/`](../apps/studio/public/README.md),
  and its browser/Node checks in [`apps/studio/tests/`](../apps/studio/tests/README.md).
  [`apps/studio/assets.go`](../apps/studio/assets.go) embeds the reviewed runtime `src/` and `public/` tree for native distribution.
- [`apps/paint/`](../apps/paint) is the native Go CLI: `cmd/paint` is the executable,
  while `internal/cli` owns command parsing, studio transport, managed lifecycle, comments, capture, and tests.
  Folder seams are documented by the READMEs in [`apps/paint/`](../apps/paint/README.md).

## Studio source contexts

- [`apps/studio/src/painting/`](../apps/studio/src/painting/README.md) owns artwork values and rendering.
- [`apps/studio/src/direction/`](../apps/studio/src/direction/README.md) owns session playback, history, projects, recovery, and feedback.
- [`apps/studio/src/transport/`](../apps/studio/src/transport/README.md) owns local HTTP, persistence, trust, and lifecycle seams.
- [`apps/studio/src/studio/`](../apps/studio/src/studio/README.md) owns browser interaction and presentation.
- [`apps/studio/src/compositions/`](../apps/studio/src/compositions/README.md) supplies the deterministic landscape command batch.

The current JavaScript dependency direction is studio → transport API and painting; transport → direction → painting. The native lifecycle manager starts the embedded managed entrypoint and communicates through the authenticated lifecycle seam; it does not import browser UI or studio domain internals.
Cross-context imports target public `index.mjs` entrypoints. Document code remains browser/network/filesystem independent.

## Documentation

- [`docs/`](.) contains embedded guides, standards, plans, and release verification evidence.
- [`docs/agent-guide.md`](agent-guide.md) is embedded by [`docs/assets.go`](assets.go) for offline CLI guidance.
- [`docs/standards/`](standards) defines architecture, interface, security, and testing expectations.
- [`docs/plans/architect/`](plans/architect) contains approved architecture scope, contracts, and risks.
- [`docs/plans/architect/managed-lifecycle.md`](plans/architect/managed-lifecycle.md) is the durable managed-studio lifecycle implementation contract.

## Tools and policy

- [`tools/verify.mjs`](../tools/verify.mjs) checks JavaScript syntax, source boundaries, file size, and zero-dependency policy.
- [`tools/verify-go.mjs`](../tools/verify-go.mjs) checks Go formatting, dependencies, embeds, and source policy.
- [`tools/browser-check.mjs`](../tools/browser-check.mjs) runs isolated Playwright CLI scenarios and validates project/PNG artifacts.
- [`tools/go-policy/`](../tools/go-policy) contains Go inventory, environment, source, and runtime policy helpers.
- [`tools/README.md`](../tools/README.md) documents root verification tools.
- [`tools/go-policy/README.md`](../tools/go-policy/README.md) documents the Go policy seams.

## Shared tests and fixtures

- [`tests/`](../tests) contains repository-wide policy and runtime-embedding tests.
- [`tests/fixtures/capture-contract.json`](../tests/fixtures/capture-contract.json) is the shared cross-language capture contract fixture.
- [`tests/go-policy-fixture.mjs`](../tests/go-policy-fixture.mjs) builds policy fixtures for Go inventory checks.
- [`tests/README.md`](../tests/README.md) documents repository-wide test ownership.
- [`tests/fixtures/README.md`](../tests/fixtures/README.md) documents shared cross-language fixtures.
- [`docs/verification.md`](verification.md) records release verification evidence and the required isolated checks.

## Runtime and safety notes

Bare `paint` and `paint studio start` use durable application data and port 4317 by default; `paint studio status`, `stop`, and `restart` manage the same owned runtime. Port 4317 is production and is never a development or test default.
Development, unit tests, and browser checks use ephemeral loopback ports and temporary persistence.
The studio supports current contracts only; obsolete formats are rejected without compatibility adapters.
Project saves use v2, strict recovery uses v1, and partial playback progress belongs to recovery snapshots rather than project files. Human pause remains authoritative across managed operations.
