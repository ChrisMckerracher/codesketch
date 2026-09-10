# UI reconstruction contracts

Current UI reconstruction contract for `ui-reset`. Evidence comes from the
committed domain, transport, renderer, state, comment-handshake, and studio UI
modules plus repository contract guidance. The accepted hierarchy and bindings
are recorded below; paths are relative to `apps/studio/src/`.

## Current implementation bindings

1. **High — human mutations use document-generation guards.** Human commands,
   controls, project loads, and demos carry the exact captured generation;
   local mutation ordering and gesture cancellation protect replacement
   documents. Same-generation cross-tab ordering remains a documented protocol
   limit.
2. **Medium — zero brush opacity remains zero.** `StudioState.setOpacity`
   accepts finite numeric values, clamps to 0–1, and preserves zero for the
   renderer and layer controls.
3. **Medium — HTTP responses are bounded and sequenced.** Response validation
   covers complete bodies, malformed payloads remain errors, and request
   ordering prevents obsolete connectivity effects.
4. **Integration contract — pause confirmation owns its predicate.** The
   handshake requires the captured instance and generation, paused playback,
   and matching control epoch; cancellation and rotation expire callbacks.
5. **Integration contract — committed PNG uses an isolated render.** The
   document-only exporter renders the committed artwork on a separate canvas;
   active previews, drafts, and review decoration stay out of exported pixels.

## Integration map

| Boundary | Current contract | Reconstruction responsibility |
| --- | --- | --- |
| Painting | `painting/index.mjs` exposes document operations and rendering; `document/index.mjs` owns immutable reduction/replay. | Consume public entrypoints. Keep browser interaction outside domain code. |
| Session | `direction/session.mjs`, `snapshot()` returns `instanceId`, `revision`, `artRevision`, `document`, grant fields, `playback`, `history`, `comments`, and error fields. | Use accepted server snapshots as artwork/playback truth. Keep pending local gestures distinct. |
| HTTP | `transport/server.mjs`; same-origin JSON POSTs; `/api/state` supports `since` plus `instanceId`. Equal revision/instance returns `{unchanged:true, heartbeat}`. | Poll without overlapping requests; process heartbeat on unchanged responses without replacing the artwork snapshot. |
| Browser client | `studio/api.mjs`, `StudioApi`: `fetchState`, `sendCommands`, `sendControl`, `createComment`, `resolveComment`, `fetchProject`, `loadProject`, `loadDemo`. | Route mutation replies and poll replies through one acceptance path. Catch errors and retain recoverable user input. |
| Browser state | `StudioState`: tool/size/opacity/color/background/target-layer/draft setters and events; `setSnapshot` accepts equal or increasing revision within an instance and rejects retired instances. | Validate current envelopes, handle resets, and preserve in-progress editing across snapshots. State does not provide polling or mutation serialization. |
| Rendering | `createRenderer(canvas)(document, active, draft)`; `StudioRenderer.render` delegates. `active` is `snapshot.playback.active`, containing `{command,progress}`. | Render document-space artwork at its intrinsic dimensions; map pointer coordinates from the displayed canvas bounds. |
| Feedback geometry | `canvasPoint(clientX,clientY,rect,width,height)` clamps/rounds; `selectionRect(a,b)` normalizes corners and returns null for zero area. | Supply actual canvas bounds. Distinguish explicit whole-canvas feedback from an invalid region drag. |
| Feedback handshake | `PauseHandshake({sendPause,acceptSnapshot}).begin({activate,onStale})`; `expire()` invalidates callbacks. | Own selection/composer lifetime, capture context after acknowledged pause, and handle stale/error callbacks. |

## Painting and layers: acceptance obligations

