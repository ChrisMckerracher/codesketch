# Repository tests

## Purpose

Root tests verify repository policy, runtime embedding, dependency rules, and shared cross-language contracts.

## Public seams

- [`policy.test.mjs`](policy.test.mjs) checks dependency and source policy fixtures.
- [`go-policy.test.mjs`](go-policy.test.mjs) checks Go inventory and boundary policy.
- [`runtime-policy.test.mjs`](runtime-policy.test.mjs) checks canonical runtime embeds and lifecycle boundaries, including the managed entrypoint seam.
- [`fixtures/`](fixtures/README.md) stores shared wire data.

## Core files

`go-policy-fixture.mjs` builds isolated policy repositories for focused cases. Tests invoke repository tools or installed toolchains without changing the checkout.

## Allowed imports

Tests use Node built-ins and repository tools. They may create temporary directories and subprocesses; they do not use production persistence.

## Invariants

Fixtures reject obsolete or unsafe contracts. Runtime inventories exclude guidance files and require exact canonical embeds. Current project v2 and strict recovery v1 remain distinct contracts; partial playback progress belongs to recovery, not the saved project envelope.

## Relevant root commands

`npm run verify` runs the repository checks. Full native and browser verification remains lead-owned for this documentation pass.
