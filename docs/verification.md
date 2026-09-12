# Reconstruction release verification (September 10, 2026 — historical)

Historical record: verified September 10, 2026 for the earlier reconstructed UI release (superseded by the September 11, 2026 Studio vector reconstruction). The
strict browser runner in `tools/browser-check.mjs` runs the eight registered
scenarios (`studio`, `layers-keyboard`, `layers-opacity`, `comments`,
`comments-races`, `finish`, `appearance`, `connection`); each receives a fresh
ephemeral in-memory studio and a fresh short browser session, its parsed
run-code result must report `success: true`, `### Error` output rejects the
run, failures save full CLI output under
`artifacts/browser-check/<scenario>.last-run.log`, and `studio.mjs` deletes
stale downloads then validates a fresh codesketch v2 `project.json` and a
1000 × 700 `artwork.png`.

| Check | Result |
| --- | --- |
| Final `npm run verify` | Passed: 410 JavaScript tests with zero failures plus Go formatting, dependency/context policy, vet and race checks (`/private/tmp/codesketch-release-verify-final.log`) |
| Full native suite | `PAINT_STUDIO_TESTS=1 PAINT_BROWSER_TESTS=1 make test-go` passed all packages after isolated readiness-fixture prewarming (`/private/tmp/codesketch-native-final-rerun.log`) |
| Built binary | `make build` passed its policy gate; the copied binary served the complete embedded UI on ephemeral port 55164 — icon 200, 50 controls, 1000 × 700 canvas, runtime digest `0ab213ef5cc6cb71660a97302912a303af819f0626f16819a5003f3351f9c663` — and the owned browser session and runtime were stopped afterward |
| Full browser suite | Root combined `npm run test:browser` passed 8/8, including `finish` (active-preview Clear, Finish 101, pixel and Undo/Redo checks) and `connection` (`/private/tmp/codesketch-browser-release-final.log`) |
| Historical user visual acceptance | Historical note (superseded): Pending user review on Sep 10 (technical checks did not constitute design approval). User visual approval of the frozen vector baseline was completed on September 11, 2026. |

Production cutover completed on September 10, 2026 through the lead-managed
sequence: checksum-verified fresh recovery backup, old binary stop, new binary
start, with startup succeeding. The verified runtime is healthy at
`http://127.0.0.1:4317` with the same runtime digest as the verified build,
`0ab213ef5cc6cb71660a97302912a303af819f0626f16819a5003f3351f9c663`.
`make install` rebuilt and installed the CLI at `~/.local/bin/paint`.
Read-only verification confirms the artwork project is byte-identical across
the cutover and the human pause is preserved.

# Initial release verification

Verified on September 9, 2026 with Node 26.8.1 and the installed Playwright CLI using Chrome.

| Check | Result |
| --- | --- |
| `npm run verify` | Passed: syntax, source-size and nested-context checks, zero-dependency policy, and 41 native tests |
| `npm run test:browser` | Passed independently by the worker and lead against isolated ephemeral servers |
| Independent architecture/security review | Codex Astra high through Herdr approved the reviewed application with no remaining release blockers |
| Desktop and mobile | Full canvas at 1440 pixels and 390 pixels; no horizontal page overflow |
| Painting and direction | Real pointer strokes, undo/redo, layer selection/visibility, progressive playback, pause, step, feedback, and dialog cancellation verified |
| Exports and recovery | Downloaded PNG is 1000 × 700; downloaded project restored 125 marks, four layers, and feedback in a paused state |
| Rendering budget probe | 150,000 points: approximately 65 ms initial render and 8 ms cached redraw on this machine; illustrative measurement, not a portable benchmark |

Review findings addressed imported-command normalization, project-size round trips, feedback capacity pausing, bounded/coalesced recovery, stale responses across server restarts, rapid pointer submissions, keyboard activation, responsive canvas fit, and visible target-layer selection. Negative policy fixtures verify rejection of third-party and remote imports, remote CSS, dependency declarations, alternate lockfiles, executable evaluation, and private context imports.

The application ships zero third-party packages. The optional browser check uses the workstation's existing Playwright CLI. Native checks use Node built-ins. Runtime is local and single-user, with a fixed 1000 × 700 canvas, 3,000-command limit, 150,000-point limit, 24 layers, 100 retained feedback notes, 7 MiB compact project budget, and 8 MiB import limit. The external painting agent interprets feedback and submits revised drawing commands.