- The document is 1000 × 700, version 1, with background, ordered layers, and committed marks. Initial layer ID is `paint`. Commands are `stroke`, `rect`, `ellipse`, `fill`, `layer.add`, and `layer.update` (`painting/document/validation.mjs`).
- Brush selection produces a stroke `brush` value of `brush`, `pencil`, `marker`, or `eraser`. Freeze brush, size, opacity, color, target layer, and document identity for each gesture. Size is 1–100; opacity is 0–1; color is six-digit hex; points are bounded canvas-space pairs. A one-point stroke paints a dot.
- Pause through the human control endpoint when pointer painting begins. Capture pointer movement and release/cancel reliably, including movement outside the displayed canvas. Local preview and the accepted committed stroke must agree. Commit the completed stroke once through `sendCommands([stroke], {immediate:true})`; failure preserves a recoverable draft without falsely reporting a saved mark.
- Immediate submission commits before existing pending commands, resets active progress, retains the former active command in pending work, pauses, and revokes agent authorization (`Session.submit`). Validate the entire proposed sequence atomically. A layer change can invalidate queued commands and must report rejection without partial UI success.
- Bound or simplify long pointer paths to 2000 points per stroke. Session budgets are 3000 commands, 150000 total points, and 24 layers. Splitting a gesture changes its undo granularity and requires an explicit behavior contract.
- `layer.add` takes a unique identifier and nonempty name; `layer.update` supports name, visibility, and opacity. Added layers appear last in document order and composite above earlier layers. Current commands provide no layer removal/reordering operation.
- Erasing operates within the target layer; lower layers and document background remain visible through erased pixels. Visibility and opacity apply to the whole layer, including active and draft marks. Test composited pixels, including zero opacity, hidden layers, and erasing above another layer.
- `StudioState.setSnapshot` selects a newly added last layer when no draft exists and repairs a missing target. Freeze a draft's target independently; cancel it when its document or layer disappears. The retained `bgColor` field is local selection state and is not synchronized from `document.background` automatically.

## History, projects, and PNG: acceptance obligations

- `sendControl('undo'|'redo')` clears pending work and active preview, pauses, and moves history cursor. A new commit discards the redo tail (`direction/history.mjs`). Availability derives from `history.cursor` and `history.total`, with pending-work effects accounted for.
- `sendControl('new')` creates a fresh document generation and clears history, queue, active work, and comments. Cancel old gestures, selection context, pending comment activation, and obsolete UI callbacks.
- `fetchProject()` returns `{format:'codesketch',version:2,commands,cursor,queue,comments}`. Save this server result as editable project JSON. The queue includes the full active command, so reopening restarts that pending command; project export does not preserve fractional progress.
- `loadProject(project)` sends the required `{project,source:'human'}` envelope. Valid load rotates generation, clears request deduplication metadata, restores editable history/comments, and pauses with no grant. Invalid imports preserve the existing session. Accept only current v2 projects; limits are 8 MiB input and 7 MiB normalized project. Recovery v1 is a separate internal persistence contract.
- `loadDemo()` resets the document and stages an example queue paused. Treat its response as a generation change.
- PNG must be a valid downloadable image at the document's intrinsic dimensions, with background and correct compositing. Capture one coherent snapshot; declare whether active playback is included. Committed-only pixels require document-only rendering. Local selection and comment decorations are never painting data.

## Playback and human authority: acceptance obligations

- Playback status is `idle`, `playing`, or `paused`. `remaining` counts the active command plus queued commands. Render fractional progress from server snapshots; the server ticks every 40 ms and speed is 0.25–8 (`transport/server.mjs`, `Session.tick`).
- Strokes reveal by path distance. Rectangles and ellipses render their full shape during their active interval; background/layer operations become visible on commit (`painting/rendering/index.mjs`). Preserve these current rendering semantics in reconstruction checks.
- Human pause revokes authorization by advancing `controlEpoch`. Human resume issues a new `activeGrant` and plays pending work, or becomes idle when empty. Speed changes alone do not authorize execution. Clear removes pending work and partial preview while retaining committed work.
- Step commits exactly one active/queued command and stays paused. Finish commits the complete active command and queue atomically in order, clears pending work, and stays paused; each command remains individually undoable. Empty finish is an exact no-op (`direction/finish.mjs`).
- Guarded agent mutations carry `expectedDocGeneration` and `epoch`; execution after human intervention also requires the matching `grantToken`. Staging with `play:false` can occur under current context without an execution grant. Human pause, immediate painting, history intervention, clear, and reopening feedback revoke grants. Agent pause is also a sticky stop. The UI must never synthesize resume on reconnect or composer dismissal.

## Comments, grants, and reselection: acceptance obligations

