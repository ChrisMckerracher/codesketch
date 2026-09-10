# Artwork region comments

> Status: APPROVED by User. The user explicitly authorized cleanup, deployment of newest code and rebuilt CLI to sole production port 4317, and removal of staging runtimes. The one-time external production conversion is the architect's artwork-preservation decision, not a verbatim explicit user request. Conversion is outside the app and CLI only, with zero runtime migration code retained.

## Problem and goals

Codesketch pairs an external painting agent with a human director. Painting critiques are inherently spatial and concern ONLY the visible canvas composite: directors critique the rendered appearance rather than isolated layers. Plain Notes lack coordinates, leading to ambiguous revisions.

This design replaces plain Notes with artwork region comments. Directors select rectangular canvas regions or whole canvas with immediate image stabilization, explicit pause acknowledgement, and server-enforced continuation grants. Bounded context `src/direction/feedback/` manages critique state, monotonic sequencing, and v2 project persistence.

### Human flow
The director selects a region and enters a comment.
- UI region selection pauses playback and awaits server pause acknowledgement before drag activates.
- Keyboard shortcut `C` enters comment mode, `Enter` selects whole canvas (`rect: null`), and `Esc` cancels draft selection while preserving pause.
- In the composer: `Cmd+Enter` (or `Ctrl+Enter`) triggers **Send**; `Shift+Cmd+Enter` (or `Shift+Ctrl+Enter`) triggers **Apply & continue**.
- Clicking **Send** records the critique, preserves the pending queue, holds playback paused, increments `controlEpoch`, and revokes any active continuation grant (`requiresGrant: true`, `activeGrant: null`).
- Clicking **Apply & continue** records the critique, clears pending commands including any active partial stroke, increments `controlEpoch`, issues an active continuation grant (`activeGrant: { docGeneration, controlEpoch, grantToken }`), and holds playback paused until the agent submits a corrected batch.

## Architecture and bounded contexts

- **Feedback domain (`src/direction/feedback/`)**: Public `index.mjs` with focused siblings:
  - `store.mjs`: Retains up to 100 comments, monotonic sequence counter (`seq`), and opaque cursors.
  - `grant.mjs`: Manages generation- and control-epoch-bound continuation grants.
  - `schema.mjs`: Finite integer coordinates on 1000 × 700 canvas (`0 <= x < 1000`, `0 <= y < 700`, positive integers `1 <= width <= 1000 - x`, `1 <= height <= 700 - y`), `visibleLayers` array (`{ id, opacity }`), text sanitization (1..2000 chars), and the current v2 comment schema.
- **Direction (`src/direction/`)**: `session.mjs` coordinates document replay, guards agent mutations against current generation and control epoch, and rotates document generation on `new`/`load`. `project.mjs` serializes v2 projects and rejects obsolete formats explicitly without migration.
- **Transport (`src/transport/server.mjs`)**: Exposes comment lifecycle endpoints and explicit heartbeat polling (`POST /api/comments/poll`), enforcing grant checks on agent executions.
- **Studio (`src/studio/`)**: Presentation in `public/index.html` and `public/inspector.css`. Implements region comment list, numbered pins, anchored composer popover, and ephemeral listener status.
- **Tooling & Verification (`tools/browser-check.mjs`)**: Playwright verification covers region selection, pause handshake, window resize, focus restoration, and pure artwork PNG export.

## Lead design decisions

