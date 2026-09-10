# Shared fixtures

## Purpose

Fixtures provide stable wire examples consumed by tests in more than one language or package.

## Public seams

- [`capture-contract.json`](capture-contract.json) describes setup commands, a paused snapshot, and active cases for shared Node and Go capture contract checks.

## Core files

The capture fixture contains current document, playback, history, and active-command shapes, including non-drawing playback commands.

## Allowed imports

Fixtures are data only. Consumers validate them through their own package contracts; fixtures do not import runtime code.

## Invariants

Shared snapshots preserve current field names and semantics. Obsolete formats are rejected rather than adapted in consumers.

## Relevant root commands

The lead verification cycle consumes these fixtures through JavaScript and Go checks. Do not use production session files as fixtures.