Git and Beads track the initial implementation on the shared bootstrap branch. `AGENTS.md` records that the lead owns architecture and review and delegates implementation through Herdr.

## Mac interface pass

Verified September 9, 2026. Agy implemented the presentation through Herdr, with an Astra high design review and lead screenshot/diff review. System typography, compact grouped controls, neutral surfaces, blue selection, continuous layer rows, and light/dark appearance follow the interface standard. The existing browser/Node runtime and painting contracts continue to serve the application.

`npm run verify` passed all architecture, supply-chain, syntax, and 41 native test checks. `npm run test:browser` passed against an isolated ephemeral server and verified painting workflows plus valid PNG and project exports. Lead screenshots confirmed the full canvas and legible controls at 1440 × 980 in light and dark appearance. Browser checks used a separate session from the live painting.

## JavaScript CLI release (historical)

Verified September 9, 2026 before replacement by the native Go CLI. The JavaScript implementation and its dedicated tests have since been removed. This section records historical results. The CLI provided offline help and an embedded painting guide, direct strokes/shapes/layers, bounded JSON files and stdin, compact status, structured output, feedback-aware observation, and internally managed PNG previews, crops, and exports. Implementation and fixes were delegated through Herdr; the lead reviewed code and ran independent checks.

| Check | Result |
| --- | --- |
| `npm run verify` | Passed: 90 native tests plus syntax, architecture, and supply-chain checks; three browser-only cases are deliberately gated |
| Retired JavaScript observation integration suite | All five cases passed, including full preview, crop, export, and missing-browser behavior |
| Retired JavaScript capture check | Passed independently: real navigation/context replacement in both arrival orders, three fresh immutable captures, and pixel checks for layers, erasing, partial strokes, crop, and scale |
| `npm run test:browser` | Existing studio drawing, playback, feedback, and export workflows passed on an isolated server |
| Live read-only CLI preview | Produced a 1000 × 700 PNG with instance/revision metadata while preserving live playback |

Review addressed strict argument rejection before mutations, finite network/stdin/file reads, FIFO rejection, accurate queued acknowledgements, pause-preserving deadlines, brush instructions, browser startup failures, cancelled output publication, and browser/profile cleanup. Astra reproduced and fixed a navigation race by waiting for the intended document and its retained render promise, with bounded retries for execution-context replacement.

That implementation controlled an installed Chromium-family browser with Node built-ins and reused the painting renderer. Its tests used Node. The native Go release below records the current capture implementation.

## Native Go CLI

Verified September 9, 2026 on macOS ARM64 with Go 1.25.7 and installed Chrome. `paint` is a compiled Mach-O executable installed in `~/.local/bin`. The binary includes the canonical agent guide and Canvas renderer assets and talks directly to the existing studio API. Its runtime invokes neither Node nor Playwright. The studio continues to use Node and browser Canvas.

| Check | Result |
| --- | --- |
| Final `npm run verify` | 105 JavaScript/policy tests passed, three legacy browser cases gated; Go formatting, source/context policy, module/embed inventory, vet and race tests passed |
| `PAINT_BROWSER_TESTS=1 go test -race ./internal/cli/capture` | Passed independently: real brush/layer/eraser/partial/committed/crop pixels, bounded input and PNG validation, callback trust and completion races, process/descendant/profile/listener cleanup, timeout/cancellation, and atomic output preservation |
| `PAINT_STUDIO_TESTS=1 PAINT_BROWSER_TESTS=1 go test -v ./internal/cli -run TestNativeStudioIntegration` | Passed independently against an ephemeral non-persistent studio: actual binary drawing, layers, sticky feedback pause, wait, new, save/load, undo/redo, submit/resume, native PNG pixels and interrupt exit status |
| Copied executable outside checkout | Native ARM64 format, version, JSON help, doctor and a 1000 × 700 read-only preview passed with Node absent from PATH |
| Installed executable | `make install` passed its policy gate; `paint` resolves to `~/.local/bin/paint`, prints the embedded guide and passes doctor from `/private/tmp` |
| Completion | Bash and Zsh syntax passed; Bash command/brush suggestions passed. Fish output is provided; its runtime test is skipped because Fish is not installed |
| Cross-compilation | Final CLI builds passed for Linux/amd64 and Windows/amd64. Runtime verification was on macOS; PNG capture is implemented for macOS/Linux and reports unsupported on Windows |

