# Repository standards

## Purpose

Standards define architecture, security, interface, testing, and release expectations shared by the application and native CLI.

## Public seams

- [`architecture.md`](architecture.md) defines bounded contexts and import direction.
- [`security.md`](security.md) defines local trust and supply-chain rules.
- [`interface.md`](interface.md) defines the Mac visual language.
- [`testing.md`](testing.md) defines isolated verification and release evidence.

## Core files

These standards are the review baseline for source, tests, docs, and runtime changes.

## Allowed imports

Architecture and security standards constrain implementation dependencies; they do not introduce runtime imports.

## Invariants

Production remains protected, shipped code stays dependency-free, current contracts replace obsolete behavior, and bounded contexts retain explicit ownership.

## Relevant root commands

Use `npm run verify` and the lead-owned native/browser verification cycle to apply these standards.