- Begin a comment interaction by requesting human pause. Activate selection/composition only after its own acknowledgement is accepted as the current paused snapshot in the same document. Token expiration must cover cancellation, replacement interaction, generation rotation, and unmount. A late response must not revive an abandoned interaction.
- Submit `{requestId,text,rect,continuePlayback,expectedDocGeneration,expectedArtRevision}`. Use a unique stable request ID per logical submission, 1–80 characters; text is trimmed, nonempty, at most 2000 characters. `rect:null` means whole canvas; regions use positive integer dimensions fully inside the canvas. At most 100 comments are stored.
- Freeze generation and artwork revision with the reviewed selection. Artwork changes, including partial playback, visibility, and layer opacity, invalidate that context. A 409 requires refreshed context and explicit reselection/review while preserving text; silently replacing the expected revision would attach feedback to unreviewed artwork.
- Reuse the same request ID and identical payload after an uncertain network outcome. Exact duplicates are side-effect free, including after playback resumes. A changed payload needs a new request ID. Resolving a network error is not evidence that the earlier submission failed to commit.
- `continuePlayback:false` retains pending work, pauses, and invalidates authorization. `true` clears queue and partial active preview, issues an agent grant, and remains paused awaiting agent work (`direction/session-comments.mjs`). Successful submission must make this outcome clear. Cancelling or reselecting must preserve the authoritative pause.
- Stored feedback records number, ID, sequence, text, region, history cursor, art revision, timestamps, and visible-layer opacity context. Show names/text as text content. These records locate feedback; they do not restore historical canvas pixels.
- Lifecycle is open → acknowledged → addressed → resolved, via `/api/comments/ack`, `/address`, and `/resolve`. Human resolve is valid from addressed; `{reopen:true}` returns to open, clears lifecycle timestamps, pauses, and revokes grants. Transitions require current generation and exact `expectedSeq`; stale responses cannot overwrite newer feedback state.
- Agent POST `/api/comments/poll` accepts an opaque `since` cursor and updates `heartbeat.lastSeenAt`. GET comments does not mark agent attendance. A reset poll replaces the comment projection; a delta merges by ID/sequence. Heartbeat indicates the last poll, not guaranteed future execution, and resets on document replacement.

## Synchronization and verification handoff

- Keep polling revision/instance together. Accept a new server instance with its lower revision; reject delayed retired-instance snapshots. A generation change can occur inside the same instance. Treat `{unchanged:true}` separately. Malformed/missing-identity envelopes must not enter current state.
- Preserve active pointer holds and locally edited values across incoming snapshots. Use `artRevision` plus instance/document identity to decide artwork work; `StudioState` also emits `artChange` for changed document object identity, which normal JSON decoding creates even on control-only responses.
- Connection success does not establish mutation success. Show offline, playback errors, and storage errors accurately; retain last accepted artwork and drafts. Reconnect refreshes current state before further dependent mutation. Order local reset/load/paint/control requests and suppress obsolete completion effects. Cross-tab human write ordering remains a documented protocol limit.
- Verification evidence belongs to the release record. This document records
  the source-grounded contracts and does not claim a release result.
- The accepted implementation covers actual pointer painting and pixels;
  keyboard parameter changes; layer compositing; history and project
  roundtrip; active playback/step/finish; pause acknowledgement races;
  comment retries/grants/reselection; reset during a held gesture;
  out-of-order polling and mutation replies; offline/reconnect; and valid PNG
  download.
- Keep browser/Node standard APIs and public context entrypoints, zero added
  dependencies, current-only contracts, and source files at or below 300
  lines. Bounded implementation ownership remains recorded below.

## Implemented bounded implementation contracts

These technical contracts remain independent of creative design and record the
accepted H1–H6 implementation bindings. Each assignment targets about 500
changed lines or fewer, has a hard 1000-line change ceiling, and keeps every
source file at or below 300 lines. Existing files shared by assignments retain
their sequential ownership. The manager owns integration and verification.

### H1 — preserve zero opacity (approximately 50–100 lines)

**Ownership:** `apps/studio/src/studio/state.mjs`; `apps/studio/tests/studio-state.test.mjs`.

**Public contract:** `StudioState.setOpacity(value)` continues accepting finite numbers and nonempty numeric strings, clamps to 0–1, and emits `opacity` only when the normalized value changes. Zero remains zero. Empty strings, null, undefined, nonnumeric strings, and nonfinite values normalize to the existing default 1. This changes no HTTP, document, renderer, or Go contract.

**Acceptance:** exercise numeric/string zero, fractional opacity, clamping at both ends, invalid input, and event count. Assert actual state value and emitted payload. The pointer workflow proves a zero-opacity stroke contributes no pixels; this assignment adds no browser presentation code.

### H2 — bound and validate complete HTTP responses (approximately 350–500 lines)

**Ownership:** `apps/studio/src/studio/api.mjs`; new `apps/studio/src/studio/response.mjs` for focused browser response checks; new `apps/studio/tests/studio-api-response.test.mjs` and `studio-api-deadline.test.mjs`.

