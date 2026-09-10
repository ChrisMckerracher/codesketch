# Project documentation

## Purpose

`docs` contains offline agent guidance, artist references, architecture plans, standards, feature specifications, and verification evidence.

## Public seams

- [`agent-guide.md`](agent-guide.md) is embedded for offline CLI guidance.
- [`artist-skill/`](artist-skill/SKILL.md) defines reference-driven painting workflow.
- [`standards/`](standards/README.md) defines repository contracts.
- [`plans/`](plans/README.md) records approved architecture scope.
- [`specs/`](specs/README.md) records executable feature expectations.

## Core files

[`assets.go`](assets.go) embeds the exact guide and artist-skill bundle. [`verification.md`](verification.md) records release evidence; this documentation pass does not update release evidence.

## Allowed imports

Documentation may link to source and related guides. Embedded docs are explicitly allowlisted by Go policy; application code does not import arbitrary documentation.

## Invariants

Guidance describes current contracts, preserves production protection, and rejects obsolete formats. The native lifecycle is current behavior; plans distinguish implemented behavior from pending work. Project saves use v2, strict recovery uses v1, and partial playback progress belongs to recovery snapshots.

## Relevant root commands

`paint guide` prints the embedded guide. `npm run verify` and `make verify-go` validate documentation embedding and repository policy.
