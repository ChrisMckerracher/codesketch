# Compatibility cleanup and managed release

## Approval and scope

Approved design for `paint-2u2`, based on the independent architecture audit and the architect's strict comment-provenance decision.
The user explicitly authorized removal of all compatibility debt, deploying the newest application and rebuilt installed CLI on sole production port 4317, and removal of owned staging runtimes after validation. The one-time external production conversion is the architect's artwork-preservation decision, not a verbatim explicit user request. Conversion is outside the app and CLI only, with zero runtime migration code retained.
This authorization supersedes earlier staging-freeze forever rules for lead-managed validated cutover; the lead already surfaced the contradiction. Sole production port 4317 runs newest released code once cutover occurs. Protect production availability and actual artwork: outage sev0; only lead-managed authorized release can restart or replace production processes. Feature development and automated tests must use isolated ephemeral loopback ports with temporary persistence, never `.studio/session.json`. Keep served production files under release control; use an isolated checkout for future development. No persistent staging runtime remains after this release.
Cutover completed on September 10, 2026: production PID 23772 serves the newest code on port 4317, the rebuilt CLI is installed, and owned staging and frozen runtimes were removed after verified preservation. Release evidence is recorded in `docs/verification.md`.

## Problem and goals

The working tree supports old project versions, feedback representations, unguarded agent callers and alternate capture inputs alongside current contracts.
These branches duplicate behavior and weaken freshness checks. The release establishes one current project, API, session and CLI contract with no retained conversion code.
Preserve actual production artwork, current human pause semantics, bounded resource handling and distinct playback/comment observation.
Architecture boundaries, painting vocabulary and visual design remain as defined by the project standards.

## Canonical data contracts

- Project: `{format:"codesketch", version:2, commands, cursor, queue, comments}` is the sole accepted saved project format. Reject obsolete files explicitly; never silently migrate them.
- Preserve ordered command history, including history beyond cursor, and pending queue. Retain replay validation and existing byte, command, layer and point budgets.
- Current comments require a nonnegative integer `artRevision` and an array `visibleLayers`. Delete null-provenance acceptance and presentation branches, including legacy-specific labels and fixtures.
- Keep `rect:null` for whole-canvas comments, nullable lifecycle timestamps for transitions not reached, and `request:null` for current load behavior. An empty `visibleLayers` array means no visible layers.
- Painting `document.version:1` remains the current artwork schema, separate from the v2 project container.
- Session snapshots contain current identity, revisions, document, playback, history, comments, control context and errors. HTTP adds heartbeat. Delete the `feedback` projection.
- Grants, epochs and session identity remain transient. Loading rotates document generation, clears request replay metadata and active grant, and restores paused.

## HTTP and control flow

GET `/api/project` returns a plain v2 project. POST `/api/project` requires `{project, source, expectedDocGeneration, epoch, grantToken?}` for agent loads.
Browser human loads use the same project wrapper with human source. Trusted recovery invokes the domain loader directly; it needs no raw HTTP exception.
Reject raw project POST bodies before mutation.

Every guarded agent write requires current `expectedDocGeneration` and `epoch`, including writes to a fresh session.
Execution requires a matching token when `requiresGrant` is true. Fresh execution with current context and no required grant remains valid.
Preserve deliberate context-free pause and speed, human controls, and paused staging with current context but no execution authority.
The CLI supplies explicit context and surfaces stale conflicts without silently refreshing context or claiming human source.

Current comments creation retains request identity, generation/art-revision checks and pause semantics. Lifecycle writes retain generation/sequence checks; polling retains cursor resets and listening heartbeat.
Delete `/api/feedback`, the text adapter, adapter-only playing/budget exceptions, session feedback façade/projection, browser `sendFeedback`, and CLI `feedback` command/model/help.
Delete `FeedbackUI` and construct `CommentsUI` directly through its public entrypoint.

## CLI observation and capture

Playback `wait/watch` observes playback settling and session changes. Comments `list/wait/watch/ack/address` observes and processes human direction and control changes.
Retain both purposes and their distinct wake, timeout, cancellation and heartbeat contracts. Remove legacy feedback fields and formatting from playback observation.
Retain useful drawing, layer, crop/scale, save/load, help, completion and offline instruction behavior.