### 1. Document generation, control epoch, and continuation grants
- `docGeneration`: Random UUID rotated strictly on session reset (`new`), project import (`load`), or server restart. Preserved across pauses and drawing steps.
- `controlEpoch`: Monotonic integer incremented on human pause, new comment creation, or manual mark edit. Every guarded agent mutation requires explicit `expectedDocGeneration` and `epoch`, even on fresh untouched sessions. Fresh untouched sessions start with `requiresGrant: false, activeGrant: null`; execution proceeds with matching context and no grant token until human intervention occurs (pause, comment, or manual edit). Project load restores paused with no active grants (`requiresGrant: true`, `activeGrant: null`). Session reset (`new`) restores fresh (`requiresGrant: false`, `activeGrant: null`).
- `continuationGrant`: `{ docGeneration, controlEpoch, grantToken }`. Grants bind strictly to the matching generation and control epoch.
- **Staging vs execution**:
  - *Staging*: Submissions with explicit `play: false` (or `--paused`) matching current `docGeneration` and `controlEpoch` are accepted without a grant, queuing commands in a paused state with zero marks committed.
  - *Execution*: Agent commands requesting execution (`play: true`, `resume`, `step`, immediate marks) require an active continuation grant matching current `docGeneration` and `controlEpoch`. Stale mutations are rejected atomically with HTTP 409.
  - *Human controls*: Trusted local UI actions. Human clicking Resume increments `controlEpoch` and issues a continuation grant for that new epoch, authorizing pending work. Later human pause, comment, or manual edit revokes this grant.
  - *Undo/redo/clear grant invalidation*: Successful execution of `undo`, `redo`, or `clear` invalidates the active continuation grant and increments `controlEpoch`, requiring agents to re-observe state; never invent or renew grant tokens.
  - *Agent load wrapper*: The load API requires `{"project": <v2_project>, "source": "agent", "expectedDocGeneration": G, "epoch": E, "grantToken"?: T}`. Raw project POST bodies are rejected before mutation. Trusted local recovery calls domain load directly.
  - *Production protection*: Port 4317 is sole production running newest released code; outage sev0. Only lead-managed authorized release can restart or replace production processes. Replace production runtime data only during an authorized managed release with a verified backup, and never use `.studio/session.json` for tests. All feature development, automated tests, and browser tests must use separate loopback ports (ephemeral preferred) and separate temporary persistence. Keep served production files under release control; use an isolated checkout for future development. Use no persistent staging runtime.

### 2. Visible composite, stabilization handshake, and spatial bounds
- **Visible composite concern**: Comments critique the visible canvas composite across all visible layers. The selected/active layer does not restrict comment target. The server records `visibleLayers: [{ id, opacity }, ...]` in document stacking order for layers with `visible === true` and `opacity > 0` from paused artwork. Hidden and zero-opacity layers are excluded from inspection pixels (the renderer already composites visibility). Stored `visibleLayers` context documents what the human saw.
- Changing layer visibility or opacity advances `artRevision`, which invalidates pending drafts through `expectedArtRevision` and displays "Artwork changed" on existing comments.
- Selecting the Comment tool (`C`) requests a pause and awaits server acknowledgement. The ACK returns current artwork context (`docGeneration`, `controlEpoch`, `artRevision`, `cursor`). If pause fails, selection aborts safely.
- Canvas drag coordinates normalize to positive nonzero width and height within `[0, 1000]` and `[0, 700]`. Whole-canvas comments use `rect: null`.
- Submissions transmit expected `docGeneration` and `artRevision`. If mid-flight queue ticks or layer toggles advanced the revision before pause settled, submission is rejected atomically, preserving draft text in the composer for reselection.
- Client generates an idempotent `requestId` per draft. Submission validation order: `expectedDocGeneration` is validated first. Idempotent `requestId` deduplication is evaluated second (identical payload returns the recorded comment; changed payload with the same `requestId` returns HTTP 409 Conflict). `expectedArtRevision` is validated third (rejecting stale artwork drafts).
- `Escape` dismisses the composer and preserves pause. Network failure preserves draft text and bounds.

### 3. Lifecycle, sequence, and opaque cursors
- Comment lifecycle: `open` → `acknowledged` → `addressed` → `resolved`.
  - Agent actions: `paint comments ack <id> --generation <gen> --seq <seq>`, `paint comments address <id> --generation <gen> --seq <seq>`. Both flags are required.
  - Human actions: `resolve` (addressed → resolved) and `reopen` (any → open).
- Every lifecycle update increments a monotonic sequence counter (`seq`). Write requests transmit `expectedDocGeneration` and `expectedSeq` to reject delayed edits after project load or reopen.
- Opaque cursor wire format: Opaque JSON tuple string `[instanceId, docGeneration, maxSeq]` (e.g. `["sess-1","gen-1",5]`), treated by clients as an opaque token string up to 256 bytes.
- Client reconnect with mismatched `instanceId` or `docGeneration` returns full retained comments (up to 100) with `reset: true`.
- When `current.artRevision !== comment.artRevision`, UI displays "Artwork changed". Bounding boxes remain stable spatial anchors. Overlays are excluded from PNG exports. Current `paint view` captures the currently visible composite.