**Public contract:** all existing `StudioApi` endpoint methods resolve only with their current endpoint's validated response shape. `request` keeps its deadline active through body consumption and JSON decoding, cleans it up in `finally`, and rejects malformed JSON even on HTTP 200. A caller signal must compose with the deadline instead of overriding it. Use browser/Node built-ins only. The default deadline remains 10 seconds; allow a constructor `timeoutMs` option for deterministic short tests, validated as a positive finite number.

**Response checks:** require a non-array JSON object. State/mutation snapshots require nonempty `instanceId` and `docGeneration`, nonnegative safe-integer revision/artRevision/controlEpoch, boolean `requiresGrant`, coherent nullable grant fields, current document version/dimensions with layer/mark arrays, valid playback status/speed/remaining/nullable active shape, history cursor/total, comments array, and nullable string error fields. Validate the fields consumed by the browser; use focused nested checks for renderer inputs and comment fields rather than accepting arbitrary nested values. Avoid importing Node-only direction validation into the browser. A state read alone also permits `{unchanged:true,heartbeat}` when it was requested with an instance and revision. Project reads require current `codesketch` v2 with commands/cursor/queue/comments. Heartbeat is an object with nullable timestamp string. Unknown extra fields do not substitute for required current fields; no obsolete response forms are accepted. A mutation response cannot be an unchanged envelope or project.

**Errors/connection:** preserve HTTP status on HTTP rejection, including non-JSON error bodies; attach a protocol-error classification for invalid successful responses. A complete valid success or complete valid HTTP error demonstrates transport reachability; only valid endpoint success resolves. Timeout/network failure reports offline. Invalid successful protocol data reports an error and does not announce recovery. Caller cancellation rejects without declaring the server offline. No automatic mutation retry. Connection callback sequencing belongs to H3.

**Acceptance:** controlled fetch/stream responses cover headers arriving then a stalled body, body read failure, malformed/empty JSON, HTTP error with text body, valid snapshots/projects/unchanged reads, wrong-endpoint envelopes, malformed nested active/document data, caller cancellation, and timer cleanup after success/failure. Verify a stalled body settles within the deadline and emits no premature reconnect. Keep tests isolated and restore global fetch after use. If validation plus meaningful tests would exceed the ceiling, split response-shape checks into a separately owned follow-on before integration.

### H3 — sequence connectivity and mutation intent (approximately 400–500 lines)

**Ownership:** after H2, `apps/studio/src/studio/api.mjs`; new `apps/studio/src/studio/requests/index.mjs` and focused files below that context as needed; new `apps/studio/tests/studio-request-order.test.mjs`. The accepted studio UI consumes this public context; this assignment authors no hierarchy.

**Public contract:** add a `StudioRequests` coordinator with `readState()`, `mutate({expectedDocGeneration,run})`, `observe(snapshot)`, and `invalidate()`. Construct with `{api,acceptSnapshot}`. `readState()` coalesces concurrent reads into one request and uses the last accepted instance/revision. `observe` records only snapshots accepted by `acceptSnapshot`; mutation replies pass through the same acceptance path. `mutate` freezes its explicit generation at enqueue time, serializes local mutations, and invokes `run(api)` only while that generation remains current and the coordinator is synchronized. It returns the accepted result or rejects with an explicit stale/uncertain/error outcome. It never replaces a captured generation with a freshly fetched one. Comment request IDs and reviewed art revisions remain caller-owned and immutable during retry.

**Reset/uncertainty:** `invalidate()` retires pending local intents and requests a fresh full state before further work. Accepted instance/generation rotation cancels queued old intents and late callback effects. A timeout, network failure, invalid mutation response, or server persistence failure has an uncertain write outcome: reject that operation, cancel its queued dependents, and refresh. In particular, HTTP 500 from flush can follow a successful in-memory mutation. A refresh establishes current state; it does not prove whether an unkeyed command committed, so the coordinator never replays it. HTTP 409 refreshes and requires renewed user intent. Known validation rejection cancels dependent queued intents without poisoning future independent work.

**Connectivity order:** assign request issue sequence numbers in `StudioApi`; only a terminal result at least as new as the last applied connectivity result may change connectivity callbacks. Older success cannot announce recovery after a newer failure, and older failure cannot overwrite a newer success. Reconnect fires once per observed offline-to-reachable transition, after complete response validation. Snapshot revision/instance checks remain authoritative for artwork even when connectivity callbacks are suppressed.

