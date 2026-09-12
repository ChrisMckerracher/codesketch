# Repository map

Codesketch is a dependency-free local painting studio. The browser studio is
the canonical application runtime; the native Go `paint` CLI packages and
manages that runtime.

## Root and applications

- [`go.mod`](../go.mod) declares the native module and standard-library-only
  build boundary.
- [`package.json`](../package.json) declares the Node start, test, browser,
  and verification scripts.
- [`Makefile`](../Makefile) builds, installs, vets, tests, and verifies the
  native `paint` executable with offline Go settings.
- [`AGENTS.md`](../AGENTS.md) defines production protection, ownership, and
  verification rules.
- [`apps/studio/`](../apps/studio/README.md) contains the browser application.
  Its source, public assets, and checks each have local README coverage.
- [`apps/paint/`](../apps/paint/README.md) contains the native CLI. `cmd/paint`
  is the executable; `internal/cli` owns parsing, transport, lifecycle,
  capture, input, and output seams.
- [`docs/`](README.md) contains standards, plans, guides, and release evidence.
- [`docs/agent-guide.md`](agent-guide.md) is embedded for offline CLI guidance.
- [`docs/plans/architect/managed-lifecycle.md`](plans/architect/managed-lifecycle.md)
  is the durable managed-studio lifecycle contract.
- [`tools/`](../tools/README.md) contains verification and browser runners.
- [`tests/`](../tests/README.md) contains repository-wide policy and shared
  cross-language fixtures.
- [`docs/verification.md`](verification.md) is the current source for release
  verification evidence.

## Studio bounded contexts

The JavaScript dependency direction is studio → transport API and painting;
transport → direction → painting. Cross-context imports use public
`index.mjs` entrypoints.

- [`painting/`](../apps/studio/src/painting/README.md) validates and reduces
  artwork commands, then renders document values and playback marks.
- [`direction/`](../apps/studio/src/direction/README.md) owns session state,
  playback, queue, history, comments, projects, and recovery.
- [`transport/`](../apps/studio/src/transport/README.md) owns local HTTP,
  persistence, trust checks, lifecycle, and the runtime manifest.
- [`studio/`](../apps/studio/src/studio/README.md) owns browser interaction,
  immutable UI model state, application fanout, tactile vector workspace,
  gestures, review, and the HTTP client.
- [`compositions/`](../apps/studio/src/compositions/README.md) supplies the
  deterministic example command batch.

## Current studio hierarchy

`public/index.html` provides a minimal application shell: `#studio-app`
containing `#workspace-root` with `#painting-canvas` (canonical committed
artwork), `#ui-canvas` (vector UI chrome and overlays), and `#control-host`
(persistent invisible semantic DOM backing inputs).

`studio/index.mjs` bootstraps `StudioState`, `StudioApi`, `createApplication`,
and `createWorkspace` in [`workspace/`](../apps/studio/src/studio/workspace/README.md).
The workspace context operates in fixed 1000×700 design units, using the custom
`GLYPHS` vector engine for all visible interface text, and coordinates nested
subcontexts for geometry, vector rendering, controls, actions, input gestures,
palette, sidebar inspector, and spatial feedback.

## Native runtime and release boundary

[`apps/studio/assets.go`](../apps/studio/assets.go) explicitly embeds the
complete `src/` and `public/` runtime, including `public/icon.svg`,
`public/workspace.css`, the HTML entrypoint, and every transitive module. The renderer
exports remain direct views of the canonical painting renderer.

The lifecycle manager derives a strict SHA-256 digest from the exact embedded
manifest and uses a verified digest-keyed cache. It cannot discover or restart
an old incompatible digest. A lead-managed cross-digest release stops the old
binary's studio successfully, then starts the new binary's studio; same-version
restart is a separate lifecycle operation. Port 4317 is production.
Development and tests use ephemeral loopback ports and temporary persistence.

Project files use current v2; strict recovery uses current v1. Obsolete formats
are rejected without compatibility adapters. Consult
[`verification.md`](verification.md) for current release evidence.
