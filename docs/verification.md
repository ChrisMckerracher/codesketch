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