Capture accepts only the current session envelope with valid identity/revision, a document, and required canonical `playback.active`. Drawable transient input comes only from `playback.active`.
Raw documents and top-level-only active inputs reject; valid current envelopes ignore unused extra JSON properties without blacklisting. Legacy top-level active is never a data source, including when canonical `playback.active` is null (which means no transient preview and never falls back to another field).
Preserve committed export isolation, non-drawing transient behavior, canonical renderer embedding and all resource/geometry validation.

## Cleanup ownership and dependencies

The lead delegates implementation through Herdr and reviews every result. Workers use non-overlapping file ownership and track implementation with `bd`.

| Slice | Owned scope | Required evidence |
| --- | --- | --- |
| Direction and HTTP | `src/direction/{project,session,session-comments}.mjs`, `src/direction/feedback/{schema,grant}.mjs`, `src/transport/server.mjs`; associated domain/session/project/grant/HTTP/recovery tests | Obsolete inputs and missing/stale context reject atomically; current v2 round-trip and paused recovery pass; null provenance rejects |
| Native CLI | `internal/cli/{grants,prepare,run,session,format,observe,comments-format,help}.go`; associated grant/payload/run/observation/studio/comments/completion tests | Required mutation context validates before I/O; read-only layer listing remains valid; removed command disappears; current provenance and observation behavior pass |
| Studio | Delete `src/studio/feedback-ui.mjs`; update `src/studio/{index,api}.mjs` and provenance-dependent rendering in `src/studio/comments/`; associated browser checks | Direct CommentsUI construction; current creation/lifecycle/region/pause interactions and layer controls pass |
| Capture | `internal/cli/capture/snapshot.go`, capture validation/transient/contract tests, `tests/capture-contract.test.mjs`, `tests/fixtures/capture-contract.json` | raw documents/top-level-only active inputs reject; canonical nested active, committed isolation and all six command kinds retain renderer parity |
| Documentation and release | Agent guide, CLI craft reference, affected design/spec documents and verification evidence; external release artifacts | Current instructions, verified converted project, installed binary and production release evidence |

Domain contract changes precede integration verification. The capture owner updates shared Node fixture setup with current mutation context; the CLI owner updates shared CLI fixtures.
Replace compatibility-success tests with explicit rejection tests and current-contract fixtures. Preserve unrelated behavior and safety coverage.
Remove nullable-provenance branches from domain, CLI and studio within their assigned slices; retain null handling only where the current contract above requires it.
`assets.go` continues embedding canonical renderer and instruction files. Updated embedded instructions require a new CLI build.

## External conversion and managed release

Lead-inspected production evidence: v1 project, 1,625 commands, cursor 1,625, queue 0, feedback 0; production returns HTTP 200. The user continued painting during preparation, so the final verified baseline before cutover was v1 with 1,631 commands and 1,624 marks; the external conversion was regenerated from that fresh baseline and replay-validated before the managed cutover.
Back up and identify the actual production project before conversion. Convert a copy externally to v2, preserving all ordered commands, cursor and queue, with `comments:[]`.
Production has no feedback, so this conversion preserves all actual content without inventing comment metadata. Other obsolete saved files are intentionally rejected.
Keep conversion tooling outside the shipped application, CLI, embedded assets and production runtime. Retain no conversion code in the delivered implementation.

Load and round-trip the converted copy against isolated current code and temporary persistence. Compare replayed artwork, layers, marks and rendered pixels; verify paused restore and no storage error.
Run `npm run verify` and relevant native integration/capture and browser checks on separate loopback ports with temporary persistence. Never use production persistence for tests. Keep served production files under release control; use an isolated checkout for future development.
After checks, rebuild and install the CLI with final embedded instructions, verify its resolved installed path and behavior, and manage application/CLI cutover together to newest code on sole production 4317.
Verify production HTTP health, project counts, artwork, comments/control contracts and installed CLI against the released application. Preserve backup and rollback evidence.
Remove only staging runtimes and artifacts owned by this work after successful release; establish ownership before stopping processes or deleting runtime data. No persistent staging runtime remains after this release. The cutover, staging removal and production health evidence are recorded in `docs/verification.md` as completed on September 10, 2026.

## Risks and release gates

Deploying the v2-only reader against the original v1 file fails recovery; a later edit can overwrite that file. Verified external conversion and backup are mandatory before cutover.
Old painter binaries and automation lack the new command/context contract. Update callers with the release; replacing the executable does not update already-running processes.
Production outage recovery takes precedence over cleanup. Keep release operations under the lead's managed sequence and verify health immediately after cutover.
No unresolved contract decisions remain. Record actual verification and release outcomes in `docs/verification.md`; approval does not substitute for evidence.
