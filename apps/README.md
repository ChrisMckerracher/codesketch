# Applications

## Purpose

Application packages contain the browser studio and the native Go CLI.

## Public seams

- [`studio/`](studio/README.md) embeds and serves the browser painting runtime.
- [`paint/`](paint/README.md) owns the native `paint` executable, CLI packages, and managed studio lifecycle.

## Core files

- [`studio/assets.go`](studio/assets.go) defines the canonical embedded runtime.
- [`paint/cmd/paint/main.go`](paint/cmd/paint/main.go) is the native process entrypoint.

## Allowed imports

Each application may import its own bounded contexts and approved repository packages. The studio runtime remains dependency-free; Go packages use standard-library imports and this module's packages only.

## Invariants

The studio runtime and native CLI share current HTTP/JSON contracts. Managed `paint` uses durable application data and production port 4317 by default; development and test workflows use port 0 or another isolated loopback port with temporary persistence. Artwork status and managed process status remain separate surfaces.

## Relevant root commands

- `npm run verify` checks JavaScript and repository policy.
- `make build` builds `bin/paint` after policy verification.

See the [repository map](../docs/repo-map.md) for cross-application ownership.
