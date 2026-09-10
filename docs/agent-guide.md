# Codesketch Agent Integration Guide

Codesketch is a local, dependency-free painting instrument designed for collaborative drawing between AI agents and human observers. The human watches strokes appear in real time on the canvas, pauses the painter at will, and leaves region or whole-canvas comments to guide the painting process.

This document is the complete guide for painting agents. You do not need to read the application source code to paint, observe, or respond to comments.

Read `paint --artist-skill` for the complete paint-with-references workflow: inspect visual references, construct a pencil drawing, incorporate sketch critique, and develop the approved painting. The offline bundle includes its reference-study and CLI craft/recovery notes. `paint guide --artist-skill` is equivalent, and both support `--json`.

### Managed studio lifecycle

Bare `paint` starts or reuses the current verified studio runtime and opens its loopback URL in the default browser. The explicit management surface is:

```text
paint studio start [--data-dir DIR] [--cache-dir DIR] [--node PATH] [--port N] [--no-open] [--json]
paint studio status [--data-dir DIR] [--json]
paint studio stop [--data-dir DIR] [--json]
paint studio restart [--data-dir DIR] [--cache-dir DIR] [--node PATH] [--port N] [--no-open] [--json]
```

Normal management runs on macOS or Linux with Node 22+, durable data at `os.UserConfigDir()/codesketch`, a digest-keyed runtime cache at `os.UserCacheDir()/codesketch`, and port `4317`. Port `0` selects an ephemeral loopback port. `--data-dir` applies to every action; `--cache-dir`, `--node`, `--port`, and `--no-open` are startup-only and are rejected by `status` and `stop`. `paint studio status` reports managed URL, instance, PID, and lifecycle state; `paint status` reports artwork revisions, playback, queue, layers, and comments.

Managed stop and restart flush strict recovery envelope v1. A saved project remains plain editable project format v2 and does not contain transient grants, epochs, or partial active-stroke progress. Recovery preserves the latest durable session snapshot and explicitly flushed partial progress. Malformed or obsolete recovery is rejected without migration. Human pause remains authoritative: stop, restart, and agent commands do not grant continuation.

For development, `npm start` starts an isolated in-memory studio on loopback port `0`. It never uses production port `4317` or `.studio/session.json`; tests and browser checks use the same isolated-port and temporary-persistence rules.

---

## 1. System Model & Operating Limits

- **Canvas Dimensions**: The document is a fixed 1000 x 700 coordinate space ((0, 0) at top-left to (1000, 700) at bottom-right).
- **Default Layer**: The default artwork layer is named "paint". Additional layers stack back-to-front above previous layers.
- **Atomic Batch Validation**: Every mark or batch submitted is simulated against the document state before acceptance. If any coordinate, color, or property is invalid, the entire batch is rejected atomically without mutating the painting history or canvas.
- **Human Pause vs Agent Pause**:
  - When a human pauses execution or creates a comment, playback pauses stickily.
  - An agent pause (`--paused`) queues commands while leaving playback paused for staging.
  - Selecting a region in the studio pauses playback and awaits server pause acknowledgement. Keyboard shortcut `C` enters comment mode; `Enter` selects whole canvas; `Esc` cancels draft and preserves pause.
  - In the composer: `Cmd+Enter` (or `Ctrl+Enter`) triggers **Send**; `Shift+Cmd+Enter` (or `Shift+Ctrl+Enter`) triggers **Apply & continue**.
  - **Send**: records the comment, preserves the pending queue, holds playback paused, increments `controlEpoch`, and revokes any active continuation grant (`requiresGrant: true`, `activeGrant: null`).
  - **Apply & continue**: records the comment, clears active partial strokes and the pending queue, increments `controlEpoch`, issues an active continuation grant (`activeGrant: { docGeneration, controlEpoch, grantToken }`), and holds playback paused until the agent submits a corrected batch.
  - **Human Resume**: clicking Resume in the studio issues an active continuation grant for the incremented control epoch and authorizes playback. Later human pause, comment, or manual edit revokes this grant.
  - **Session Reset (`new`) vs Project Import (`load`)**:
    - `new` resets the session: rotates `docGeneration` to a new UUID, resets `controlEpoch` to 0, sets status to `idle`, and clears grant requirements (`requiresGrant: false`, `activeGrant: null`).
    - `load` restores a project: rotates `docGeneration` to a new UUID, resets `controlEpoch` to 0, sets status to `paused`, and requires a grant without issuing one (`requiresGrant: true`, `activeGrant: null`).
  - Never present unconditional resume as the next step after every human pause. Only resume when the human direction has been incorporated and continuation is authorized.
