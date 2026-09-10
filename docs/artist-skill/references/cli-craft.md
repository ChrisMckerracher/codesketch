# Native paint craft and recovery

Use the current `paint guide` as the authority for syntax, rendering behavior, and limits. This reference records practical decisions that mattered during the collaborative workflow.

## Marks and inspection

- Use native drawing, status, comments, and project commands. Capture the studio with `paint view`; open the returned file with the image reader. `paint export` is the delivery capture.
- To inspect human critique and region comments, inspect ONLY the current visible composite: for region comments, use `paint view --crop x,y,w,h`; for whole-canvas comments (`rect: null`), use `paint view` without `--crop`. Open the returned path with your image reader.
- Region comments supply `{x, y, width, height}` in 1000×700 canvas coordinates or `null` for whole canvas.
- Comment `visibleLayers` records all visible layers with `opacity > 0` in document stacking order, completely independent of the active drawing layer.
- Keep construction, contours, color shapes, and environment on intentional layers. Reduce construction visibility after checking it, so guide lines do not obscure anatomy during review.
- Stage focused batches and inspect meaningful milestones. Stay responsive to the user's drawing corrections.
- Calculate command and point budgets before submitting a large revision. Leave room for corrections. Do not change the application's limits as part of a painting request.
- Pencil size and opacity are renderer-specific. Consult the guide rather than assuming that an opacity of one produces an opaque painted area.
- When using path helpers, preserve pen lifts between independent subpaths. A connector across a gap can become an unintended line through a face or hand.
- When filling a hand-designed concave shape with strokes, preserve gaps and disconnected spans. One continuous scan path can accidentally bridge them. Inspect overlaps around hair, glasses, hands, and clothing.
- Repeated overlap within a single stroke may not build opacity as separate marks would. Check the rendered result before relying on a fill to cover underlying lines.

## Pauses and user direction

Read current playback state and comments before changing playback. Preserve a human pause unless continuation is authorized. Authorization is part of the conversation: when the user explicitly says to ignore their pauses and finish drawing, carry that instruction forward rather than repeatedly asking to resume. A later instruction to stop or pause takes precedence.

Distinguish artistic critique from playback control. A pause is not sketch approval. A wait timeout is not a drawing failure or a user instruction; inspect state and continue waiting or working as appropriate.

### Studio comments actions and grants

- **Region selection handshake**: Selecting a region in the studio pauses playback and awaits server pause acknowledgement before drag activates. Keyboard shortcut `C` enters comment mode, `Enter` selects whole canvas, and `Esc` cancels draft selection while preserving pause.
- **Composer actions**: `Cmd+Enter` (or `Ctrl+Enter`) triggers **Send**; `Shift+Cmd+Enter` (or `Shift+Ctrl+Enter`) triggers **Apply & continue**.
- **Send**: Records the critique, preserves the pending queue, holds playback paused, increments `controlEpoch`, and revokes any active continuation grant (`requiresGrant: true`, `activeGrant: null`).
- **Apply & continue**: Records the critique, clears active partial strokes and the pending queue, increments `controlEpoch`, issues an active continuation grant (`activeGrant: { docGeneration, controlEpoch, grantToken }`), and holds playback paused until the agent submits a corrected batch.
- **Human Resume**: Clicking Resume in the studio issues an active continuation grant for the incremented control epoch and authorizes playback. Later human pause, comment, or manual edit revokes this grant.
- **Session reset (`new`) vs Project import (`load`)**:
  - `new` resets the session fresh: rotates `docGeneration` to a new UUID, resets `controlEpoch` to 0, sets status to `idle`, and sets `requiresGrant: false`, `activeGrant: null`.
  - `load` restores a project: rotates `docGeneration` to a new UUID, resets `controlEpoch` to 0, sets status to `paused`, and sets `requiresGrant: true`, `activeGrant: null` (paused without grant).
- **Staging vs execution**: Every guarded agent mutation requires explicit `--generation STRING --epoch N` (paired together) matching current context, even on a fresh session. Submitting with `--paused` (or `play: false`) stages commands safely into the queue without committing canvas marks and without requiring an active grant token. Execution commands (`resume`, `step`, unpaused marks/submit) require matching generation and epoch, plus an active continuation grant token (`--grant TOKEN`) whenever `requiresGrant` is true. Fresh sessions start with `requiresGrant: false, activeGrant: null`; execution mutations proceed with matching context and no grant token until human intervention occurs. Context flags are forwarded strictly as observed and are never refreshed automatically.
- **Grant invalidation on undo/redo/clear**: Successful execution of `undo`, `redo`, or `clear` invalidates active continuation grants, incrementing `controlEpoch`. Always re-observe state/comments before subsequent executions; never invent or renew grant tokens.
- **Fenced commands**: `new`, `load`, and `demo` execution are fenced for agents; user UI actions are trusted human (`source: 'human'`).

