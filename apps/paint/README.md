# Native paint CLI

## Purpose

`apps/paint` is the standard-library-only Go application that manages the local studio and sends drawing, playback, project, comment, and capture requests to it.

## Public seams

- [`cmd/paint/`](cmd/paint/README.md) owns process signals and exit status.
- [`internal/cli/`](internal/cli/README.md) owns command orchestration.
- [`internal/cli/lifecycle/`](internal/cli/lifecycle/README.md) owns the managed runtime lifecycle.

## Core files

- [`go.mod`](../../go.mod) defines the module and dependency boundary.
- [`cmd/paint/main.go`](cmd/paint/main.go) constructs the signal-aware runner.
- [`internal/cli/run.go`](internal/cli/run.go) dispatches commands and maps failures.
- [`internal/cli/studio.go`](internal/cli/studio.go) dispatches bare `paint` and `paint studio` operations.

## Allowed imports

Go code uses the standard library and this module's packages. The CLI may use its bounded `capture`, `input`, `parse`, `transport`, and `lifecycle` packages according to their package boundaries.

## Invariants

Inputs and responses are bounded. API destinations are loopback-only. Invalid invocations fail before network I/O, and current contracts reject obsolete input.

## Relevant root commands

- `make build` writes `bin/paint`.
- `make install` installs the native command.
- `paint guide` prints the embedded operating guide.

Bare `paint` starts or reuses the cached runtime on port 4317 and opens the default browser. `paint studio start|status|stop|restart` manages the runtime; normal management uses durable data under the OS config directory and a digest-keyed cache under the OS cache directory. Development uses `npm start`, port 0, and temporary in-memory state.

See the [native CLI architecture plan](../../docs/plans/architect/native-cli.md) for the wider contract.
