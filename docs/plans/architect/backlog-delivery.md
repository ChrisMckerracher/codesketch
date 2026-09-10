# Backlog delivery: layout, lifecycle, and playback finish

Lead and user approved all beads and the managed release to sole production port 4317.

## Problem and goals

- Problem: root-level coupling between CLI and studio packages obscures boundaries; session persistence drops active stroke progress on reload; process shutdown cannot prove disk persistence before socket close; and finishing queued playback requires waiting for real-time stroke ticks.
- Goals: clear monorepo layout under `apps/paint` and `apps/studio`; CLI ownership of runtime extraction, verified discovery, and browser launch; strict v1 recovery preserving partial preview on explicit flush/stop/restart; and atomic skip-to-end finish with individual undo preservation.

## Parent beads and scope

- `paint-2jm`: Adopt a clear Go and JavaScript monorepo layout.
  - `paint-2jm.1`: Relocate native CLI into `apps/paint`.
  - `paint-2jm.2`: Relocate studio into `apps/studio`.
  - `paint-2jm.3`: Update monorepo integrity checks and verify relocation.
- `paint-s86`: Make the CLI own the studio server and browser lifecycle.
  - `paint-s86.1`: Preserve active painting in strict recovery snapshots.
  - `paint-s86.2`: Add authenticated studio readiness and graceful shutdown.
  - `paint-s86.3`: Package canonical studio assets in the native CLI.
  - `paint-s86.4`: Implement owned native studio process lifecycle.
  - `paint-s86.5`: Expose encompassing paint CLI and verify lifecycle.
- `paint-t4o`: Add Skip to end for queued drawing playback.
  - `paint-t4o.1`: Finish pending drawing atomically in the session domain.
  - `paint-t4o.2`: Expose Skip to end in studio and native CLI.

## Monorepo layout and asset boundaries

- Layout: root Go module (`go.mod`), root npm package, root `Makefile`, root policy checks, and root `tools/`.
- Native CLI: `apps/paint/cmd/paint` and `apps/paint/internal/cli/...`.
- Studio web application: `apps/studio/src`, `apps/studio/public`, and `apps/studio/tests`.
- Assets: `apps/studio/assets.go` owns canonical runtime studio assets, consumed by CLI lifecycle extraction and capture. `docs/assets.go` owns embedded offline instructions. Remove the root `assets.go`.
- Shared wire fixtures remain at `tests/fixtures/`.
- Policy checks: update `tools/go-policy/` and `tools/verify.mjs` to validate relocated packages and line budgets (<200 preferred, 300 hard ceiling).

## Studio lifecycle and instance ownership

- Runtime packaging: atomic extraction to a verified cache directory keyed by content digest, separate from durable user data directories (`--data-dir`).
- Process serialization: Go CLI lifecycle operations are serialized and idempotent. Enforce one live writer per data directory.
- CLI commands:
  - Bare `paint`: starts a studio process or reuses a verified healthy instance, then opens the browser. Browser launch failure leaves the healthy studio available.
  - `paint studio [start|status|stop|restart]`: manages studio runtime.
  - Flags: `--no-open` suppresses browser launch; `--data-dir <path>` and `--port <port>` isolate runtime state.
- Discovery and instance ownership:
  - CLI checks listener status and verifies instance identity, version, and runtime digest. Current digest mismatch is rejected without automatic fallback to obsolete readers.
  - Occupied ports with alien or unauthenticated processes are reported as errors without process takeover.
  - PID files are diagnostic only; termination authority requires matching capability credentials.
- Security and capability authentication:
  - Control endpoints (`GET /api/lifecycle/status`, `POST /api/lifecycle/stop`) require a private capability token via `X-Codesketch-Capability`.
  - Strict loopback and Host validation; reject requests with browser `Origin` or `Sec-Fetch-Site` metadata.
  - Stop request payload requires `{ instanceId }`. Concurrent authenticated HTTP stop requests coalesce into one shutdown operation.
- Test and development isolation:
  - Node entrypoint supports port 0 for ephemeral port assignment.
  - Feature tests and browser runs use isolated temporary data directories and ephemeral loopback ports.
  - Sole production port 4317 is protected: no tests, development runs, or unmanaged scripts touch port 4317 or `.studio/session.json`.

## Graceful shutdown and persistence contract

