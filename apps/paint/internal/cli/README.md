# Native CLI orchestration

## Purpose

This package parses command invocations, builds validated requests, performs local file work, calls the studio, formats results, and maps failures to exit statuses.

## Public seams

- [`Runner`](run.go) owns process-facing input, output, environment, capture injection, dispatch, and error mapping.
- [`help.go`](help.go) defines the current command descriptions and offline guidance.
- [`studio.go`](studio.go) and [`studio-options.go`](studio-options.go) define the public managed-studio command seam.
- [`lifecycle/`](lifecycle/README.md) owns runtime discovery, start, status, stop, restart, cache verification, and browser opening.
- [`session.go`](session.go) handles project, command, snapshot, and observation responses.

## Core files

`run.go`, `prepare.go`, `draw.go`, `comments*.go`, `grants*.go`, `observe.go`, `format.go`, and `doctor.go` compose artwork orchestration. `studio.go` and `studio-options.go` dispatch `paint studio start|status|stop|restart` and the bare `paint` start path.

## Allowed imports

The package may import `capture`, `input`, `parse`, and `transport`, plus the standard library and embedded docs. It does not import browser or studio implementation internals.

## Invariants

Parsing and required guard validation happen before network I/O. Mutations carry current generation and epoch; guarded execution may require a grant. Staging preserves a human pause.

## Relevant root commands

- `paint help` and `paint guide` expose offline instructions.
- Bare `paint` starts or reuses the managed studio; `paint studio start|status|stop|restart` manages its process.
- `paint status` reports artwork state; `paint studio status` reports managed lifecycle state.
- `make build` produces the executable used for CLI checks.

Use the [CLI craft guide](../../../../docs/artist-skill/references/cli-craft.md) for agent workflows instead of duplicating command API details here.
