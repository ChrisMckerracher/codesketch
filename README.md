# Codesketch

Codesketch is a local painting instrument for agents and humans. An external agent submits structured drawing commands while a human observes strokes appear in real time, pauses execution, modifies artwork directly, and provides feedback.

## Features

- **Observable Agent Painting**: Step-by-step rendering of strokes and vector shapes across a 1000 × 700 canvas.
- **Interactive Human Oversight**: Sticky pause on feedback submission, queue inspection, manual pointer drawing, and layer adjustments.
- **Robust Execution Pipeline**: Atomic batch validation, pending queue replacement, full undo/redo history, and paused session restoration.
- **Zero Dependencies**: Built with native ECMAScript modules, HTML5 Canvas, and Node.js built-in modules.
- **Dual Interfaces**: Complete browser studio workspace paired with an agent CLI and local HTTP REST API.

## Quick Start

### Prerequisites

- Node.js >= 22

### Starting the Studio

Start the local server:

```bash
npm start
```

The studio workspace is served at `http://127.0.0.1:4317`.

### Running Tests and Verification

Run native unit tests:

```bash
npm test
```

Run full validation (supply-chain policies, architectural boundaries, and unit tests):

```bash
npm run verify
```

Run browser end-to-end scenario (requires playwright-cli):

```bash
npm run test:browser
```

## Studio Workspace

The studio operates on a 1000 × 700 document coordinate space with multi-layer compositing.

### Browser UI Capabilities

- **Canvas Viewport**: 1000 × 700 display rendering per-layer marks and active stroke animations with startup welcome cue.
- **Manual Drawing**: Pointer-based painting using brush, pencil, marker, and eraser modes. Manual marks pause playback and commit directly to history.
- **Layer Management**: Create layers, toggle visibility, adjust opacity, and select active target layers with keyboard accessibility.
- **Queue Controls**: Pause, resume, step forward single commands, adjust playback speed (0.25× to 8×), and clear pending commands.
- **Human Direction**: Note field to send feedback that pauses painting stickily for external agent inspection.
- **History Navigation**: Step backward (undo) and forward (redo) through committed operations.
- **Import and Export**: Export visible layers and background to PNG, or save and load project documents as JSON (up to 8 MiB).

### Persistence and Recovery

Session state persists atomically to `.studio/session.json`. Committed history and feedback survive restarts, and queued commands restore in a paused state.

## Interfaces

### Agent CLI (`tools/paint.mjs`)

External agents and scripts drive the studio via `node tools/paint.mjs`:

```bash
node tools/paint.mjs help
node tools/paint.mjs status
node tools/paint.mjs submit FILE [--replace] [--paused]
node tools/paint.mjs pause
node tools/paint.mjs resume
node tools/paint.mjs step
node tools/paint.mjs clear
node tools/paint.mjs undo
node tools/paint.mjs redo
node tools/paint.mjs feedback TEXT
node tools/paint.mjs save FILE
node tools/paint.mjs load FILE
```

### HTTP REST API

The local server exposes the following endpoints at `http://127.0.0.1:4317`:

- `GET /api/state`: Returns nested session snapshot (`revision`, `artRevision`, `document`, `playback`, `history`, `feedback`, `storageError`).
- `GET /api/project`: Returns the complete project document (`commands`, `cursor`, `queue`, `feedback`).
- `POST /api/commands`: Appends or replaces commands (`{ "commands": [...], "replace": false, "play": true }`). Pauses are sticky and require explicit resume.
- `POST /api/control`: Executes queue controls (`{ "action": "pause" | "resume" | "step" | "clear" | "undo" | "redo" | "new" | "speed", "speed"?: number }`).
- `POST /api/feedback`: Submits feedback text and stickily pauses execution (`{ "text": "..." }`).
- `POST /api/project`: Loads a replacement project document (max 8 MiB).

See [docs/agent-guide.md](docs/agent-guide.md) for command specifications, JSON examples, architectural limits, and the agent interaction loop.

## Security and Local Trust

- **Zero Third-Party Dependencies**: No external package installs or external runtime dependencies.
- **Local Loopback Binding**: Network services bind strictly to `127.0.0.1`.
- **Local Process Trust**: API accepts commands from local processes without remote credentials; cross-origin browser requests are rejected.
- **No Embedded Remote Services**: No external generative services or embedded LLMs. Natural language reasoning is handled entirely by the external agent.