Review corrected single-dash equals parsing, missing flag values consuming other flags, JSON help consistency, and the build/install policy prerequisite. Fifteen isolated policy regressions cover external modules, replacements, workspaces, vendoring, platform-hidden imports/embeds, source ceilings, package direction, formatting, canonical asset provenance and the exact embedded renderer route mapping. Builds disable module networking, persistent Go configuration, automatic toolchain downloads and CGo; race tests use the installed CGo toolchain. There are no third-party Go modules or npm packages.

OpenCode implemented the initial parser and browser-discovery slices. Astra high reviewed and completed native command/capture integration, tests and packaging through Herdr. The lead reviewed the implementation, ran independent checks, and installed the executable. Tests used isolated state; live painting remained available throughout the migration.

## Native CLI cleanup

Verified September 9, 2026 after removing the JavaScript CLI, its capture implementation, dedicated tests and obsolete design. `paint` is the sole command-line interface. Current guidance and standards describe the native executable; historical verification above records the earlier releases.

`npm run verify` passed all 56 retained JavaScript/policy tests with no skips, plus Go formatting, dependency/context/embed policy, vet and race tests. `PAINT_STUDIO_TESTS=1 PAINT_BROWSER_TESTS=1 make test-go` passed native command integration against an isolated studio and real-browser capture/pixel/lifecycle checks. The Go implementation and canonical painting renderer are unchanged. OpenCode performed the bounded removal through Herdr; the lead reviewed the deletions, updated documentation and ran verification.

## Independent review repairs

Verified September 9, 2026. Astra high through Herdr reproduced and repaired three integration defects: capture during paused fill/layer commands, opacity edits overwritten by playback, and suppressed visibility-button keyboard activation. The lead reviewed the patches and independently verified the repairs.

Shared fixtures cover all six command kinds. Node checks them against real paused Session snapshots; Go uses the same data for validation and twelve preview/export pixel cases. Preview renders drawable transients, while fill/layer operations retain committed pixels until playback commits them. Export excludes active work before transient decoding. Malformed rendered data, point/pixel budgets and capture cleanup remain covered.

The opacity controller preserves local edits and their starting layer, serializes saves, handles delayed requests and older completions, and recovers from failure. Browser regressions exercise real pointer holds during playback, native keyboard input including range boundaries, Escape/blur/pointer cancellation, layer switches/removal, delayed-save ordering and retry. Visibility buttons respond to Enter and Space; row selection and arrows remain functional.

| Check | Result |
| --- | --- |
| `npm run verify` | 63 JavaScript/policy cases passed, plus Go formatting, dependency/context/embed policy, vet and race tests |
| `PAINT_STUDIO_TESTS=1 PAINT_BROWSER_TESTS=1 make test-go` | Passed independently: native studio integration and real-browser capture contracts, pixels and lifecycle checks |
| `npm run test:browser` | Studio, keyboard and opacity scenarios passed independently; valid 1000 × 700 PNG/project exports and isolated-session cleanup |

Regression work demonstrated the original capture failures and playback overwriting held opacity before repair. Final JavaScript policy and browser checks were repeated after the keyboard-boundary addition. No external dependencies were added. Tests used isolated state and preserved the live painter.

## Embedded artist skill

Verified September 9, 2026. `paint --artist-skill` and `paint guide --artist-skill` print the complete paint-with-references skill plus both reference documents. The three repository Markdown files match the user's Codex skill byte-for-byte. Output identifies bundled reference sections and supports the existing JSON text envelope. Help and shell completions expose the boolean flag.

The lead independently passed `npm run verify`: 66 JavaScript/policy tests, Go formatting, exact embed/dependency/context checks, vet and race tests. CLI regressions cover complete source content, both flag forms, JSON, offline execution, invalid arguments and ordinary guide output. Policy regressions reject missing references, renamed declarations, stray files and wildcard embeds. Bash completion behavior and available shell syntax checks passed; Fish runtime remains unavailable.

`make build` passed its policy gate. From `/private/tmp`, the compiled executable printed identical complete bundles with invalid studio/browser settings and Node absent from PATH. JSON output with an empty executable search path matched the text bundle. No network access, skill installation, runtime home-directory reads or external packages are needed to print the skill. Astra implemented the bounded code and test changes through Herdr; the lead copied the source skill, reviewed the patch and verified delivery.

## Canvas region comments — staging

Verified September 9, 2026 in Toronto. Automated checks ran against isolated ephemeral loopback ports with temporary persistence; port 4318 serves user review staging with its own persistence, and the final `.studio/staging/paint` CLI was built for it. `bin/paint` and the installed production CLI were preserved; production port 4317 remained frozen and untouched throughout all testing. Canonical embedded artist documentation was updated to reflect polling cursor retention, visible composite inspection, comment lifecycle (`ack`/`address`), continuation grants, and paused staging semantics.

