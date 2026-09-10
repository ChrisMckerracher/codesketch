# CLI argument parsing

## Purpose

`parse` converts command argument tokens into separated named flags, booleans, and positional values before command-specific validation.

## Public seams

- [`Args`](parse.go) parses an argv slice against an allowed flag list.
- [`Result`](parse.go) carries `Flags`, `Booleans`, and `Positionals`.
- [`FiniteNumber`](values.go), [`Color`](values.go), [`Identifier`](values.go), [`Points`](values.go), [`Crop`](values.go), and [`Boolean`](values.go) validate typed values.

## Core files

`parse.go` handles flag grammar. `values.go` handles finite numeric, geometry, color, identifier, and boolean constraints.

## Allowed imports

Only Go standard-library packages are used. This package does not import the CLI runner or transport.

## Invariants

Unknown and duplicate flags are rejected. Boolean flags cannot receive values. Negative numeric values remain valid separated values. Typed validators reject non-finite or out-of-bound data.

## Relevant root commands

The parser is exercised through `make build` and the CLI verification commands; use `paint help` for current user syntax.
