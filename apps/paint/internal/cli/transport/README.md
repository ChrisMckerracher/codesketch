# Studio transport

## Purpose

`transport` is the bounded, loopback-only HTTP client for the local studio API.

## Public seams

- [`Endpoint`](client.go) validates an HTTP(S) loopback origin.
- [`New`](client.go) creates a client with proxy, redirect, timeout, and response limits configured.
- [`Client.Request`](client.go) sends a relative `/api/` request and returns validated JSON.

## Core files

[`client.go`](client.go) contains endpoint validation, DNS re-checking, request construction, response bounds, and structured remote errors.

## Allowed imports

Only Go standard-library packages are used. The package does not import the CLI runner or browser capture implementation.

## Invariants

Destinations must resolve to loopback addresses. Environment proxies and redirects are disabled. Requests are limited to 8 MiB, responses to 16 MiB, and each request to 10 seconds.

## Relevant root commands

Most networked `paint` commands use this client. Run `paint doctor` for local readiness guidance; use the [CLI craft guide](../../../../../docs/artist-skill/references/cli-craft.md) for command workflows.
