# Codesketch

A local painting studio with a native Go CLI. Agents draw through structured commands while a human watches the strokes appear, pauses playback, paints directly, and leaves feedback.

## Start the studio

The studio uses Node.js 22 or newer and browser Canvas. The native CLI builds with Go 1.25.7 or newer and uses an installed Chrome or Chromium for PNG capture on macOS and Linux. All application code uses standard libraries and browser APIs, with zero third-party packages.

```sh
npm start
```

Open <http://127.0.0.1:4317/>. The studio persists its session in `.studio/session.json` and restores queued work paused.

## Install paint

```sh
make install
paint guide
paint doctor
```

The default install directory is `~/.local/bin`; include it on your PATH. Use `make build` to create `bin/paint`. Builds use the installed Go toolchain with module networking and automatic toolchain downloads disabled. The compiled executable includes its guidance and renderer assets and works from any directory.

```sh
paint status
paint stroke --points "120,240 180,260 220,230" --brush pencil --size 4 --color '#253d38'
paint view
paint view detail.png --crop 100,200,200,150 --scale 2
paint feedback "Make the outline darker"
paint export painting.png
paint save painting.json
```

`view` writes an actual PNG and prints its absolute path for the agent's image reader. The CLI manages its temporary browser internally. `PAINT_BROWSER` selects a Chromium executable; `PAINT_URL` selects the loopback studio endpoint.

## Commands

| Purpose | Commands |
| --- | --- |
| Learn and diagnose | `help`, `help COMMAND`, `guide`, `version`, `doctor` |
| Draw | `stroke`, `rect`, `ellipse`, `fill`, `submit FILE` or `submit -` |
| Manage layers | `layer list`, `layer add`, `layer update` |
| Observe | `status`, `view`, `wait`, `watch` |
| Control playback | `pause`, `resume`, `step`, `speed`, `clear` |
| Manage session | `new`, `undo`, `redo`, `feedback`, `save`, `load`, `export` |
| Shell completion | `completion bash`, `completion zsh`, `completion fish` |

`new` clears the canvas, history, queue and feedback. `clear` discards pending strokes and pauses playback. Human pauses remain in place until continuation is authorized. Use `--json` for machine-readable status, mutation responses, diagnostics and errors; `watch --json` emits newline-delimited events.

The canvas uses 1000 × 700 logical coordinates. Strokes support brush, pencil, marker and eraser; layers have independent visibility and opacity. Batches validate atomically. The session supports 3,000 commands, 24 layers, 2,000 points per stroke and 150,000 total points. See [the agent guide](docs/agent-guide.md) for full syntax, brush behavior and the drawing loop.

The existing `node tools/paint.mjs` entrypoint remains available for scripts during migration. Both clients use the same studio API and project format.

## Verification

```sh
npm run verify
make verify-go
PAINT_BROWSER_TESTS=1 make test-go
PAINT_STUDIO_TESTS=1 PAINT_BROWSER_TESTS=1 make test-go
npm run test:browser
```

Verification covers architecture, source size, dependency inventory, command behavior and resource limits. Native Go tests exercise parsing, local transport, cancellation and PNG capture. Optional browser cases use the installed browser and isolated data. Studio end-to-end checks use the installed Playwright CLI. See [release evidence](docs/verification.md) for the checks actually run.

## Local API and trust

The local API exposes `/api/state`, `/api/project`, `/api/commands`, `/api/control` and `/api/feedback`. Drawing is declarative JSON data. State snapshots include document, playback, history, feedback, instance and revision. Projects contain the command history, cursor, pending queue and feedback.

The studio binds to loopback and rejects cross-origin browser requests. The CLI restricts endpoints to loopback and bounds input, responses and captures. PNG capture uses an owned browser profile with the browser sandbox enabled. Artwork and generated outputs stay in ignored local directories. The application is intended for a trusted local machine.