- Shutdown sequence:
  1. Authenticate request via capability header and match `instanceId`.
  2. Engage transport `stopping` gate to reject late mutations with HTTP 503; suspend tick scheduling.
  3. Quiesce playback, preserve queue and active progress, set paused, and invalidate continuation grants once.
  4. Await `flush()` capturing the current recovery snapshot.
  5. On flush failure: return HTTP 500, clear `stopping` gate, remain paused, and keep server and session live for retry.
  6. On flush success: return HTTP 200, close listener, terminate idle connections, and exit process cleanly.
- `attachPersistence(session, filename)` provides `flush()` returning `Promise<void>`.
  - `flush()` immediately captures `session.recovery()`, enqueues behind pending disk writes, and rejects if serialization or disk sync fails.

## Strict recovery schema and session restoration

- Recovery envelope format:
  ```js
  {
    format: 'codesketch-recovery',
    version: 1,
    project: currentV2Project,
    active: null | { progress: number },
    speed: number
  }
  ```
- Structural rules:
  - `project.queue[0]` owns the active command when `active !== null`; store command once.
  - Derived duration: `playbackDuration(command)` computes `Math.max(120, distance / 0.55)`.
  - Finite numeric `speed` in `[0.25, 8]`; finite numeric `active.progress` in `[0, 1)`.
  - `validateRecovery()` enforces strict shape, v2 project validation (`validateProject`), and 8 MiB maximum size (7 MiB nested project). Reject unknown fields, legacy formats, and v0 files without migration.
- Session restoration:
  - Explicit `flush()`, `stop`, and `restart` capture and preserve current partial preview. Unexpected crashes recover the last successfully persisted snapshot; unpersisted in-flight progress is lost.
  - Reconstruct active preview from normalized `queue[0]`, progress, and derived duration; assign remaining queue with `slice(1)`.
  - Restore history via `restore(commands, cursor)` before mutating session fields.
  - Restore comments with `request: null`; restore playback speed.
  - Session starts strictly `paused`, execution grants revoked (`{ paused: true }`), fresh instance identity generated.
  - Missing recovery file initializes a clean fresh session; malformed or unreadable recovery halts startup before readiness while preserving the original corrupt file on disk.

## Skip to end and playback finish

- Actions: UI "Skip to end" button in playback controls (disabled when queue is empty or studio is offline); CLI command `paint finish --generation <gen> --epoch <epoch> [--grant <token>]`.
- Context validation: CLI requires explicit generation and epoch flags; contextless finish is rejected. If the queue and active stroke are empty, validated execution authority returns a safe no-op reporting successful completion with zero remaining.
- Session domain operation:
  - Single atomic action `finishPending()` validating all pending items (active command and full queue) before mutation.
  - Commits active stroke and all queued commands to history at final completed state.
  - Preserves individual undo entries in document history; user can undo individual finished marks.
  - Playback transitions to `paused` with empty queue and null active preview.
  - Emits a single change publication.
  - CLI reports successful completion and zero remaining without inventing mark counts or cursor fields.
- Authority, epoch, and grants:
  - Human trigger: increments `controlEpoch`, pauses playback, and invalidates active continuation grant.
  - Agent trigger: requires explicit `expectedDocGeneration` and `epoch`, plus matching `grantToken` when execution is gated. Stale context returns HTTP 409 Conflict.
  - Atomic validation failure: if any command in the pending queue is invalid, the entire session snapshot (`status`, `preview`, `queue`, `history`, `grants`, `revisions`) remains unchanged immediately after rejection.

## Risks and decisions

- Crash recovery boundary: Unexpected crashes recover the last successfully persisted snapshot; only explicit flush/stop/restart guarantees partial preview preservation.
- Runtime isolation: Assets extract to verified cache paths keyed by content digest, isolated from durable user data directories.
- Single live writer: Enforce one live writer per data directory to prevent state corruption.
- Process safety: Mismatched digests and occupied ports abort without process hijacking or fallback readers.
- Data integrity: Startup failure on corrupt recovery data halts before readiness and leaves original disk bytes untouched.

## Delivery and verification sequence

1. Monorepo restructure: relocate directories, update Go package imports, and adjust `tools/go-policy/` verification.
2. Domain recovery & finish: implement `validateRecovery`, `playbackDuration`, `recovery()`, `restoreRecovery()`, and `finishPending()`.
3. Transport & lifecycle: implement capability-guarded lifecycle routes, stopping gate, verified flush, and port 0 support.
4. CLI lifecycle ownership: embed runtime assets from `apps/studio/assets.go`, implement process spawning, health polling, browser open, and `paint studio` subcommands.
5. Verification: run `npm run verify`, Go tests with `-race`, isolated browser checks, and record release evidence in `docs/verification.md`.