**Human pause:** give pause priority over queued ordinary mutations by invalidating those unsent intents. An already-sent mutation must settle or become uncertain before dependent requests dispatch; pause remains visibly pending until its server acknowledgement is accepted. This coordinator provides local ordering, not cross-tab exclusion. Later UI wiring must call `invalidate` when abandoning a gesture/composer and must preserve the server's pause until explicit continuation.

**Acceptance:** deferred responses prove single in-flight polling, ordered mutations, reset with queued stroke, rejected generation at dispatch, late old-instance replies, older failure/newer success and reverse ordering, one reconnect callback, uncertain mutation without replay, and pause cancelling unsent work. Include the case where server mutation succeeds but its response is lost. No layout assertions.

### H4 — enforce human HTTP document generation (approximately 350–500 lines)

**Ownership:** `apps/studio/src/transport/server.mjs`; new `apps/studio/src/transport/human-context.mjs`; new `apps/studio/tests/human-generation-http.test.mjs`; `apps/studio/src/transport/README.md`; the current-behavior portions of this report record H4. Client/fixture updates are H5–H6 and integrate with H4 as one current-contract change.

**Exact wire change:** every `source:'human'` POST to `/api/commands`, `/api/control` (including pause and speed), `/api/project`, and `/api/demo` requires a top-level `expectedDocGeneration` equal to the current session generation. Missing, malformed, or unequal values reject with HTTP 409 and the existing `{error:string}` envelope. Match the generation exactly; do not trim or synthesize it. Perform this guard after the complete JSON body is read, immediately before synchronous domain mutation, with no intervening await. A failed guard leaves the complete session snapshot unchanged. Demo checks the caller's old generation once before its reset-and-stage operation; its internal staging uses the newly reset session.

**Boundary choice:** this is an HTTP optimistic-concurrency guard for browser writes. `Session.submit/control/load` remain trusted in-process APIs, and `ControlGrant.check` retains its human authorization semantics. This is an explicit internal trust boundary, not an HTTP compatibility path. Existing agent generation/epoch/grant enforcement remains in the domain. Agent pause/speed, comments' existing generation/artRevision/seq checks, GETs, and authenticated lifecycle routes retain their current contracts. No human epoch or grant token is required. Project v2, recovery v1, snapshot/capture shape, and CLI flags stay current and unchanged.

**Guarantee and limit:** a request prepared for A cannot mutate replacement document B, including after a server restart. An operation that commits before the replacement remains a valid operation on A. This guard does not order two writes within the same generation or invalidate a delayed resume after a newer pause in that generation. H3 handles local intent ordering; cross-tab control-epoch compare-and-set would be a separate contract change and is outside this minimal task. Never claim client cancellation can recall an already-sent HTTP write.

**Acceptance:** ephemeral HTTP tests cover each guarded endpoint/action with current, missing, malformed, and stale generations; two clients where one resets/loads while the other's body is delayed; guard checking at body completion; exact snapshot equality after rejection; old/new generation around demo; agent controls and comment guards; valid current human pause while playback advances. Test that nested project metadata cannot supply the wrapper's generation. Assert unchanged history, grants, comments, and pending work on rejection.

### H5 — update browser mutation payloads and JS HTTP fixtures (approximately 400–500 lines)

**Ownership:** after H2–H3, `apps/studio/src/studio/api.mjs`; new `apps/studio/tests/studio-api-human-context.test.mjs`; HTTP fixtures listed below. Coordinate exclusive ownership of `api.mjs` across H2/H3/H5. H5 integrates with H4 and has no fallback for contextless callers.

**Exact public signatures:** `sendCommands(commands,{expectedDocGeneration,replace=false,play=true,immediate=false})`; `sendControl(action,{expectedDocGeneration,speed}={})`; `loadProject(project,{expectedDocGeneration})`; `loadDemo({expectedDocGeneration})`. Each rejects absent/invalid generation before fetch and sends it at the top level with `source:'human'`. The former positional speed form is rejected. There is no implicit state fetch, optional wire generation, or automatic rebase/retry. `createComment` and `resolveComment` signatures retain their already-required review context. Reconstructed callers capture context from an accepted snapshot and route through H3; pause-handshake `sendPause` closes over its interaction generation.