- **Staging vs Execution**:
  - *Staging*: Submissions with explicit `play: false` (or `--paused`) matching current `docGeneration` and `controlEpoch` are accepted without a grant, queuing commands in a paused state with zero marks committed.
  - *Execution*: Agent commands requesting execution (`play: true`, `resume`, `step`, `finish`, unpaused `submit`, or drawing marks) require matching `docGeneration` and `controlEpoch`, plus an active continuation grant token (`--grant TOKEN`) whenever `requiresGrant` is true.
  - *Fresh untouched sessions*: Every guarded agent mutation requires explicit `--generation STRING --epoch N` matching current session context, even on a fresh untouched session. Fresh sessions start with `requiresGrant: false, activeGrant: null`; execution proceeds with matching context and no grant token until human intervention occurs.
- **Control Grants & Explicit Mutation Context**:
  - Mutation commands require explicit context flags: `--generation STRING --epoch N` (paired together) and optional `--grant TOKEN` (requires both).
  - Required by every guarded agent mutation: `stroke`, `rect`, `ellipse`, `fill`, `layer` (mutation subcommands `add` and `update`), `submit`, `load`, `resume`, `step`, `finish`, `clear`, `undo`, `redo`, `new`.
  - Read-only commands (`layer list`, `status`, `view`, `export`, `wait`, `watch`, `comments list/wait/watch`, `help`, `guide`, `version`, `completion`) and `pause`/`speed` are exempt from context flags.
  - Human UI controls act with trusted `source: "human"`.
  - Flags forward strictly from observed state or comments envelopes. The CLI never refreshes or fetches state automatically; stale 409 conflicts surface as errors.
  - Successful `undo`, `redo`, and `clear` invalidate active continuation grants upon execution, incrementing `controlEpoch`. The caller must re-observe state to learn the updated control epoch rather than inventing or renewing grant tokens.
  - Agent `load` API wrapper: HTTP POST `/api/project` requires `{"project": <v2_project>, "source": "agent", "expectedDocGeneration": G, "epoch": E, "grantToken"?: T}`. Raw project POST bodies are rejected before mutation. Managed recovery invokes `restoreRecovery` with strict recovery v1; project import uses `load`.
  - Project persistence: saves and loads plain v2 format (`{"format":"codesketch","version":2,"commands":[...],"cursor":N,"queue":[...],"comments":[...]}`). Backwards compatibility is permanently forbidden: obsolete v1 formats are rejected explicitly without migration. Comments require a nonnegative integer `artRevision` and a `visibleLayers` array. Whole-canvas comments use `rect: null`; lifecycle timestamps default to `null` until reached; loaded comments have `request: null`. Control grants and epochs are transient session state and never persisted.
- **Queue Replacement**: Replacing the queue (`--replace`) cancels unrendered pending work and any active partial stroke, while safely preserving all previously committed history marks.
- **Zero External Dependencies**: The studio and CLI require zero third-party packages. Headless Chromium capture is handled internally without Playwright.
- **Local Loopback & Production Protection**: Port 4317 is sole production, running the newest released code. Protect production availability and actual artwork: an outage is sev0; only lead-managed authorized release can restart or replace production processes. Replace production runtime data only during an authorized managed release with a verified backup, and never use `.studio/session.json` for tests. All feature development, automated tests, and browser tests must use separate loopback ports (ephemeral preferred) and separate temporary persistence. Keep served production files under release control; use an isolated checkout for future development. Use no persistent staging runtime.

### Architectural Limits

