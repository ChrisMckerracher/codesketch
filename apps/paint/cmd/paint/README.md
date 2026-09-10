# `cmd/paint`

## Purpose

This package is the executable boundary for the native `paint` command.

## Public seams

The package exposes the Go `main` entrypoint to the operating system. Application behavior is delegated to [`internal/cli`](../../internal/cli/README.md).

## Core files

- [`main.go`](main.go) creates a context that is cancelled by SIGINT or SIGTERM, runs `cli.Runner`, then exits with its returned status.

## Allowed imports

`main.go` imports Go context, signal, OS, syscall, and the repository CLI package. It does not own command parsing, HTTP, rendering, or lifecycle policy.

## Invariants

Signals cancel the shared context. The process exit code comes from the runner. No production process or persistence is managed by this package directly.

## Relevant root commands

- `make build` compiles this package into `bin/paint`.
- `make install` builds and installs the command.

Command behavior is documented by the [CLI guide](../../../../docs/agent-guide.md).
