# Complete agent painting CLI

The painter needs a self-contained drawing loop: learn the tool, inspect the canvas, make marks, observe playback, read feedback, and export the result. The current JSON submission wrapper leaves preview capture and basic command construction to each agent.

## Product contract

`node tools/paint.mjs` remains the stable executable. No arguments and `help` explain the command groups and point to `guide`; `guide` prints a complete practical painting workflow with examples, coordinates, brush semantics, limits, pause handling, and how to read the PNG returned by `view`. Command help is available without a running server.

Provide `status` as a compact summary and `status --json` as the existing complete state contract. Mutations return concise acknowledgements by default and their complete API response with `--json`. Errors go to stderr with a nonzero exit status; JSON mode emits structured errors. Reject unknown commands, flags, malformed numbers, and missing arguments before mutation.

Drawing commands: `stroke --points "10,20 30,40" [--brush pencil] [--color '#253d38'] [--size 3] [--opacity 1] [--layer paint]`, `rect --x X --y Y --width W --height H`, `ellipse` with the same geometry, `fill COLOR`, and `layer list|add ID NAME|update ID` with visibility/opacity/name options. Drawing supports `--paused`, `--replace`, and `--json`. Retain `submit FILE` and add `submit -` for bounded stdin JSON. Domain validation remains authoritative.

Observation: `view [FILE]` writes an actual PNG of one fetched snapshot, including the active partial stroke, and reports path, MIME type, dimensions, revision, and playback state. Default output is an absolute path in the OS temporary directory. Optional `--crop x,y,width,height` and `--scale N` support detail inspection with bounded output dimensions. `export FILE` writes the full committed artwork PNG. These operations are read-only with respect to the live painting.

Session commands: retain pause/resume/step/clear/undo/redo/save/load/feedback. Add `new`, `speed NUMBER`, `feedback` without text to read notes, `wait --timeout SECONDS` to await queue completion while returning promptly on a pause, and `watch --timeout SECONDS --interval MILLISECONDS` to emit bounded revision/status/feedback events. A manual pause is never automatically resumed. All observing commands identify instance and revision.

## Boundaries and implementation

`src/cli` owns argument parsing, command dispatch, output, bounded filesystem/stdin I/O, and the loopback HTTP client. The executable delegates to its public `index.mjs`. `src/cli/capture` owns browser discovery, temporary capture resources, native browser protocol/lifecycle, and image extraction through its public `index.mjs`. Existing painting/rendering stays the sole renderer. Direction and transport contracts stay unchanged, allowing development alongside the current live painter without a server restart.

Capture uses an installed Chromium-family browser headlessly, controlled with Node built-ins only. It never invokes Playwright, downloads a browser, adds packages, or attaches to an existing user browser. `PAINT_BROWSER` selects an explicit executable; otherwise discover common installed Chrome/Chromium locations. Use a fresh temporary profile and own loopback debugging connection. Serve a minimal local render page and an immutable captured snapshot from an ephemeral loopback server with an exact route allowlist. Use the existing rendering entrypoint and its internal asset. Bound startup, capture, protocol messages, pixel dimensions, and process cleanup on success, failure, and interrupt. Keep the browser sandbox enabled. Explain a missing browser with an actionable error. The painter uses only `paint view`; browser management is internal to the tool.

Capture public contract: `capture(snapshot, { output, crop, scale = 1, committed = false, browser, timeoutMs = 15000 })` returns `{ path, mimeType: 'image/png', width, height, instanceId, revision }`. `crop` is null or `{x,y,width,height}` in canvas coordinates. Output is optional; write atomically. The caller adds playback metadata. The implementation must handle both full state and valid committed document data only through this contract.

## Delivery and verification

The lead owns this contract and review. Separate agy workers implement CLI commands and capture with their respective tests. Astra high provides an independent capture review through Herdr. The active painter owns only its artwork. Workers preserve each other's files and do not commit.

Verify offline help, direct strokes and shapes, stdin batches, errors with unchanged history, legacy JSON snapshots, pause preservation, feedback, bounded waits, missing-browser failure, real PNG dimensions/cropped pixels, visible/hidden layers and erasure, and capture cleanup. Run against isolated ephemeral studio instances. Native tests remain dependency-free; real-browser capture checks use the installed browser directly. Run the full existing verification suite and browser workflows after integration. Do not use the live painting as a mutation fixture.

Risks are installed-browser availability, subprocess cleanup, snapshot consistency, and automation compatibility when status becomes compact. Explicit browser configuration, bounded owned resources, one-snapshot capture, and `--json` address these risks. Existing consumers that parse full default status must opt into `--json`; inspect the active painter before switching its executable.
