# UI reset: paint-at5.9

Status: removal implementation, supervisor review, verification, and worker cleanup completed on 2026-09-10. The next designer owns a fresh interface in bead 2. This document describes retained capabilities and safety contracts; it prescribes no visual structure.

## User capabilities supported by retained logic

- Create a 1000 × 700 painting, change its background, and apply brush, pencil, marker, eraser, rectangle, and ellipse commands with color, size, and opacity.
- Add and update named layers, including visibility and opacity. Rendering preserves layer order, compositing, and layer-local erasure.
- Observe committed artwork and progressive painting. Submit validated command batches, replace pending work, pause, resume, advance one command, change speed, clear pending work, or atomically finish pending work.
- Undo and redo completed work; start a new document; load the example composition.
- Leave whole-artwork or region feedback, track agent acknowledgement and addressing, resolve or reopen feedback, and observe agent listening activity. Human pause remains authoritative until continuation is authorized.
- Save and load editable project JSON, recover local sessions through atomic persistence, and capture PNGs through the native CLI, including supported crops, scale, and committed-artwork selection.
- Observe connection, playback, persistence, and validation failures. State synchronization rejects delayed revisions and retired server instances.

## Retained implementation boundary

`apps/studio/src/painting`, `direction`, `transport`, and `compositions` retain their logic. `apps/paint` retains the native CLI, lifecycle, transport, input, and capture implementation. The capture HTML/module and renderer-created canvases are necessary pixel-generation scaffolding.

The DOM-free modules `src/studio/api.mjs`, `state.mjs`, `renderer.mjs`, `comments/geometry.mjs`, and `comments/handshake.mjs` remain reusable logic. The comments entrypoint exports only retained logic. Rendering accepts a supplied canvas; it creates no user-facing interface.

All HTML/CSS under `apps/studio/public` is deleted. The studio bootstrap, icons, dialogs, canvas interaction, tools, playback, layers, layer-opacity interaction, and comment presentation/controllers are deleted. Their embedding entries are removed. The root HTTP route returns JSON 404; no presentation entrypoint is served.

Exact deletion inventory (23 files, relative to `apps/studio`):

- `public/`: `base.css`, `comments.css`, `dialogs.css`, `index.html`, `inspector.css`, `layout.css`, `responsive.css`, `tools.css`.
- `src/studio/`: `index.mjs`, `icons.mjs`, `dialogs.mjs`, `tools-ui.mjs`, `layers-ui.mjs`, `playback-ui.mjs`, `canvas-controller.mjs`, `layer-opacity.mjs`.
- `src/studio/comments/`: `comment-shortcuts.mjs`, `comments-list.mjs`, `comments-ui.mjs`, `composer.mjs`, `listening-status.mjs`, `overlay.mjs`, `selection.mjs`.

## Contracts for reconstruction

The HTTP API remains the source of session truth. Preserve current document generation, control epoch, revision, instance identity, comment sequence, and execution-grant requirements. Human actions and agent actions have distinct authorization semantics. Reject obsolete inputs. Editable projects use the current v2 envelope; recovery and native capture keep their existing strict contracts.

The next interface must reconnect user interaction to these capabilities. Native CLI/API operations and headless capture are available during the reset. Browser interaction verification is pending reconstruction; its retained scenarios are suspended evidence of coverage obligations, not a design specification or a passing suite.

Verification uses ephemeral loopback ports and temporary data. Port 4317 and production artwork are outside this assignment. No release is performed.

## Completed verification and handoff

- `npm run verify`: exit 0; 254 Node tests passed, zero skipped; JavaScript policy/syntax and Go formatting, dependency/embedding policy, vet, and race tests passed. Log: `/private/tmp/paint-at59-verify-final.log`.
- `PAINT_STUDIO_TESTS=1 PAINT_BROWSER_TESTS=1 make test-go`: exit 0. Native CLI integration and real headless capture passed. The final run reused passing cached results for unchanged packages and reran lifecycle tests. Log: `/private/tmp/paint-at59-native-final.log`; initial uncached CLI/capture results: `/private/tmp/paint-at59-native.log`.
- `make build`: exit 0; `bin/paint` built with local Go and module networking disabled. Log: `/private/tmp/paint-at59-build.log`.
- `npm run test:browser`: exit 1 with explicit reconstruction-pending output, before starting any browser or server. All six existing browser scenario modules are unchanged. UI interaction coverage remains pending for bead 2.
- `git diff --check`: passed. Source inspection found no studio DOM presentation/controllers. The only remaining HTML file is the native capture page. Painting, direction, compositions, capture, and the five retained studio logic modules have no changes.

Review corrected missing-asset JSON responses and three test integration assumptions: the managed fixture now prunes empty directories after stripping documentation; extraction/cancellation assertions use retained assets; the development launcher asserts JSON 404 at `/` while continuing to verify API state and clean shutdown. Runtime manifest validation and lifecycle implementation remain unchanged.

The worker reported one intermittent 503 in the existing broken-readiness-pipe test, followed by three passing repeats. Supervisor full verification passed. The possible readiness timing race remains a separately reported limitation; it was not changed in this removal assignment.

One fresh OpenCode worker (`reset-at59`, Herdr pane `w6:p18`) performed application deletions, integration edits, and test changes. Supervisor inspected the diff and ran the final commands above. The worker completed and its pane was closed at 12:57 UTC. Root lead `w6:p1` retains beads/git/integration ownership. This checkout has no beads database. No commits, dependency installations, or production access occurred. `AGENTS.md` now records the authorized journey/context-based hierarchy rule and separate fresh creative-session requirement.