| Check | Result |
| --- | --- |
| Final `npm run verify` | Passed: 155 JavaScript tests, formatting, source-size, context-boundary, embed-inventory, dependency policy, and Go vet and race checks (CLI 10.681s, capture 30.179s; log `/tmp/codesketch-verify-accepted-final.log`) |
| `npm run test:browser` | Passed: all five scenarios passed twice per `/tmp/codesketch-browser-worker.md` (`studio`, `layers-keyboard`, `layers-opacity`, `comments`, `comments-races`) on isolated ephemeral servers |
| `PAINT_STUDIO_TESTS=1 PAINT_BROWSER_TESTS=1 make test-go` | Passed: native real-studio CLI package (31.440s) and real-Chrome capture suite (89.124s); log `/tmp/codesketch-native-accepted-final.log` |
| Cleanup repair review | Passed: nine deterministic cleanup regressions; Astra medium reviewed the final repair — transient Darwin zombie-group EPERM is tolerated only while bounded proof of group disappearance and parent reaping succeeds, pending errno is preserved on failures, and existing persistent-group failure/profile/output guarantees are retained |
| Independent review repairs | Astra medium identified reset/load/history grant bypasses and UI pause/held-stroke races; OpenCode repaired the issues and the lead verified the fixes |

Historical sections are preserved above. In keeping with staging rules, no production binaries were built or installed into `~/.local/bin` during this documentation update.

## Compatibility cleanup — production release

Verified September 10, 2026 in Toronto. This release removed all compatibility debt and cut sole production port 4317 over to the newest code with the rebuilt native CLI. Current-only contracts: the studio accepts only `{format:"codesketch", version:2, commands, cursor, queue, comments}` saved projects and rejects obsolete files explicitly; region comments (nonnegative integer `artRevision`, `visibleLayers` array, nullable `rect`/lifecycle timestamps, `request:null`) replace every feedback surface — `/api/feedback`, the CLI `feedback` command, the session feedback projection and `FeedbackUI` are gone; capture accepts only the current session envelope with canonical `playback.active`. No conversion or migration code exists in the application, CLI, embedded assets or runtimes.

| Check | Result |
| --- | --- |
| `npm run verify` | Passed: 155 Node tests plus Go formatting, dependency/context/embed policy, vet and race tests (`/tmp/codesketch-compat-verify-final.log`) |
| `npm run test:browser` | Passed: all five scenarios (`studio`, `layers-keyboard`, `layers-opacity`, `comments`, `comments-races`) on isolated ephemeral servers (`/tmp/codesketch-compat-browser.log`) |
| Full native browser capture | Passed 58.654s (`/tmp/codesketch-compat-native-final.log`); one CLI fixture missing `rect:null` was corrected, then the relevant full native CLI/browser race rerun passed 21.726s (`/tmp/codesketch-compat-native-cli-final.log`) |
| Rendered-pixel comparison | Decoded RGBA buffers compared byte-for-byte with a stdlib decoder: 1000 × 700, 2,800,000 bytes, zero differences between frozen production and a candidate build on the initial 1,625-command painting |
| External conversion replay | Fresh v1→v2 conversion of current production data replayed through current `Session.load` and an isolated `createStudio` restore: full ordered history/cursor/queue preserved, document deep-equal to the live snapshot, paused restore, grant required, no active grant, no storage error, export/reimport roundtrip identical |
| Managed cutover | Single bounded script (dry-run first caught and fixed a v1 `feedback`-key preflight bug); SIGTERM-only to confirmed PID 51212; old process exited in 102 ms with the disk hash unchanged; same-filesystem temp+rename atomic data replace; detached start of current code. Availability window 630 ms (04:41:12.211Z–04:41:12.841Z UTC) |
| Post-cutover health | Project v2 with 1,631 commands, cursor 1,631, queue 0, comments 0, no feedback projection; document deep-equal to the validated pre-stop reference (1,624 marks); paused, requiresGrant true, activeGrant null, no storage/playback errors; fresh instance `769106ea-db81-4d9b-a2be-028c0bb85027`; new detached PID 23772 |
| Installed CLI | `make install` placed `~/.local/bin/paint` with SHA-256 `bf97269edadd8d38cc46fbf068840657be3710dc96bb66e9a059c37f32d2beb4`, identical to `bin/paint`; offline help exposes comments and the generation/epoch/grant mutation contract and rejects `feedback`; doctor, status and read-only comments checks passed against production |

