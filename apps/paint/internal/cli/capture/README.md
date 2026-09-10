# Native capture

## Purpose

`capture` renders one immutable studio snapshot to a validated PNG using an installed sandboxed Chromium and an ephemeral loopback server.

## Public seams

- [`Options`](types.go) selects output, crop, scale, committed view, and browser.
- [`Result`](types.go) reports the published PNG and snapshot identity.
- [`Run`](run.go) validates, renders, validates, and atomically publishes one capture.

## Core files

`snapshot.go` validates the current envelope and document. `server.go` serves only capture assets and callbacks. `browser.go`/`process*.go` own the browser. `validation.go` checks dimensions and PNG data. `output.go` publishes the file.

## Allowed imports

The package uses Go standard-library packages and the canonical `apps/studio` asset package. It does not import the CLI transport.

## Invariants

The snapshot requires `document`, `instanceId`, `revision`, and `playback.active`. Capture is loopback-only, capability-scoped per run, bounded, and cleans up only its owned browser, server, and profile.

## Relevant root commands

`paint view` captures the live view and `paint export` captures committed artwork. Build with `make build`; capture verification is lead-owned.
