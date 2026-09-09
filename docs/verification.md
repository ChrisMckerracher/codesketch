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