| Limit | Boundary | Description |
|---|---|---|
| Commands per session | 3,000 | Total committed marks plus queued commands |
| Points per stroke | 2,000 | Maximum coordinate pairs in a single stroke |
| Total document points | 150,000 | Sum of all stroke points across document history |
| Concurrent layers | 24 | Maximum artwork layers |
| Comments | 100 | Maximum stored comments (up to 2,000 chars each) |
| Comment regions | 1000 × 700 | Finite integer `rect {x,y,width,height}` or `null` (whole canvas) |
| Visible layers in comments | 24 | Array of `{id, opacity}` for visible layers (`opacity > 0`) in stacking order |
| Comments polling timeout | 0.001 to 30s | Bounded comments wait/watch timeout (default 30s) |
| Playback speed | 0.25x to 8x | Supported animation playback multipliers |
| Request body ceiling | 8 MiB | Maximum JSON payload size |
| Response stream ceiling | 16 MiB | Maximum state/comments read size |
| Project budget | 7 MiB | Enforced serialization budget for projects |

---

## 2. Drawing Primitives & Renderer Mechanics

### Brushes (stroke)
Strokes follow a continuous path across coordinate pairs:
- brush (default): Five soft overlapping passes [1.18x, 1.0x, 0.82x, 0.64x, 0.46x size] rendered with round caps at opacity * 0.16. This creates a soft, expressive, buildable stroke.
- pencil: Fine, sharp line with round caps rendered at width max(1, size * 0.35) and opacity * 0.85. Perfect for sketching structural contours and hatching.
- marker: Translucent stroke with square line caps rendered at opacity * 0.45 using standard source-over compositing. Layering builds tonal density.
- eraser: Destination-out compositing (destination-out) that clears marks strictly on the target layer without touching other layers.

### Geometric Shapes (rect & ellipse)
- rect: Axis-aligned filled rectangle specified by x, y, width, height, color, and opacity.
- ellipse: Filled ellipse bounded within x, y, width, height, color, and opacity.