### The artist listening loop

- Run `paint status` and `paint comments list --json` before each short batch to inspect session state, baseline control fields, and obtain the initial opaque cursor (`envelope.cursor`). Process any existing pending comments from this initial list before awaiting new ones.
- During an intentional review pause: repeatedly execute bounded `paint comments wait --since '<cursor>' --json --timeout 30`.
- **Opaque cursor retention**: Retain the latest opaque cursor from the comments envelope. Without `--since '<cursor>'`, existing comments return immediately on every call, creating a busy spin.
- **Timeout and reset**:
  - On timeout (`COMMENTS_TIMEOUT`): run `paint comments list --json` (or `status --json` plus list) to inspect current grant and epoch, process any pending open or acknowledged work, retain the latest returned cursor, and re-enter wait when still awaiting comments. This catches human Resume actions occurring between bounded invocations.
  - On reset (`envelope.reset == true`), adopt the new context (`docGeneration`, `controlEpoch`, new `cursor`), discard stale grants, and continue waiting.
- **Runtime presence**: The external runtime must keep the agent turn running; Codesketch does not automatically wake or launch agents after exit.
- **Listening heartbeat**: Only explicit comments polling (`POST /api/comments/poll`) marks the studio status as "Listening" (expires after 5 seconds). Plain reads/status do not refresh the heartbeat.
- **Crop inspection**:
  - For region comments, inspect via `paint view --crop x,y,w,h`.
  - For whole-canvas comments (`rect: null`), inspect via `paint view` without `--crop`.
- **Acknowledge and address**:
  - Acknowledge incoming comments: `paint comments ack <id> --generation <docGeneration> --seq <seq>`. Both flags are required. The JSON response returns a state snapshot without a poll cursor; run `paint comments list --json` after each `ack` to obtain the newest opaque cursor and sequence.
  - After correcting and visually verifying the canvas, mark critique addressed: `paint comments address <id> --generation <docGeneration> --seq <latestSeq>`. Both flags are required. Stale 409 conflicts surface as errors without auto-refresh. Run `paint comments list --json` after each `address` to obtain the newest opaque cursor and sequence.
- **Staging rule**: Staged corrections (`submit --paused`) have not rendered to the canvas. Do not fall through to visual verification or mark addressed while staged. Explicitly stay in the listening state (`paint comments wait --since '<cursor>' ...`) until human direction authorizes execution (e.g. human clicks Resume, issuing an active grant). After execution completes (`paint wait`), capture the view, visually verify the fix, and mark addressed.
- **Playback settling vs comment observation**: Playback `wait` and `watch` observe playback settling and session changes, not comment listening. `comments list|wait|watch|ack|address` observe and process human direction and control changes.
- **Production protection**: Port 4317 is sole production running newest released code; outage sev0. Only lead-managed authorized release can restart or replace production processes. For feature development, staging, or automated tests, use isolated ephemeral loopback ports and temporary persistence, never `.studio/session.json`. Keep served production files under release control; use an isolated checkout for future development. Use no persistent staging runtime.

## Save and recover

Keep the drawing's source marks and editable project files outside temporary memory. Save the approved sketch and substantial revisions under the project's artifact directory. Temporary scripts alone are insufficient for a session handoff.

If the user clears the canvas accidentally:

1. Inspect `paint status` and save the surviving project.
2. Determine whether the committed artwork, pending queue, or whole document was cleared.
3. Compare the surviving commands with saved work structurally. JSON key order may differ after normalization, and the user may have inserted their own marks.
4. Restore the missing queue or load the appropriate saved stage. Preserve surviving user work. Do not blindly replay already committed marks.
5. Inspect the restored canvas and save another checkpoint.

Use the user's request to recover as authorization for the necessary restoration. Report what survived and what was restored without making the user reconstruct the lost commands.

## Handoff

Record the active stage, selected reference paths or URLs, current critique, saved project path, and next drawing step. Keep any uncompleted final painting task open. Capture reusable workflow guidance separately from the artwork and avoid turning an unsuccessful drawing into a template for future anatomy.
