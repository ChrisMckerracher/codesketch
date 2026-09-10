# CLI input and output

## Purpose

`input` bounds file/stdin reads and publishes output files atomically.

## Public seams

- [`Read`](input.go) reads a regular file or takes ownership of stdin for `-`.
- [`AtomicWrite`](input.go) writes beside the destination and renames only after sync.

## Core files

`input.go` contains budgets and publication. `open_unix.go` and `open_windows.go` implement platform-specific regular-file opening.

## Allowed imports

The package uses Go context, I/O, filesystem, path, and time packages only. It does not call studio transport or parse command semantics.

## Invariants

Reads are limited to 8 MiB and 10 seconds. Cancellation closes owned streams. Non-regular input is rejected. Existing destinations remain unchanged when staging or sync fails.

## Relevant root commands

`paint submit`, `paint load`, and `paint save` use this package. Build the command with `make build`; use the [CLI guide](../../../../../docs/agent-guide.md) for workflows.