### 4. Heartbeat and polling transport
- Single polling endpoint: `POST /api/comments/poll` with body `{ since }`. No GET wait endpoint.
- CLI implements bounded wait/watch by polling at 400ms intervals (default 30s timeout, max 30s; Ctrl+C exits with 130).
- `paint comments wait`:
  - With no `--since`: existing non-empty comment list returns immediately; an empty initial response establishes baseline and waits.
  - In a listening loop, always retain `envelope.cursor` and pass `--since '<cursor>' --json --timeout 30`; without `--since`, existing comments return immediately on every call.
  - When a supplied `--since` cursor encounters a reset from the server (e.g. generation rotation or instance mismatch), returns immediately even when the delta is empty so the caller receives the reset envelope. On reset, adopt new context and discard stale grants.
  - On timeout: exits 1 with `COMMENTS_TIMEOUT` and never resumes playback. On timeout, run `comments list --json` (or `status --json` plus list) to inspect current grant and epoch, process any pending open or acknowledged work, retain the latest returned cursor, and re-enter bounded wait.
- `paint comments watch`:
  - Streams the initial envelope then subsequent change events (`change`, `reset`, `control`) as compact NDJSON `{event, envelope}` (or formatted text).
  - Normal deadline exits clean 0; interruption exits 130.
- Ephemeral heartbeat: `POST /api/comments/poll` updates `lastSeenAt` in memory with a 5s TTL. Heartbeat presentation updates even when artwork revision is unchanged. Studio local timer transitions status to "Not listening" upon expiry. Plain reads (`GET /api/comments`, `GET /api/state`, `paint status`, `paint comments list`) do NOT update heartbeat. No disk writes or `artRevision` increments on polling.

### 5. Native CLI suite and current contracts
- Playback `wait` and `watch` observe playback settling and session changes, not comment listening. `comments list|wait|watch|ack|address` observe and process human direction and control changes. Legacy `paint feedback` command/interface is removed.
- New top-level CLI commands:
  - `paint comments [list|wait|watch|ack|address]`
  - `paint comments list [--json]` (default)
  - `paint comments wait [--since <cursor>] [--timeout <seconds>] [--json]`
  - `paint comments watch [--since <cursor>] [--timeout <seconds>] [--json]`
  - `paint comments ack <id> --generation <docGeneration> --seq <seq> [--json]`
  - `paint comments address <id> --generation <docGeneration> --seq <seq> [--json]`
  - Mutation context flags `--generation STRING --epoch N` required across every guarded agent mutation (`stroke`, `rect`, `ellipse`, `fill`, `layer` mutation subcommands `add`/`update`, `submit`, `load`, `resume`, `step`, `clear`, `undo`, `redo`, `new`), even on fresh sessions, plus optional `--grant TOKEN` when execution is gated. Read-only commands, `pause`, `speed`, and `layer list` are exempt.
  - Flags forward strictly from observed state/comments envelopes; CLI never refreshes or fetches state automatically.
  - `paint submit --paused --generation <gen> --epoch <epoch> <file>` stages pending work without grant.
  - `paint resume --generation <gen> --epoch <epoch> --grant <token>` resumes execution with active grant.
- Grants delivered in `POST /api/comments/poll` response envelope and `/api/state`.

### 6. Project v2 schema and obsolete format rejection
- Serializes `codesketch` version 2: `{"format":"codesketch","version":2,"commands":[...],"cursor":N,"queue":[...],"comments":[...]}`.
- Backwards compatibility is permanently forbidden: obsolete v1 projects are rejected explicitly; no v1 migration or null-provenance acceptance. Comments require a nonnegative integer `artRevision` and a `visibleLayers` array. Keep `rect: null` for whole-canvas comments, nullable lifecycle timestamps for transitions not reached, and `request: null` for load.
- Control grants and epochs are transient session state and are not persisted in project files.

