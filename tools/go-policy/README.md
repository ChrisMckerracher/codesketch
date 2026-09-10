# Go policy tools

## Purpose

This context inspects Go source, package inventories, embedded assets, runtime files, and offline toolchain settings.

## Public seams

- [`verifyGoPolicy`](index.mjs) composes the policy checks.
- [`source.mjs`](source.mjs) checks imports, source paths, and direction.
- [`inventory.mjs`](inventory.mjs) checks packages, modules, and embeds.
- [`environment.mjs`](environment.mjs) defines offline Go execution settings.
- [`runtime-inventory.mjs`](runtime-inventory.mjs) defines the shipped studio runtime inventory.

## Core files

`index.mjs` is the composition boundary. The other modules keep source, package, environment, and runtime concerns separate.

## Allowed imports

Node built-ins and these sibling policy modules are allowed. The tool reads repository metadata and invokes the installed Go toolchain; it does not modify application source.

## Invariants

Go policy rejects external modules, replacements, workspaces, unsafe embeds, forbidden imports, and source over the project ceiling. Canonical studio and docs embeds must remain exact.

## Relevant root commands

`npm run verify` includes JavaScript checks. `make verify-go` runs the Go policy path before native verification.