The user painted throughout preparation, so the backup baseline moved twice (1,625 → 1,627 → 1,631 commands). The conversion was regenerated from each fresh baseline after hash-guarded aborts; the final preserved v1 baseline (`9d138e140b91da3e583b1788115b9b3aa0e591376a8a505dea36bcc00c4401e9`) and converted project (`5af186abbfa7587a671200ed4d32ebe33558735233c1d39cbb3b99768a0a637d`) live in `.studio/backups/compatibility-20260910T043754Z/` alongside the cutover result. The superseded 1,625-command-era backups and the pixel-comparison evidence remain in `.studio/backups/compatibility-20260910T042009Z/`. The pixel comparison validated the render pipeline on the initial painting only; the newer 1,631-command artwork was verified by exact replay and post-cutover document deep-compare, not by a newer PNG comparison.

After the lead independently confirmed production health, retired resources were removed by verified PID: the staging server (port 4318) and two ephemeral `createStudio` servers (ports 63908, 53351). The staging session was preserved as `retired-staging-project.json` before `.studio/staging` was deleted, and the frozen `.studio/production-95949b8` runtime was removed after unlinking its nested `.studio` symlink without following it. Owned `/tmp` conversion, validation, cutover and candidate-build artifacts were removed after evidence was copied into the backup directories. An unrelated application on port 63722 was left untouched. Production PID 23772 stayed running throughout cleanup, and the user painted on it immediately afterward (1,636 commands by cleanup verification), confirming live persistence on the new runtime.

## September 10 monorepo and managed-studio verification — production release

Production release evidence recorded September 10, 2026. Current contracts are current-only with strict recovery, bare `paint` lifecycle commands, Finish completes the queue atomically and preserves individual undo, a Go/JavaScript monorepo, and accessible native presentation. Production was accepted from the immutable cache before root source integration completed; the server ran independently from that cache throughout integration.

| Check | Result |
| --- | --- |
| Final `npm run verify` | Passed in `/tmp/codesketch-backlog-verify-final.log`: 254 JavaScript tests, zero failures or skips; Go formatting, policy, vet and race checks passed; 120 Go source files and 229 resolved packages; lifecycle 31.424s; CLI 11.180s; ordinary capture race suite 23.498s. |
| Browser workflows | Six isolated scenarios remain valid from `/tmp/codesketch-backlog-browser-final.log`: `studio`, `layers-keyboard`, `layers-opacity`, `comments`, `comments-races`, and `finish`. Finish covered 100 steps and PNG equality; studio verified a 1000 × 700 PNG and project export. |
| Native CLI and capture | The opt-in native suites remain valid from `/tmp/codesketch-backlog-native-final.log`: CLI 25.562s and capture 68.974s. |
| Complete Linux lifecycle | Passed in `/tmp/codesketch-linux-lifecycle-complete.log`: 76 top-level passes, zero failures or skips; final orphan-EPIPE case 0.68s. Linux compiled `GOOS=linux GOARCH=arm64 CGO_ENABLED=0` in a Node 22 pinned container running as UID 1000 with `--init` and temporary execution filesystems. |
| Orphan and launcher cleanup | Final direct-retained-launcher proof covered actual launcher `Wait`/`SIGKILL`; the orphan self-crash requested its marker and proved endpoint refusal and lease release. Mac init and Linux `--init` provide orphan reaping; no `waitpid` completion is claimed for the orphan. Senior Astra medium implemented cleanup through Herdr; the lead reviewed and fully verified it. |
| Real artwork rehearsal | Passed from receipt `rehearsal-20260910T104915042Z.json`: instance `3b71a26d-5ecb-4b3a-82cf-9815b48a0c0c`, port 57813, full artwork and project restored, stopped successfully with temporary data removed. |
| Backup baseline | Final source, binary and artwork backup: `.studio/backups/20260910T104212Z-prep`. |
| Source integration | Lead independently passed all 19/19 source-sync checks. Integration applied 273 copies and 135 deletes; hashes were verified after healthy acceptance, with `.git`, `.beads`, `.studio` and artifacts preserved. |
| Cross-build and static checks | Final CLI cross-builds for Linux/amd64 and Windows/amd64 passed with `GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOWORK=off GOFLAGS= GOENV=off CGO_ENABLED=0`. Static `node tools/verify.mjs` passed for the integrated source. |
| Cutover binary | `make build` passed. Cutover `bin/paint` SHA-256: `305dab5d1295b739575a23a803b97fda7906bbfc7484570be9a9dcd006c9d907`. The copied-binary lifecycle smoke test passed with isolated temporary data, port 0, and `NoOpen`; both runtimes stopped and temporary data was removed. |
| Production cutover | Receipt `cutover-20260910T105257325Z.json` records `released/accepted`: 986 ms from SIGTERM to verified health; old PID 23772 exited; new PID 60245 runs instance `90da6320-c52d-408c-9622-0a7f04807f99` with runtime digest `1e08f9d1a06a17045209338fadcd4db26a6cdd1cc24dc55b34eda2f06e23a3e5`, sole port 4317, paused state, speed 1, remaining 0, active `null`, and no storage error. |
| Production confirmation | Lead confirmed installed CLI status, process state with `ps`, and sole listener with `lsof`. Old source, data and backups remain preserved. New durable data is in `~/Library/Application Support/codesketch`; runtime data is in `~/Library/Caches/codesketch`. |
| Accepted release self-tests | Passed 103 assertions in `verification/codesketch-release-selftest-accepted.log`. The preserved project had 1,636 commands, cursor 1,636, queue 0, and comments 0. |