## Artist loop

1. Check `paint status` and `paint comments list --json` before each short batch to establish baseline context, baseline control fields, and obtain the initial `envelope.cursor`. Process any existing pending comments from this initial list before awaiting new ones.
2. During intentional review pauses, execute bounded `paint comments wait --since '<cursor>' --json --timeout 30` repeatedly to stay alive and listen.
   - Retain latest opaque `envelope.cursor`. Without `--since '<cursor>'`, existing comments return immediately on every call.
   - On timeout (`COMMENTS_TIMEOUT`): run `paint comments list --json` (or `status --json` plus list) to inspect current grant and epoch, process any pending open or acknowledged work, retain the latest returned cursor, and re-enter wait when still awaiting comments. This catches human Resume actions occurring between bounded invocations.
   - On reset (`envelope.reset == true`), adopt new context (`docGeneration`, `controlEpoch`, new `cursor`), discard stale grant, and continue waiting.
   - External runtime must keep the agent turn running; Codesketch does not automatically wake or launch agents after exit.
   - Only explicit comments polling (`POST /api/comments/poll`) marks the studio status as "Listening" (expires after 5 seconds). Plain reads/status do not refresh the heartbeat.
3. On incoming comment:
   - Inspect comment bounds (`rect: {x,y,width,height}` on 1000×700 or `null` for whole canvas) and `visibleLayers` (visible layers with opacity > 0 in document stacking order, independent of active layer).
   - Inspect only the current visible composite: via `paint view --crop <x,y,w,h>` for region comments, or `paint view` without `--crop` for whole-canvas comments (`rect: null`). Review with image reader.
4. Run `paint comments ack <id> --generation <docGeneration> --seq <seq>`. Both flags are required. The JSON response returns a state snapshot without a poll cursor; run `paint comments list --json` after each `ack` to obtain the newest opaque cursor and sequence.
5. Formulate corrected marks and handle staging vs execution:
   - If an active grant is available: execute with `paint submit revisions.json --generation <docGeneration> --epoch <epoch> --grant <grantToken>` and wait for playback to settle (`paint wait --timeout 30`).
   - If no grant is active (e.g. human Send): stage while paused without grant via `paint submit revisions.json --paused --replace --generation <docGeneration> --epoch <epoch>`.
   - Staged corrections have not rendered to the canvas. Do not fall through to visual verification or mark addressed while staged. Explicitly stay in the listening state (`paint comments wait --since '<cursor>' --json --timeout 30`) until human direction authorizes execution (e.g. human clicks Resume, issuing an active grant). After execution completes and playback settles (`paint wait`), proceed to verification.
6. Verify resulting canvas: capture via `paint view --crop <x,y,w,h>` (or without crop for whole canvas) and confirm the correction with the image reader.
7. Mark critique addressed via `paint comments address <id> --generation <docGeneration> --seq <latestSeq>`. Both flags are required. Run `paint comments list --json` after each `address` to obtain the newest opaque cursor and sequence.
8. Return to calling bounded `paint comments wait --since '<cursor>' --json --timeout 30` to await human review (resolve, reopen, or further comments). Never assume playback auto-resumes or that an agent is launched automatically.

## Wire and control contracts

- `POST /api/comments`: `{ requestId, text, rect, continuePlayback, expectedDocGeneration, expectedArtRevision }` → `{ ...snapshot, heartbeat }`
- `POST /api/comments/ack`: `{ id, expectedDocGeneration, expectedSeq }` → `{ ...snapshot, heartbeat }`
- `POST /api/comments/address`: `{ id, expectedDocGeneration, expectedSeq }` → `{ ...snapshot, heartbeat }`
- `POST /api/comments/resolve`: `{ id, reopen?: boolean, expectedDocGeneration, expectedSeq }` → `{ ...snapshot, heartbeat }`
- `POST /api/comments/poll`: `{ since: string | null }` → `{ cursor, comments, reset, docGeneration, controlEpoch, requiresGrant, activeGrant, heartbeat: { lastSeenAt } }`
- `POST /api/control`: `{ action, speed?, expectedDocGeneration?, epoch?, grantToken?, source? }`
- `POST /api/commands`: `{ commands, play?: boolean, immediate?: boolean, replace?: boolean, expectedDocGeneration?, epoch?, grantToken?, source? }`
- `POST /api/project`: `{ project: <v2_project>, source: "agent", expectedDocGeneration, epoch, grantToken? }` (raw project POST bodies rejected; internal recovery calls domain loader directly)

