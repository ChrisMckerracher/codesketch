# Native lifecycle context

## Purpose

`lifecycle` owns the native manager for the embedded studio runtime. It resolves configuration, verifies and extracts the digest-keyed runtime cache, discovers ownership, launches Node, opens the browser, and performs authenticated stop and restart operations.

## Public seams

- [`DefaultOptions`](manager.go) resolves data/cache defaults and the current default port.
- [`New`](manager.go) validates and normalizes options without filesystem writes or process starts.
- [`Manager.Start`](start.go) starts or reuses a verified healthy runtime and opens its loopback URL unless `NoOpen`.
- [`Manager.Status`](manager.go) reports managed process state without starting or opening anything.
- [`Manager.Stop`](stop.go) performs authenticated graceful shutdown and proves termination before cleanup.
- [`Manager.Restart`](restart.go) composes stop and start under one operation lock.
- The runtime helpers derive a canonical manifest and verify or publish a digest-keyed cache tree.
- The ownership record reader validates the exact current record schema.

## Core files

`manager.go`, `start.go`, `stop.go`, and `restart.go` define the manager API and operations. `manifest.go`, `runtime.go`, and `runtime_verify.go` define verified cache material. `record.go` defines the five-field record contract; lock files define platform ownership primitives. The approved contract is [managed-lifecycle.md](../../../../../docs/plans/architect/managed-lifecycle.md).

## Allowed imports

The package uses standard-library packages plus the canonical `apps/studio` embedded runtime. It does not import CLI capture, input, or transport.

## Invariants

Port 0 remains ephemeral; explicit ports are 1024–65535. Cache trees and records are private, owned, regular-file/directory data. Existing digest trees are verified and never repaired. Concurrent extraction adopts one verified instance.

## Commands

`paint` is shorthand for `paint studio start`: it starts or reuses the cached runtime, uses durable application data, and opens the default browser. The explicit surface is:

```text
paint studio start [--data-dir DIR] [--cache-dir DIR] [--node PATH] [--port N] [--no-open] [--json]
paint studio status [--data-dir DIR] [--json]
paint studio stop [--data-dir DIR] [--json]
paint studio restart [--data-dir DIR] [--cache-dir DIR] [--node PATH] [--port N] [--no-open] [--json]
```

`--data-dir` is accepted for every action. `--cache-dir`, `--node`, `--port`, and `--no-open` are startup-only and are rejected by `status` and `stop`. Defaults use `os.UserConfigDir()/codesketch`, `os.UserCacheDir()/codesketch`, executable `node`, and port `4317`. Port `0` selects an ephemeral loopback port. The runtime requires Node 22+ on macOS or Linux.

Use `paint status` for artwork playback, revisions, queue, layers, and comments. Use `paint studio status` for managed URL, instance, PID, and lifecycle state. Lifecycle state is independent of artwork playback. `Start` reuses a verified healthy current runtime; `Stop` and `Restart` preserve the strict recovery contract and never signal a metadata PID.