GitHub publication verified: `gh repo view` reports the repository public at [github.com/ChrisMckerracher/codesketch](https://github.com/ChrisMckerracher/codesketch), and main source commit `469cd59` was pushed. A clean `--no-hardlinks` local clone of that committed tree passed `make build` with the offline policy gate (120 Go files and 229 resolved packages); log: `/tmp/codesketch-publication-clean-build.log`.

## Studio vector reconstruction verification — September 11, 2026

Visual design baseline approved September 11, 2026 matching user-approved frozen reference mockup (SHA-256 `ff8ca047b1a56b252180bccdbe0baee57e6fb13dfe9fdefef640af9e5c2b6d64`). Final source committed at `cfb0cf6`, merged to main at `abd084b`. Studio presentation operates strictly on dual canvases (`#painting-canvas` and `#ui-canvas`) with custom vector typography (`GLYPHS` engine), fixed 1000×700 design geometry, and invisible semantic DOM backing controls (`#control-host`) for native accessibility, IME composition, and keyboard navigation without visible HTML text nodes.

| Check | Result |
| --- | --- |
| Final release-gate verify | Passed: 534 JavaScript tests with zero failures plus Go formatting, dependency/context policy, vet, and race checks (`/private/tmp/codesketch-manager-release-verify-20260911.log`). |
| Extended native suite | Passed: all native packages passed extended verification (`/private/tmp/codesketch-native-acceptance-20260911.log`). |
| Candidate binary verification | Passed: copied candidate binary outside checkout passed real drawing, feedback `SEND`, and native agent reply with zero browser console or network errors; runtime digest `a596bb38707b98b4bb86c29f6c209be2c0e718dd957b6ba99b9b718069da5c37`; candidate process closed and stopped cleanly. |
| Browser reconstruction suite | Passed: final manager `npm run test:browser` passed 8/8 registered scenarios (`studio`, `layers-keyboard`, `layers-opacity`, `comments`, `comments-races`, `finish`, `appearance`, `connection`) with zero failures (`/private/tmp/codesketch-final-browser-20260911.log`). |
| Production cutover & release | **Accepted / Released**: Lead cutover completed at 2026-09-12T00:30:37Z (September 11, 20:30 EDT) in 0.928 seconds (complete stop/start/health/preservation sequence). Receipt and backup recorded in `/private/tmp/codesketch-vector-release-fp9rxg4f/{data-backup,paint-before,paint-candidate,cutover.json}`. Old PID 59613 stopped cleanly through authenticated old CLI; candidate atomically installed to `~/.local/bin/paint` (SHA-256 `4ba17b41e05bbd8d715f153d014821afd7c8cd2343d1559f8f56835a262d5533`). New healthy production runtime running at `http://127.0.0.1:4317` with PID 62621, instance `4d4d4587-e787-4554-94e5-2da9cfee377a`, and runtime digest `a596bb38707b98b4bb86c29f6c209be2c0e718dd957b6ba99b9b718069da5c37`. Exact isolated rehearsal restored project/document, followed by production exact preservation: 1,378 commands, 2 comments, paused state (speed 8), `activeGrant: null`, `requiresGrant: true`; no data replacement needed. |

### Independent review corrections and rechecks

- **Independent review & browser strengthening**: Independent Astra medium final source review found no blocking findings in strengthened comments/navigation/retry and appearance/DPR 2/CLS assertions.
- **Workspace contracts & public signatures**: Synchronized [`apps/studio/src/studio/workspace/README.md`](../apps/studio/src/studio/workspace/README.md) to match actual implementation contracts: `createWorkspace` returns `{ ui, update, destroy }`, `renderWorkspace({ ctx, v, model, ui, controls, artwork })`, `samplePixel(canvas, x, y)`, and `threadViewport(anchor)`. Verified actual exports of `geometry/` (`DESIGN_WIDTH`, `DESIGN_HEIGHT`, `CANVAS_WIDTH`, `workspaceWidth`, `designPoint`, `clampWorkspacePoint`, `clipRect`) and `vector/` (`GLYPHS`, `createVector`), removing unexported names.
- **Obsolete UI contexts removed**: Verified complete removal of retired DOM-based contexts (`header/`, `inspector/`, `layers/`, `playback/`, `tools/`, `viewport/`, `review/presentation/`) and legacy stylesheets; updated [`apps/studio/src/studio/README.md`](../apps/studio/src/studio/README.md) and [`docs/repo-map.md`](repo-map.md).
- **Standards geometry correction**: Removed inaccurate 24px gutter claim from [`docs/standards/interface.md`](standards/interface.md) and [`docs/standards/testing.md`](standards/testing.md); sidebar comments boundary spans `x: 752..968` (width 216px) with collinear thin 4px scrollbar at `x = 994`.
- **Comment lifecycle & ACK semantics clarification**: Clarified that the `ACK` badge in the UI strictly denotes the actual comment lifecycle status `status === "acknowledged"`. Autonomous agent replies via native CLI (`paint comments reply`) append bounded thread reply entries but do not automatically acknowledge comments or transition comment status. Feedback `SEND` directly establishes a continuation grant without a separate Resume button.
- **Testing limitations & candid notes**: Native OS-level IME candidate window interaction was not manually tested with an operating system input method engine; verification relies on synthetic composition events (`compositionstart`, `compositionupdate`, `compositionend`) and semantic `<textarea>`/`<input>` DOM backing elements.

## Post-release user corrections verification — September 11, 2026

Following user review feedback on the first release, technical baseline corrections were addressed across four areas: feedback dragging ergonomics, editable layer names, elimination of duplicated ordinals on numbered layers, and unboxed comment row styling matching reference mockups. Summarized feedback does not constitute new explicit visual approval; post-correction visual acceptance remains strictly pending user review and critique.

| Check | Result |
| --- | --- |
| Feedback dragging & comment rows (`39652ed`) | Reviewed: 38 focused unit/integration tests passed across actions, feedback threads, comments rendering, and spatial input; 4 browser checks passed explicitly (`appearance`, `comments`, `comments-races`, `connection`). Verifies empty feedback initialization, live drag box before pointerup, fixed opposite anchor on resize, grab-offset retention on move, and unboxed comment rows with selected-only accent. |
| Workspace controls & inline text editing (`f3090c8`, `f2e3479`, `4bb827a`) | Reviewed: 14/14 focused tests and all assertions retained and passed across split core, text, and pointer control test files (`4bb827a`). Includes 2-line native font patch (`12px/16px monospace`) committed at `f2e3479` on singleLine inputs for Chromium multi-word insertion while opacity remains 0 and visible lettering renders via GLYPHS; synthetic events verified (tests do not claim coverage of native OS IME candidate windows). |
| Layer actions & sidebar integration (`f2e3479`) | Reviewed / Committed: 17/17 layer action tests (`studio-workspace-layer-actions.test.mjs`) and 9/9 sidebar tests (`studio-sidebar.test.mjs`) passed; layer rename actions and ordinal suppression committed at `f2e3479`. |
| Full browser verification suite | Passed: All 8/8 registered browser scenarios (`studio`, `layers-keyboard`, `layers-opacity`, `comments`, `comments-races`, `finish`, `appearance`, `connection`) passed with zero failures (`/private/tmp/codesketch-polish-browser-20260911.log`), incorporating the native font control patch. |
| Candidate build & isolated rehearsal | Passed: `make build` passed its policy gate with 122 Go source files and 229 resolved packages. Copied candidate binary outside checkout rehearsed against byte-verified fresh production backup in `/private/tmp/codesketch-polish-release-57ao350f`; exact project, document, 2 comments, and paused playback preserved (history cursor/total 1398); candidate digest `3291063155817cc0ba297efe9432d267e381e851f3f6d6510d9b7f71fabf04ab`. Isolated rehearsal stopped cleanly before release cutover. |
| Full release-gate verify (`npm run verify`) | Passed: Exit code 0 with 561 JavaScript tests across 22 suites (0 failures, 0 skips); Go formatting, dependency/context policy, vet, and race checks all passed (`/private/tmp/codesketch-polish-verify-20260911.log`). |
| Production cutover & release | **Released / technically verified**: Managed cutover executed successfully at 2026-09-12T02:25:43Z (September 11 local) in 0.886 seconds from source merge commit `4576a7c`. Cutover receipt recorded in `/private/tmp/codesketch-polish-release-57ao350f/cutover.json`; byte-verified fresh backup preserved in directory `/private/tmp/codesketch-polish-release-57ao350f/data-backup`. Old PID 62621 stopped cleanly; candidate binary installed (SHA-256 `c48fe98ecda56fab9412595028f6046ac94dfffd02f59fdf868112d991856465`). Verified healthy production runtime running at `http://127.0.0.1:4317` with PID 58115, instance `751728e9-6bb3-46cd-b44e-0681f2d56b9f`, and runtime digest `3291063155817cc0ba297efe9432d267e381e851f3f6d6510d9b7f71fabf04ab`. Exact project, document marks, comments (2), playback state (paused, speed 8), and history (1398 entries, cursor 1398) preserved by exact structural JSON equality without data replacement. Fresh read-only browser smoke verified live instance `751728e9` with dual canvases, 39 semantic buttons, storageError null, and zero console errors or warnings (`/private/tmp/codesketch-polish-release-57ao350f/live-studio.png` inspected, owned browser closed cleanly). |
| Post-correction visual acceptance | **Pending user critique**: Summarized user feedback does not constitute new explicit visual approval. Post-correction visual acceptance remains strictly pending user review and critique. |

### Correction details and source contracts

- **Feedback empty start, resize anchor, and move offset**: Feedback activates in an empty state with no initial marquee or composer. Dragging on the canvas displays a live selection box before pointerup, mounting the composer only upon pointerup. Resizing preserves the fixed opposite anchor across handle crossings (maintaining a one-unit preview at exact crossing); moving retains dimensions and pointer grab offset.
- **Inline layer renaming & generation fences**: Clicking a layer name mounts an inline single-line editor, committing once on Enter or blur and canceling on Escape. Local drafts survive background polling and layer scroll, and failed saves keep the draft open without switching editors. Rename mutations are fenced by instance and document generation (dropping stale renames upon generation rotation), distinct from control epoch fencing used for feedback review.
- **Numeric-token ordinal suppression**: Layer names already containing numeric tokens (e.g. `03 LINEART`, `Layer 4`) suppress the generated two-digit ordinal prefix in row presentation without stored document text rewriting.
- **Unboxed comment rows & geometry**: Comments render as unboxed rows with hairline dividers between `x: 752..968` (width 216px). Only the selected row displays background fill (`#F0F9FF`) and vertical accent bar (`#0284C7`). Rows display title, spatial bounds coordinates, and real lifecycle status pills. The reserved gutter spans `x: 968..992` (24px) with the thin 4px scrollbar axis positioned at `x = 994`.
- **Production cutover & release summary**: Managed production cutover completed in 0.886s at source merge commit `4576a7c`. Production runtime is verified healthy on port 4317 with PID 58115, instance `751728e9-6bb3-46cd-b44e-0681f2d56b9f`, and runtime digest `3291063155817cc0ba297efe9432d267e381e851f3f6d6510d9b7f71fabf04ab` (binary SHA-256 `c48fe98ecda56fab9412595028f6046ac94dfffd02f59fdf868112d991856465`). 1398 history entries, 2 comments, and paused speed 8 were preserved by exact structural JSON equality against byte-verified backup directory `/private/tmp/codesketch-polish-release-57ao350f/data-backup` (receipt `cutover.json`). Fresh read-only browser inspection verified live dual canvases, 39 semantic buttons, storageError null, and 0 console errors or warnings (`live-studio.png`). All technical checks (561 JS tests, Go policy/vet/race, 8 browser scenarios) passed with zero pending technical checks. Post-correction visual acceptance remains strictly pending user critique, with no claim of new explicit visual approval.