**JS HTTP fixture edits:** `apps/studio/tests/http.test.mjs`, `comments-http.test.mjs`, `comments-reset-http.test.mjs`, `finish-http.test.mjs`, and `lifecycle.test.mjs` contain contextless human POSTs. Update each legitimate write with generation from its observed state/preceding accepted response. Keep missing/stale-context negative cases explicit; shared helpers must not silently repair them. Browser scenarios with direct human API requests also need update: `apps/studio/tests/browser/comments.mjs`, `comments-races.mjs`, `finish.mjs`, `layers-keyboard.mjs`, and `layers-opacity.mjs`. Retarget presentation selectors only under the separate creative implementation assignment.

**Unaffected JS setup:** direct-session fixtures in `managed-fixture.mjs`, `capture-contract.test.mjs`, `recovery*.test.mjs`, `session.test.mjs`, `finish-session.test.mjs`, and `comments-*.test.mjs` keep the trusted in-process API. Inspect actual HTTP writes rather than blanket replacing `source:'human'`. In particular, lifecycle's internal pause remains callable during controlled shutdown.

**Acceptance:** payload tests inspect all changed method bodies; missing context performs zero fetches; stale context is transmitted unchanged; speed uses the new object signature. Run the affected HTTP suites with H4. If fixture edits approach 1000 changed lines, split HTTP and browser fixture ownership into separate bounded assignments; merge them together before verification.

### H6 — update Go integration seed requests (approximately 150–300 lines)

**Ownership:** `apps/paint/internal/cli/studio_test.go`, `comments_studio_test.go`; `apps/paint/internal/cli/lifecycle/restart_test.go`, `restart_concurrent_test.go`, and `stop_failure_test.go`. Add a narrowly named fixture helper in the owning test package only if these files would exceed 300 source lines.

**Fixture contract:** these tests emulate human HTTP requests. Read the current isolated studio state, extract `docGeneration`, and include it as `expectedDocGeneration` in human controls and seed commands. Keep negative stale-context assertions able to supply their own captured value. `restart_test.go` currently owns `studioRoute`; any helper change must preserve its generic raw-request behavior so it cannot conceal missing context.

**Go production/public contracts:** `apps/paint/internal/cli/grants.go` states that the CLI never claims human source. Its explicit agent `--generation`, `--epoch`, optional `--grant`, and project wrapper require no change. `grants_payload_test.go` intentionally embeds human-looking metadata inside an untrusted project; preserve that fixture to prove it cannot impersonate the caller. `tests/fixtures/capture-contract.json`, Node `capture-contract.test.mjs`, and Go `capture/contract_test.go`/`contract_browser_test.go` describe snapshot/rendering envelopes and need no fixture-format changes. Embedded release assets follow the lead-managed release sequence: stop the old binary's studio successfully, then start the new binary's studio. The lifecycle manager cannot discover or restart an incompatible old digest.

**Acceptance:** run affected Go package tests with module networking disabled; the manager runs isolated real-studio integration and required full verification after H4–H6 integrate. Tests preserve disposal and owned-process cleanup. No production endpoint or persistent staging runtime is involved.

### Integration order and review evidence

H1 is independent. H2 precedes H3; H5 follows their `api.mjs` edits. H4, H5, and H6 form one atomic public-contract delivery, with current callers and fixtures updated together. All assignments retain zero external dependencies and contain no compatibility adapters or format migrations. The manager reviews changed files, focused results, and `npm run verify`; reconstructed browser workflows supply final pixel and gesture evidence. This preparation inspected code/callers only and ran no tests or application processes.

## Independent feasibility corrections for Gemini's correct-model drafts

Reviewed the supplied `DESIGN_SYSTEM_AND_HIERARCHY.md` (D) and `RECONSTRUCTION_CONTRACTS.md` (R) in `/private/tmp/codesketch-gemini38-ui-20260910` after the hazard contracts were drafted. References identify the draft text observed during this review; revisions may move lines. These corrections supply retained-code facts for the accepted package. They do not replace or prescribe its hierarchy.

### Blocking technical claims

