# Repository tools

## Purpose

Root tools enforce source, dependency, browser, and Go-policy boundaries used by development and release verification.

## Public seams

- [`verify.mjs`](verify.mjs) runs repository JavaScript policy checks.
- [`verify-go.mjs`](verify-go.mjs) runs Go formatting, policy, vet, and test-oriented checks.
- [`browser-check.mjs`](browser-check.mjs) drives isolated browser scenarios.
- [`go-policy/`](go-policy/README.md) provides reusable Go inventory and boundary checks.

## Core files

Each tool is a native Node ES module and should keep its policy decisions close to the checked boundary.

## Allowed imports

Tools use Node built-ins and repository modules only. Shipped application code remains dependency-free.

## Invariants

Checks must preserve production port 4317 and use isolated temporary state for development or browser verification. `npm start` is development-only: it binds loopback port 0 and uses in-memory persistence.

## Relevant root commands

`npm run verify` runs the standard repository checks. `npm run test:browser` runs the browser harness against an isolated server.