### Canvas Background (fill)
- fill: Fills the document background with a hex color (#rrggbb).

### Layers (layer)
- layer list: Lists all registered layers, their visibility, and opacity.
- layer add <id> <name>: Registers a new layer above existing layers. Layer IDs must start with a letter and contain up to 40 alphanumeric characters, hyphens, or underscores.
- layer update <id>: Adjusts layer --name, --opacity (0.0 to 1.0), or --visible true|false.

---

## 3. CLI Command Reference (paint)

Install the native Go executable with `make install`, then begin with `paint guide`. It includes this guide and its preview renderer and works from any directory. `paint doctor` checks studio and browser availability; `paint completion bash|zsh|fish` prints shell completion definitions. PNG capture supports macOS and Linux with an installed Chrome or Chromium browser.

### Observation Commands

#### status [--json]
Prints a compact summary of the session: instance ID, revision numbers (`revision`, `artRevision`), playback status (status, speed, remaining queue, active stroke progress), history mark count (cursor and total), layer count, and current comments summary.
- Plain `status` prints this human-readable summary.
- Rich generation, epoch, and grant state (`docGeneration`, `controlEpoch`, `requiresGrant`, `activeGrant`) require `status --json` (which emits the full raw state snapshot) or `comments list`. Plain status reads do not update the poller heartbeat.

#### view [FILE] [--crop x,y,w,h] [--scale N] [--browser PATH] [--json]
Captures an immutable PNG snapshot of the live canvas, including any in-progress partial stroke.
- If FILE is omitted, saves to a temporary file in the OS temp directory.
- Reports output path, MIME type (`image/png`), dimensions, revision, instance ID, and playback state.
- Optional `--crop x,y,w,h` extracts a sub-region in canvas coordinates.
- Optional `--scale N` (e.g. 2) scales the output for inspecting fine detail.
- To inspect human critique or region comments, inspect ONLY the current visible composite: for region comments, use `paint view --crop x,y,w,h`; for whole-canvas comments (`rect: null`), use `paint view` without `--crop`. Open the returned path with your image reader.

#### export FILE [--crop x,y,w,h] [--scale N] [--browser PATH] [--json]
Exports a clean PNG containing only committed artwork marks (`committed: true`). FILE is required.

#### wait [--timeout SECONDS] [--json]
Polls the studio and returns success promptly as soon as playback settles into idle or paused.
- Default timeout is 30 seconds (valid range: 0.001 to 3600 seconds).
- Bounded network calls ensure a hung connection never exceeds the remaining deadline.
- Prints state summary and comments.
- If the timeout expires while commands are still playing, exits nonzero with error `WAIT_TIMEOUT`.
- Note: `paint wait` observes playback settling, not comment listening or heartbeat.

#### watch [--timeout SECONDS] [--interval MILLISECONDS] [--json]
Streams playback settling and session changes. Emits an initial summary and subsequent updates whenever revision, playback, or session state changes.
- Default timeout: 30 seconds; default interval: 400 milliseconds.
- With `--json`, emits compact events containing instance, revision, playback, history, and comments metadata.
- Exits with status 0 upon normal timeout completion. Never auto-resumes playback. Does not mark comment listening.

#### comments [list|wait|watch|ack|address]
List human comments or follow them live without ever resuming playback.
- `comments` or `comments list [--json]`:
  List (default subcommand) prints anchored comments with cursor, generation, and epoch. Text output summarizes region bounds, status, and visible layer context. `--json` emits the raw envelope (`{"cursor":"...","reset":false,"docGeneration":"...","controlEpoch":N,"requiresGrant":bool,"activeGrant":{...},"comments":[...]}`). Plain reads do not update the poller heartbeat.
- `comments wait [--since CURSOR] [--timeout SECONDS] [--json]`:
  Blocks for the next comments change, reset, or control change.
  - Timeout: 0.001..30 seconds (default 30 seconds); polls loopback at 400ms intervals.
  - With no `--since`: an existing non-empty comment list returns immediately on the first poll; an empty initial response establishes the baseline and waits for the next change.
  - In a listening loop, always retain the latest opaque `envelope.cursor` and pass `--since '<cursor>' --json --timeout 30`; without `--since`, existing comments return immediately on every call.
  - When a supplied `--since` cursor encounters a server reset (e.g. generation rotation or instance mismatch), returns immediately even when the comments delta is empty so the caller receives the reset envelope. On reset, adopt the new context and discard stale grants.
  - On deadline: exits 1 with `COMMENTS_TIMEOUT` and never resumes playback. On timeout, run `comments list --json` (or `status --json` plus list) to inspect current grant and epoch, process any pending open or acknowledged work, retain the latest returned cursor, and re-enter bounded wait.
  - Explicit comments polling (`POST /api/comments/poll`) marks the agent as "Listening" in the studio (ephemeral heartbeat with 5-second TTL).
- `comments watch [--since CURSOR] [--timeout SECONDS] [--json]`:
  Streams the initial envelope then subsequent events (`change`, `reset`, `control`) as compact NDJSON `{"event": ..., "envelope": ...}` (or formatted text) until timeout. Normal deadline exits 0; SIGINT/cancellation exits 130. Marks "Listening" with each 400ms poll.
- `comments ack ID --generation STRING --seq N [--json]`:
  Confirms an open comment. Both `--generation` (matching current `docGeneration`) and `--seq` (positive sequence integer) are required. Stale 409 conflicts surface as errors without auto-refresh. Never resumes playback. The JSON response returns a state snapshot without a poll cursor; run `comments list --json` after ack to obtain the newest opaque cursor and sequence.
- `comments address ID --generation STRING --seq N [--json]`:
  Marks an acknowledged comment as addressed after corrections are made. Both `--generation` and `--seq` are required. Stale 409 conflicts surface as errors without auto-refresh. Never resumes playback. The JSON response returns a state snapshot without a poll cursor; run `comments list --json` after address to obtain the newest opaque cursor and sequence.

---

### Drawing Commands

All drawing commands accept `--paused`, `--replace`, `--json`, and explicit mutation context flags `--generation STRING --epoch N [--grant TOKEN]`:
- `--paused`: Queues the command without unpausing playback. Staged with current `--generation` and `--epoch` without requiring an active grant token.
- `--replace`: Discards unexecuted pending commands in the queue before adding the new command.
- `--generation STRING --epoch N`: Explicit document generation and control epoch. Must be supplied together. Forwarded strictly as observed; never refreshed automatically. Required for every guarded agent mutation, even on fresh sessions.
- `--grant TOKEN`: Continuation grant token. Requires both `--generation` and `--epoch`. Required for execution mutations when `requiresGrant` is true.
- `--json`: Outputs the complete raw API response snapshot.

In the examples below, `$GEN` and `$EPOCH` expand from current session values (`docGeneration` and `controlEpoch`), obtained via `paint comments list --json` (or `paint status --json`). Every guarded agent mutation, including `finish`, requires explicit `--generation STRING --epoch N`.

Mutation acknowledgements report the resulting playback state and remaining queued marks:
"Queued stroke (3 points on \"paint\") - playback: playing, 1 remaining (revision 4)"

#### stroke
paint stroke --points "120,240 180,260 220,300" --brush pencil --color "#253d38" --size 4 --opacity 1 --layer paint --generation "$GEN" --epoch "$EPOCH"

#### rect
paint rect --x 0 --y 450 --width 1000 --height 250 --color "#1b4d3e" --opacity 1 --layer background --generation "$GEN" --epoch "$EPOCH"

#### ellipse
paint ellipse --x 700 --y 80 --width 120 --height 120 --color "#f59e0b" --opacity 0.9 --layer sky --generation "$GEN" --epoch "$EPOCH"

#### fill
paint fill "#f4efe6" --generation "$GEN" --epoch "$EPOCH"

#### layer
# Note: 'layer list' is read-only and takes no context flags. Mutations ('add' and 'update') require generation and epoch:
paint layer list
paint layer add background "Backdrop Layer" --generation "$GEN" --epoch "$EPOCH"
paint layer update background --opacity 0.85 --visible true --generation "$GEN" --epoch "$EPOCH"

#### submit
Submits a batch from a JSON file or standard input (`-`). Accepts a JSON array `[...]` or an object `{"commands":[...]}`. Input size is bounded (max 8 MiB) and timed out.
Example batch submitted via stdin:
cat << "BATCH" | paint submit - --generation "$GEN" --epoch "$EPOCH"
[
  {"type":"fill","color":"#eef2f6"},
  {"type":"layer.add","id":"backdrop","name":"Backdrop"},
  {"type":"rect","layer":"backdrop","x":0,"y":300,"width":1000,"height":400,"color":"#15803d"},
  {"type":"stroke","layer":"paint","brush":"brush","size":12,"color":"#0284c7","points":[[100,200],[300,250],[600,220]]}
]
BATCH

---

### Session & Playback Commands

Among session and playback commands, only `resume`, `step`, `finish`, `clear`, `undo`, `redo`, `new`, and `load` accept explicit mutation context flags (`--generation STRING --epoch N [--grant TOKEN]`). Read-only commands, `pause`, and `speed` do not accept context flags.
- `pause`: Pauses playback of queued commands. Revokes active continuation grant.
- `resume`: Resumes pending playback. With `--generation G --epoch E --grant T`, executes with the active grant. Resume a human pause only when continuation is authorized.
- `step`: Advances and commits exactly one command from the queue, remaining paused. Requires active grant token if under human intervention.
- `finish`: Executes the active partial stroke and every queued command atomically. Requires matching generation and epoch, plus an active grant token when execution is grant-gated.
- `clear`: Clears all pending unexecuted commands from the queue and pauses. Invalidates the active continuation grant upon success (re-observe state).
- `undo`: Undoes the last committed mark in history, moving the cursor back. Invalidates the active continuation grant upon success (re-observe state).
- `redo`: Redoes the previously undone mark. Invalidates the active continuation grant upon success (re-observe state).
- `new`: Clears the session to an empty document and resets history, queue, and comments; rotates docGeneration, resets epoch to 0, requiresGrant: false. Execution fenced for agents; user UI trusted human.
- `speed NUMBER`: Sets playback speed (between 0.25 and 8.0, e.g. `paint speed 2`).
- `save FILE`: Saves the full project JSON v2 atomically, including history, cursor, queue, and rich comments. Control grants and epochs are not persisted.
- `load FILE|-`: Restores plain v2 project JSON from a regular file or stdin, with pending playback paused. Rotates docGeneration, resets epoch to 0, requiresGrant: true, activeGrant: null. Agent loads wrap the project in HTTP POST `/api/project` with `{"project": <v2_project>, "source": "agent", "expectedDocGeneration": G, "epoch": E, "grantToken"?: T}`. Raw saved files are plain v2 (`{"format":"codesketch","version":2,"commands":[...],"cursor":N,"queue":[...],"comments":[...]}`). Obsolete formats are rejected; backwards compatibility and migration are permanently forbidden.

---

### Guidance Commands (Offline)

These commands execute offline without a running server:
- `help [COMMAND]` (or `<command> --help`): Prints command summary or detailed help for a specific command.
- `guide`: Prints the practical painting guide to stdout.
- `guide --artist-skill` (or `paint --artist-skill`): Prints the complete offline artist skill and both references.

---

## 4. The Collaborative Agent Painting Workflow

External agents should structure their painting sessions into iterative cycles:

### Step 1: Initialize and inspect session
Run `paint status` and `paint comments list --json` to inspect instance identity, document generation (`$GEN`), control epoch (`$EPOCH`), active grant state, and any pending comments. Retain the initial `envelope.cursor` (`$CUR`).

### Step 2: Establish layers and background
Every guarded agent mutation requires explicit context flags matching the session context:
paint fill "#e8eff5" --generation "$GEN" --epoch "$EPOCH"
paint layer add sky "Sky & Mountains" --generation "$GEN" --epoch "$EPOCH"
paint layer add foliage "Midground Foliage" --generation "$GEN" --epoch "$EPOCH"

### Step 3: Queue a batch of marks
Submit small, focused batches (5-20 marks) so the human observer can watch progress. Every guarded agent mutation requires explicit `--generation G --epoch E` matching the current session, plus `--grant T` when granted execution is required:
paint rect --x 0 --y 400 --width 1000 --height 300 --color "#355e3b" --layer foliage --generation "$GEN" --epoch "$EPOCH"
paint stroke --points "200,400 250,320 300,400" --brush pencil --color "#1e3a1e" --size 5 --layer foliage --generation "$GEN" --epoch "$EPOCH"

### Step 4: Wait for playback
paint wait --timeout 30

### Step 5: Visually inspect progress
Capture a snapshot of the artwork to observe the result:
paint view /tmp/progress.png
Open `/tmp/progress.png` with your image reader to evaluate color harmony, contrast, and layout.
To inspect fine details (e.g. a face or focal point at x=220, y=340):
paint view /tmp/focal_detail.png --crop 200,320,80,80 --scale 2

### Step 6: Review comments and handle human pause (The Artist Loop)
Check `paint status` and `paint comments list --json` before each short batch to baseline control fields and obtain the initial `envelope.cursor`. Process any existing pending comments from this initial list before awaiting new ones.
During an intentional review pause:
1. **Listen actively with opaque cursor**: Retain the latest opaque cursor from the comments envelope (`envelope.cursor`). Repeatedly execute bounded `paint comments wait --since '<cursor>' --json --timeout 30`:
   - Without `--since '<cursor>'`, existing comments return immediately on every call.
   - On timeout (`COMMENTS_TIMEOUT`): run `paint comments list --json` (or `status --json` plus list) to inspect current grant and epoch, process any pending open or acknowledged work, retain the latest returned cursor, and re-enter wait when still awaiting comments. This catches human Resume actions occurring between bounded invocations.
   - On reset (`envelope.reset == true`): adopt the new context (`docGeneration`, `controlEpoch`, new `cursor`), discard stale grants, and continue waiting.
   - External runtime must keep the agent turn running; Codesketch does not automatically wake or launch agents after exit.
   - Only explicit comments polling (`POST /api/comments/poll`) marks the agent as "Listening" in the studio (expires after 5 seconds). Reads and status do not refresh the heartbeat.
2. **Inspect region bounds**: When critique arrives, inspect comment bounds (`rect: {x,y,width,height}` on 1000×700 or `null` for whole canvas) and `visibleLayers` (stacking order with opacity > 0).
3. **Inspect visible composite**: Inspect only the current visible composite:
   - For region comments: `paint view --crop x,y,w,h`.
   - For whole-canvas comments (`rect: null`): `paint view` without `--crop`.
   - Open the image with your image reader.
4. **Acknowledge comment**:
   `paint comments ack <id> --generation <docGeneration> --seq <seq>`
   Lifecycle commands return a state snapshot without a top-level poll cursor. After each `ack`, run `paint comments list --json` to obtain the newest opaque cursor and sequence.
5. **Formulate corrections and handle staging vs execution**:
   - *If an active grant is available* (issued via Apply & continue or human Resume): execute the correction batch with the active grant token:
     `paint submit revisions.json --generation <docGeneration> --epoch <epoch> --grant <grantToken>`
     Wait for playback to settle (`paint wait --timeout 30`).
     To execute the active partial stroke and all queued work as one finish operation, use `paint finish --generation <docGeneration> --epoch <epoch> --grant <grantToken>`.
   - *If no grant is active* (e.g. human Send): stage the correction batch while paused without a grant token:
     `paint submit revisions.json --paused --replace --generation <docGeneration> --epoch <epoch>`
     Staged commands have not yet rendered to the canvas. Stay in the listening state (`paint comments wait --since '<cursor>' --json --timeout 30`) until human direction authorizes execution (e.g. human clicks Resume in the studio, which increments `controlEpoch` and issues an active grant). Once execution occurs and playback finishes (`paint wait`), proceed to verification.
6. **Verify revision**: Once marks have rendered to the canvas, capture the updated crop (`paint view --crop x,y,w,h` for regions, or `paint view` without crop for whole canvas) and confirm the correction visually with your image reader.
7. **Address comment**: Mark the critique as addressed using the latest sequence number:
   `paint comments address <id> --generation <docGeneration> --seq <latestSeq>`
   After each `address`, run `paint comments list --json` to obtain the newest opaque cursor and sequence.
8. **Wait for human review**: Return to calling bounded `paint comments wait --since '<cursor>' --json --timeout 30` to await the director's review (resolve, reopen, or further comments). Never assume playback auto-resumes or that an agent is launched automatically.

### Step 7: Export final piece
When the artwork is complete:
paint export artwork.png
paint save artwork.json

---

## 5. Scripting & Error Handling

- **Success**: Commands exit with status code 0.
- **Runtime failure**: Errors are written to STDERR with exit code 1 (`COMMENTS_TIMEOUT`, `WAIT_TIMEOUT`, `API_ERROR`).
- **Invalid invocation**: Exit code 2 (`USAGE`).
- **Interruption**: Exit code 130 (SIGINT or context cancellation).
- **Structured JSON Errors**: When `--json` is included in the command arguments, errors on STDERR are structured JSON objects:
  `{"error": "COMMENTS_TIMEOUT", "message": "comments wait timed out after 30s before any change (COMMENTS_TIMEOUT)"}`
- **Loopback Safety**: The CLI only connects to loopback addresses (`127.0.0.1`, `localhost`, `::1`). Requests to non-loopback addresses are rejected immediately before any network transmission.
- **Production Protection**: Port 4317 is sole production, running the newest released code. Protect production availability and actual artwork: an outage is sev0; only lead-managed authorized release can restart or replace production processes. Replace production runtime data only during an authorized managed release with a verified backup, and never use `.studio/session.json` for tests. All feature development, automated tests, and browser tests must use separate loopback ports (ephemeral preferred) and separate temporary persistence. Keep served production files under release control; use an isolated checkout for future development. Use no persistent staging runtime.