| Draft evidence | Accurate retained contract and revision obligation |
| --- | --- |
| R:105–120: `codesketch-v2`, metadata/canvas/layers envelope, browser storage, restoration flag. | `direction/project.mjs` and `Session.project()` define exactly the current editable project `{format:'codesketch',version:2,commands,cursor,queue,comments}`. The document is derived by replay. `transport/persistence.mjs` writes recovery v1 to a configured server filesystem path using temporary file, fsync, and rename; a development studio can be memory-only. No retained localStorage/IndexedDB artwork store or `sessionRestored` flag exists. Gemini must use the current format and server-owned persistence facts. |
| R:48–55: `documentGeneration`, `instanceIdentity`, numeric generation, mutation tuple. | Snapshot names are `docGeneration` (opaque UUID), `instanceId`, `revision`, `artRevision`, and `controlEpoch`; comments each have `seq`. General revision tracks session changes, including controls. Current guarded agent requests carry `expectedDocGeneration`, `epoch`, and optional `grantToken`. Human HTTP generation guards are implemented in H4. There is no universal server guard on `{instanceIdentity,revision,controlEpoch}`. |
| R:17–20, 78–89: SSE, browser queue execution, map of layer stacks, fixed timing, uppercase statuses, rAF Max. | `transport/server.mjs` serves HTTP polling and performs `Session.tick(40)`. Session owns queue, active command, and command history; browser state holds snapshots. Status values are lowercase `idle`, `playing`, `paused`; speed is numeric 0.25–8. Duration is `max(120, pathDistance/0.55)` milliseconds before speed scaling. Browser animation frames may schedule rendering, never commit server commands. `Max` can only be an explicitly labelled numeric 8x preset; finish is a distinct control. |
| D:100–102 and R:57–60: pause blocks further submissions; all agent batches need a grant. | Human pause advances epoch and revokes execution grants on server acceptance. Agents can stage `play:false` work with current generation/epoch while paused. Execution requires a matching grant after intervention. Initial fresh sessions accept guarded execution without a grant. An already-committed command remains committed. Drafts must distinguish pending pause acknowledgement from confirmed pause; networked stopping is not instantaneous. |
| R:91–103 and D:120–128: listening/addressing/reopened thread states and automatic handshake. | `direction/feedback/store.mjs` defines `open → acknowledged → addressed → resolved`; reopen returns to `open`. Endpoint transitions are explicit and sequence-guarded. Comment creation only creates `open`. `PauseHandshake` coordinates a browser pause acknowledgement, not the thread lifecycle. Heartbeat reports last agent poll and does not prove listening, understanding, planning, or correction. The engine does not verify the quality of addressed work or guarantee eventual resolution. |
| R:95 and R event matrix: omitted region or `target:'whole-artwork'`; `{region,body,pauseAgent}`. | The actual request is `{requestId,text,rect,continuePlayback,expectedDocGeneration,expectedArtRevision}`. Whole canvas requires `rect:null`. Region coordinates are integer document pixels with positive dimensions and full containment. Internal UI events may have local names only when explicitly translated to this wire contract. |
| D:116–128: hold until addressed then automatically correct/continue. | `continuePlayback:false` keeps pending work and revokes execution authorization; acknowledgement/addressed status alone grants nothing. `true` discards queued work and partial preview, issues an execution grant, and stays paused awaiting agent action. An ordinary human resume issues a grant and continues pending work. Selection begins only after accepted current pause acknowledgement; stale art requires reselection/review with text preserved. The implementation makes continuation intent explicit and has no automatic “until addressed” release promise. |
| D:252: recovery counts and conflict merge; D:164–167: restored log/saved guarantee. | Snapshot supplies `storageError` and `playbackError`, with no persistence-enabled flag, recovery count/log, save-progress flag, merge endpoint, or restoration event. Request pending state can be local; successful mutation acknowledgement is distinct from a durable-save guarantee in a memory-only studio. A same-version restart accepts a new instance and refreshes context. Cross-digest replacement is a lead-managed old-binary stop followed by new-binary start; the lifecycle manager cannot discover or restart an incompatible old digest. Conflict handling preserves draft input and requests renewed review; it cannot promise automatic merge or restoration telemetry. |

### Capability feasibility and safe additions

