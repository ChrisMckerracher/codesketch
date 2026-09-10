# Codesketch

Codesketch is a local, dependency-free painting instrument for collaborative drawing between humans and autonomous agents. Observers and agents watch native strokes render progressively on a fixed 1000 × 700 canvas with compact desktop controls.

Humans can pause playback, select canvas regions or the whole canvas for comments, and trigger Skip to end to finish queued work immediately while preserving individual undo entries. A human pause stays paused until continuation is authorized.

## Quick Start

Codesketch runs on macOS and Linux. Building the CLI requires Go 1.25.7 (declared in `go.mod`), and running the studio requires Node.js 22+. The project ships zero third-party packages and requires no `npm install`.

```sh
# Build bin/paint and install the native CLI to ~/.local/bin (ensure it is on your PATH)
make install

# Start the managed studio and open the default browser at http://127.0.0.1:4317
paint

# Optional readiness check: reports studio reachability and browser capture support
paint doctor
```

The compiled `paint` binary embeds verified studio assets (`apps/studio/assets.go`) and runs from any directory outside the checkout repository. Node.js 22+ remains required on the host system to execute the embedded runtime. Durable document data and runtime extraction caches follow standard operating system locations:

- **Durable data** (`os.UserConfigDir()/codesketch`):
  - macOS: `~/Library/Application Support/codesketch`
  - Linux: `~/.config/codesketch` (or `$XDG_CONFIG_HOME/codesketch`)
- **Runtime cache** (`os.UserCacheDir()/codesketch`):
  - macOS: `~/Library/Caches/codesketch`
  - Linux: `~/.cache/codesketch` (or `$XDG_CACHE_HOME/codesketch`)

## Studio Management

The native CLI manages the background studio process and its lifecycle through `paint studio`:

```sh
paint studio start [--data-dir DIR] [--cache-dir DIR] [--port N] [--node PATH] [--no-open] [--json]
paint studio restart [--data-dir DIR] [--cache-dir DIR] [--port N] [--node PATH] [--no-open] [--json]
paint studio status [--data-dir DIR] [--json]
paint studio stop [--data-dir DIR] [--json]
```

- Bare `paint` defaults to `paint studio start` and opens the studio at production port 4317. Pass `--no-open` for headless operation, or `--port 0` to select an ephemeral loopback port.
- `start` and `restart` accept `--data-dir`, `--cache-dir`, `--node`, `--port`, and `--no-open`.
- `status` and `stop` operate on the existing runtime and accept only `--data-dir` (plus `--json` and `--help`); startup-only configuration flags are rejected.
- **`paint status` vs `paint studio status`**:
  - `paint status`: Summarizes artwork session state (document revision, playback speed, queue depth, active stroke progress, layer counts, and comments); `--json` emits the full state snapshot.
  - `paint studio status`: Reports managed OS process health, including URL, instance ID, PID, and lifecycle state (`running`, `stopping`, or `stopped`).

## Agent Workflow

Painting agents inspect references, stage marks, and respond to human direction using the native CLI:

1. **Guidance and skills**: Run `paint --artist-skill` (or `paint guide --artist-skill`) for the complete reference-driven drawing workflow (study, pencil construction, critique, and painting development). Run `paint guide` for CLI commands, limits, and renderer mechanics.
2. **Context and polling**: Read session state with `paint status --json` or `paint comments list` to obtain paired `--generation STRING` and `--epoch N` values. Poll human feedback with `paint comments wait` or `paint comments watch [--json]`.
3. **Pauses and grants**: Human pauses and comments pause playback stickily and increment the control epoch. Resuming requires human authorization. When `requiresGrant` is true, executing commands require `--grant TOKEN`. Staging commands with `--paused` queues work safely without executing.
4. **Drawing and skipping**: Submit marks with `stroke`, `rect`, `ellipse`, `fill`, or batch `submit FILE`. Batches validate atomically before queued work changes. Run `paint finish --generation STRING --epoch N [--grant TOKEN]` to execute Skip to end programmatically.
5. **Visual inspection and export**:
   - `paint view [FILE] [--crop x,y,w,h] [--scale N]`: Captures an immutable PNG snapshot of the live canvas (including in-progress partial strokes) and prints its path for the agent's image reader.
   - `paint export FILE [--crop x,y,w,h] [--scale N]`: Renders committed artwork to an immutable PNG file.
   - Both `view` and `export` require an installed Google Chrome or Chromium executable (configured via `PAINT_BROWSER` or discovered on PATH).
6. **Save vs Export**: `paint save FILE` writes editable project JSON (`v2` format with history, cursor, queue, and comments) to restore later via `paint load FILE`. Partial stroke progress is omitted from project saves (retained across managed stop/restart recovery). `paint export FILE` produces a flattened PNG image.

## Development

Local development uses an ephemeral in-memory studio without touching production data or port 4317:

```sh
# Start ephemeral in-memory studio on port 0 (PORT=4317 is rejected)
npm start

# Run on a custom development port
PORT=5000 npm start
```

Run test suites and verification checks before submitting changes:

```sh
# Verify JS style/dependencies, run Node tests, and check Go policies
npm run verify

# Go static analysis and race detector tests
make verify-go

# Integration tests with isolated studio and browser runs
PAINT_STUDIO_TESTS=1 PAINT_BROWSER_TESTS=1 make test-go

# Studio browser checks with Playwright CLI
npm run test:browser
```

Codesketch enforces current-only contracts: obsolete file formats, API structures, adapters, and compatibility fallbacks are rejected without migration.

## Documentation & Standards

- [Agent Integration Guide](docs/agent-guide.md): Complete CLI reference, coordinate limits, and brush mechanics.
- [Artist Skill](docs/artist-skill/SKILL.md): Visual reference workflow and painting craft notes.
- [Repository Map](docs/repo-map.md): Source contexts, entrypoints, and test layout.
- [Studio Architecture Plan](docs/plans/architect/studio.md): Core design contracts and bounded contexts.
- [Managed Studio Lifecycle Plan](docs/plans/architect/managed-lifecycle.md): Process management, locks, and discovery.
- [Architecture Standard](docs/standards/architecture.md): Context boundaries and supply-chain rules.
- [Interface Standard](docs/standards/interface.md): Mac application visual guidelines and conventions.
- [Security Standard](docs/standards/security.md): Local trust boundaries and browser sandboxing.
- [Testing Standard](docs/standards/testing.md): Production protection rules, test tiers, and isolated verification suites.
- [Release Verification Evidence](docs/verification.md): Verification records and release evidence.
