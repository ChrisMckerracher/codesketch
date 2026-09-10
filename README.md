# Codesketch

Codesketch is a local painting instrument for humans and agents: progressive strokes on a 1000×700 canvas, layers, brushes, undo/redo, region or whole-canvas feedback, and a Finish All control for queued work. Human pauses remain authoritative. It saves editable project JSON and exports PNG.

Current formats and contracts are supported with no backward-compatibility adapters or migrations.

Public project: [https://github.com/ChrisMckerracher/codesketch](https://github.com/ChrisMckerracher/codesketch)

## Requirements

- **Build**: Go 1.25.7+
- **Runtime**: Node.js 22+
- **Platform**: macOS and Linux
- Zero shipped third-party dependencies and no `npm install` step.

## Quick Start

1. **Clone and Install**:
   ```bash
   git clone https://github.com/ChrisMckerracher/codesketch.git
   cd codesketch
   make install
   ```

2. **Ensure PATH**:
   Ensure `~/.local/bin` is on your `$PATH`:
   ```bash
   export PATH="$HOME/.local/bin:$PATH"
   ```

3. **Launch Studio**:
   ```bash
   paint
   ```
   Bare `paint` starts the studio and opens the default browser.

4. **Check Readiness (Optional)**:
   ```bash
   paint doctor
   ```

## Workflows

### Human Workflow
- **Canvas Interaction**: Progressive strokes on a 1000×700 canvas across layers with brushes, undo, and redo.
- **Authoritative Control**: Pause or resume playback at any time; human pauses remain authoritative. Use **Finish All** to fast-forward queued work.
- **Feedback & Storage**: Provide region or whole-canvas feedback. Save editable project JSON and export PNG.

### Agent Workflow
- **Getting Started**: Agents begin with `paint --artist-skill` and `paint guide`.
- **Feedback Loop**: Wait for or watch human comments with `paint comments wait` and `paint comments watch`.
- Detailed guides: [docs/agent-guide.md](docs/agent-guide.md) and [docs/artist-skill/SKILL.md](docs/artist-skill/SKILL.md).

## Development & Verification

- **In-Memory Studio**: `npm start` uses an ephemeral in-memory studio.
- **Verification**: Run `npm run verify` and `npm run test:browser` (see [docs/verification.md](docs/verification.md)).

## Source Folders

```
.
├── apps/
│   ├── paint/     # Go CLI application (`paint`)
│   └── studio/    # JavaScript studio interface (browser scenarios in tests/browser)
├── docs/          # Project documentation and guides
├── tests/         # Repository policy tests
└── tools/         # Developer tooling and scripts
```

See [docs/repo-map.md](docs/repo-map.md) for architectural navigation.

## Documentation

Detailed references: [Agent Guide](docs/agent-guide.md), [Artist Skill](docs/artist-skill/SKILL.md), [Repository Map](docs/repo-map.md), and [Verification Guide](docs/verification.md).

_README written by Gemini._