| Draft claim | Feasibility boundary for Gemini |
| --- | --- |
| D:200, 316: Select / Move; D:182, 289: duplicate/delete/order layers. | Existing commands create marks and add/update layers; they expose no object hit-testing/selection/movement, mark editing/deletion, layer duplication/deletion/reordering, or layer locks. Selecting a target layer and selecting a comment region are supported interactions. Layer array order determines compositing, with later layers above earlier ones; displaying that order does not authorize editing it. These document operations need removal from reconstruction promises or separate future scope. |
| D:182: Layer-Local Erase as a context action. | The retained eraser is a stroke brush applying destination-out to its target layer. If the label means selecting that eraser tool it is feasible. A one-click clear/delete-layer operation is not a retained command. Gemini must state its actual meaning. |
| D:215–217: 1–128px brush size; shape stroke color/width. | Brush size is 1–100; stroke opacity 0–1. Rectangle and ellipse commands are filled shapes with geometry, color, opacity, and target layer. Outlines, independent stroke properties, and blend modes are unsupported. Default background is `#f7f3e8`. A brush ring is a nominal size guide: pencil width is 0.35× size (minimum 1), soft brush passes reach 1.18× size, and marker has distinct square-cap/alpha behavior (`painting/rendering/stroke.mjs`). |
| D:170, 299: native cropped/scaled PNG controls in browser. | Native CLI capture supports crop/scale/committed semantics. `StudioRenderer.exportPngBlob()` exports its current canvas; the HTTP API has no native-capture endpoint. Browser crop/scale export is a feasible additional browser implementation using a separate canvas and bounded output size, not existing browser wiring. It requires its own approved task and pixel tests. Preserve deliberate active/committed semantics and exclude UI overlays. |
| D:231, 306: exact batch step/total progress. | Snapshot supplies history cursor/total, pending count including active, and fractional active progress. It supplies no batch identity, initial batch total, or agent ownership. Append, replace, undo, and human commands make `34/85` a claim the general UI cannot derive reliably as a batch counter. Gemini should base labels on fields actually available; a locally tracked baseline must be explicitly scoped and invalidated. |
| D:229–230: Paused by Human / Analyzing Feedback. | The wire status is `paused`, without pause actor/reason or agent activity identity. A tab can know its own acknowledged human pause until later state invalidates that provenance. General status across tabs/reload cannot infer who paused or whether an agent is analyzing. `requiresGrant` also does not identify the pausing actor. |
| D:160: editable persistent document title. | Current project/session has no title field. A local suggested download filename is a presentation-only addition; a shared or saved document title needs a separately approved contract. Gemini must state that distinction wherever the title appears. |
| D:186: human/agent author avatars. | Comments contain no author identity or avatar field. Generic decorative role cues cannot claim stored authorship or multiple-agent presence. Timestamps, numbers, text, rect, and status are available. Resolve requires addressed status; reopen uses current sequence. |
| D:197–200, 253: view zoom/pan. | Safe presentation-only additions: transform the viewport, leave document coordinates and exported intrinsic size intact, and use `canvasPoint` with the actual displayed bounds. R:69's division by zoom alone is insufficient when fit-to-window adds scaling. Region overlays and brush guides must use the same transform. |
| D:302–305: presets, swatches, cursor, shortcuts. | Parameter presets and numeric/color pickers can populate existing setters; recent colors can be derived from current marks or kept as local UI state. Cursor guides, tooltips, and shortcuts are new presentation work. Hotkeys were removed with presentation and must be explicitly implemented; they are not retained API capabilities. These additions require no document-format change. |

### Interaction feasibility obligations for the revised creative package

- D:317 assigns Space-drag to pan while D:325 assigns Space to playback toggle. Gemini must define unambiguous keydown/keyup/modifier behavior so panning never resumes the agent. Ignore tool/playback shortcuts while editing text, preserve native keyboard activation, and define focus ownership consistently (D:50 and D:318 currently name different focus destinations). This is an interaction contract, not a hierarchy change.
- Fit-to-window and 100% zoom are different operations on a small viewport (D:330). Gemini must label the chosen behavior accurately. “Sub-millisecond,” “zero-lag,” “instant,” and guaranteed-resolution claims lack retained evidence; express observable pending/success/error states instead.
- Dark-only tokens and examples do not complete the required light/dark appearance coverage. Gemini should supply both appearances within its authored hierarchy, plus focus/disabled states and reduced-motion behavior for animated presence cues.
- R's inline style attributes conflict with the current `style-src 'self'` CSP in `transport/http.mjs`. Implementation should use same-origin stylesheet classes for static styling and deliberate browser DOM APIs for changing values; no CSP relaxation is implied by the mockup. R's DOM tree is creative guidance, not an executable transport contract.
- Whole-canvas feedback, uncertain submission retry, explicit reselection after artwork changes, resolve/reopen eligibility, request-in-flight pause, and offline preservation need accurate journeys alongside the region-comment example. Ordinary `step`/`finish` complete the active command as well as queued work, remain paused, and keep each committed command undoable; clear removes partial preview too.
- The accepted implementation keeps repeated capability tables, examples,
  checklist assertions, and component payload descriptions consistent with
  H1–H6. The manager verifies these current bindings in the release cycle.
