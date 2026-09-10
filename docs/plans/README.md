# Architecture plans

## Purpose

Plans record approved scope, contracts, risks, affected contexts, and verification expectations before implementation.

## Public seams

- [`architect/`](architect) contains bounded feature and architecture plans.
- [`architect/native-cli.md`](architect/native-cli.md) covers the native CLI.
- [`architect/studio.md`](architect/studio.md) covers studio architecture and contracts.

## Core files

Plans are source-of-truth context for ownership and sequencing; implementation docs should link here when a plan already explains an API.

## Allowed imports

Plans reference repository paths and standards. They do not create runtime dependencies.

## Invariants

Plans distinguish approved scope from shipped behavior and preserve current-only contracts, security boundaries, and production protection.

## Relevant root commands

Use `bd` to track approved implementation work. Lead verification determines whether planned behavior is actually available.