Grants and epochs flow explicitly from observed snapshots. Delayed work presenting stale `expectedDocGeneration` or `epoch` is rejected atomically and must not refresh the epoch silently.

## Affected files across codebase

| Bounded Context | File Path | Role |
| :--- | :--- | :--- |
| `src/direction/feedback` | `index.mjs`, `store.mjs`, `grant.mjs`, `schema.mjs` | Domain entities, sequencing, control epoch, grant validation. |
| `src/direction` | `session.mjs`, `project.mjs`, `index.mjs` | Session generation rotation, dual-boundary mutation guard, v2 project serialization. |
| `src/transport` | `server.mjs`, `http.mjs` | Comment routes, poll endpoint, ephemeral heartbeat TTL, 409 responses. |
| `src/studio` | `public/index.html`, `public/inspector.css` | Comment overlays, anchored composer, SVG pins, "Not listening" status. |
| `src/studio` | `canvas-controller.mjs`, `tools-ui.mjs`, `comments/`, `api.mjs` | Pause handshake, normalized drag, focus management, resize repositioning. Delete feedback-ui.mjs. |
| `internal/cli` | `session.go`, `format.go`, `observe.go`, `run.go`, `help.go`, `comments*.go`, `grants*.go` | New `paint comments` commands, remove legacy feedback, crop inspection. |
| `tools` | `tools/browser-check.mjs` | Browser harness covering pause handshake, resize, focus, and clean PNG export. |
| `docs` | `docs/artist-skill/references/cli-craft.md` | Agent guidance for poll, crop view, ack, staging, address loop. |

## Test strategy

- **Domain unit tests (`tests/direction-feedback.test.mjs`)**:
  - Coordinate normalization, finite non-zero bounds, 1000 × 700 clamping, 2000 character limits.
  - Visible composite layer context (`visibleLayers` with `visible=true` and `opacity>0` in stacking order).
  - Idempotency with matching payload and 409 conflict on altered payload under same `requestId`.
  - Monotonic sequence advancement across all lifecycle actions; opaque cursor roundtrips.
  - Generation and control epoch invalidation; grant persistence across correction batches.
  - Project v2 roundtrip and obsolete format rejection.
- **Transport tests (`tests/transport-comments.test.mjs`)**:
  - `POST /api/comments/poll` returns full state on first request or generation mismatch, empty on repeated cursor.
  - Ephemeral heartbeat updates without storage writes or revision advances.
  - Atomic 409 rejection on ungranted execution or stale epoch mutation; staged `play: false` accepted.
  - Trust boundary: loopback-only, CSP headers, strict JSON payloads.
- **CLI native tests (`internal/cli/comments_test.go`)**:
  - Strict flag parsing (`--grant`, `--epoch`, `--since`, `--timeout`).
  - Bounded wait/watch polling at 400ms, deadline <= 30s, clean exit on context cancellation or SIGINT.
  - Legacy `paint feedback` command removed; comments lifecycle commands verified.
- **Studio browser tests (`tools/browser-check.mjs`)**:
  - Stabilization handshake before selection; window resize recalculates overlay anchors.
  - Keyboard focus restoration to canvas/composer; Esc dismissal.
  - PNG export contains pure artwork canvas pixels without overlay pins.

## Risks and decisions

- **Runtime presence**: Codesketch is a local instrument and does not manage external agent lifecycles. Agents must remain running to poll. Timeouts preserve pause safely.
- **Conservative artwork changed badge**: Any mark committed after comment creation marks the comment as modified, keeping spatial context honest without storing transient screenshots.
- **Project schema migration**: Codesketch enforces plain v2 project container with valid commands, cursor, queue, comments. Obsolete formats are rejected without migration.

Implementation proceeds in strict order: domain/persistence, transport guards, UI, native CLI, guides/checks.
