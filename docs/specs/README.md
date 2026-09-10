# Feature specifications

## Purpose

Feature specifications state observable current behavior and acceptance scenarios for Codesketch.

## Public seams

- [`features/`](features) contains Gherkin scenarios for studio, CLI, canvas feedback, and lifecycle behavior.

## Core files

[`features/native-cli.feature`](features/native-cli.feature) covers native CLI behavior. [`features/studio-lifecycle.feature`](features/studio-lifecycle.feature) covers lifecycle ownership, recovery, readiness, and managed operations.

## Allowed imports

Specifications link to implementation and plan documents but do not define code dependencies.

## Invariants

Scenarios use current contract names and production-safe isolation. Lifecycle scenarios use ephemeral ports and isolated persistence; they do not access production port 4317.

## Relevant root commands

Lead verification maps scenarios to native, JavaScript, and browser checks. Do not run those checks as part of this docs-only pass.
