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

## Complete agent CLI

Verified September 9, 2026. The CLI provides offline help and an embedded painting guide, direct strokes/shapes/layers, bounded JSON files and stdin, compact status, structured output, feedback-aware observation, and internally managed PNG previews, crops, and exports. `AGENTS.md` directs painters to the guide and records that timing judgments require measured timestamps. Implementation and fixes were delegated through Herdr; the lead reviewed code and ran independent checks.

| Check | Result |
| --- | --- |
| `npm run verify` | Passed: 90 native tests plus syntax, architecture, and supply-chain checks; three browser-only cases are deliberately gated |
| `CODESKETCH_BROWSER_TESTS=1 node --test tests/cli/observe.test.mjs` | All five cases passed, including full preview, crop, export, and missing-browser behavior |
| `node tools/capture-check.mjs` | Passed independently: real navigation/context replacement in both arrival orders, three fresh immutable captures, and pixel checks for layers, erasing, partial strokes, crop, and scale |
| `npm run test:browser` | Existing studio drawing, playback, feedback, and export workflows passed on an isolated server |
| Live read-only CLI preview | Produced a 1000 × 700 PNG with instance/revision metadata while preserving live playback |

Review addressed strict argument rejection before mutations, finite network/stdin/file reads, FIFO rejection, accurate queued acknowledgements, pause-preserving deadlines, brush instructions, browser startup failures, cancelled output publication, and browser/profile cleanup. Astra reproduced and fixed a navigation race by waiting for the intended document and its retained render promise, with bounded retries for execution-context replacement.

PNG capture uses the existing painting renderer and an installed Chromium-family browser, controlled directly with Node built-ins. It requires no Playwright package or CLI and performs no browser downloads. Native tests require Node alone. `status --json` retains the full state response for automation; plain `status` is concise.
