# Agent Integration Guide

Codesketch provides an automated drawing surface for external agents. Agents submit plain JSON drawing commands over HTTP or the CLI while a human observes strokes in real time, pauses execution, and leaves text feedback.

## System Model & Operational Limits

- **External Intelligence**: The studio contains no embedded LLM. Reasoning occurs in the external agent.
- **Canvas Dimensions**: Fixed 1000 × 700 document coordinate space (`(0, 0)` to `(1000, 700)`).
- **Default Layer**: Target layer defaults to `paint` when omitted from a command.
- **Validation & Simulation**: Incoming command batches are simulated completely before acceptance. Any invalid property rejects the entire batch atomically without mutating the document.
- **Local Persistence**: State persists to `.studio/session.json`. Committed history survives restarts; unexecuted queue items restore paused.
- **Project Budget & Serialization**: The server enforces a 7 MiB compact project budget across retained history, queue, and feedback, and an 8 MiB payload ceiling on JSON imports. Save projects with compact single-line serialization.
- **Instance Tracking & Polling**: The server generates a unique `instanceId` per server run and increments `revision`. Polling clients pass `?since=REVISION&instanceId=ID`; unchanged states return `{ unchanged: true }`. Lower revisions are rejected unless paired with a new `instanceId` (preventing stale updates across restarts).

### Architectural Limits

| Limit | Maximum | Description |
|---|---|---|
| Commands per session | 3,000 | Total committed marks plus queued commands |
| Points per stroke | 2,000 | Number of coordinate pairs in a single stroke |
| Total document points | 150,000 | Sum of all stroke points across history |
| Layers | 24 | Maximum concurrent artwork layers |
| Feedback notes | 100 | Maximum feedback entries (up to 2,000 chars each) |
| Playback speed | 0.25× to 8× | Supported animation playback rates |
| Project file size | 8 MiB | Hard ceiling for JSON import payload size |
| Project budget | 7 MiB | Enforced across compact history, queue, and feedback |

## Command Specifications

Commands are JSON objects with a `type` discriminator. Colors use six-digit hex (`#rrggbb`), opacity spans `0.0` to `1.0`, and size spans `1` to `100`.

- **`stroke`**: Continuous line across points.
  `{ "type": "stroke", "layer": "paint", "brush": "brush"|"pencil"|"marker"|"eraser", "color": "#2563eb", "size": 12, "opacity": 0.9, "points": [[120, 240], [180, 260]] }`
- **`rect`**: Filled rectangle.
  `{ "type": "rect", "layer": "paint", "x": 100, "y": 150, "width": 300, "height": 200, "color": "#16a34a", "opacity": 1.0 }`
- **`ellipse`**: Filled ellipse.
  `{ "type": "ellipse", "layer": "paint", "x": 450, "y": 80, "width": 120, "height": 120, "color": "#f59e0b", "opacity": 0.95 }`
- **`fill`**: Global canvas background color.
  `{ "type": "fill", "color": "#f8fafc" }`
- **`layer.add`**: Register a new artwork layer above existing layers.
  `{ "type": "layer.add", "id": "sky", "name": "Sky & Clouds" }`
- **`layer.update`**: Modify an existing layer's visibility, opacity, or name.
  `{ "type": "layer.update", "id": "sky", "visible": true, "opacity": 0.85, "name": "Sky Layer" }`

## Copy/Paste Command Batch Example

Save this array as a JSON file (e.g. `drawing.json`) to submit:

```json
[
  { "type": "fill", "color": "#f0f9ff" },
  { "type": "layer.add", "id": "backdrop", "name": "Backdrop" },
  { "type": "layer.add", "id": "details", "name": "Details" },
  { "type": "rect", "layer": "backdrop", "x": 0, "y": 480, "width": 1000, "height": 220, "color": "#15803d", "opacity": 1.0 },
  { "type": "ellipse", "layer": "backdrop", "x": 780, "y": 80, "width": 140, "height": 140, "color": "#facc15", "opacity": 0.9 },
  { "type": "stroke", "layer": "paint", "brush": "brush", "color": "#0284c7", "size": 24, "opacity": 0.8, "points": [[0, 520], [250, 540], [500, 510], [750, 550], [1000, 530]] },
  { "type": "stroke", "layer": "paint", "brush": "pencil", "color": "#0f172a", "size": 4, "opacity": 1.0, "points": [[150, 480], [220, 360], [290, 480]] },
  { "type": "stroke", "layer": "details", "brush": "marker", "color": "#dc2626", "size": 16, "opacity": 0.5, "points": [[220, 370], [260, 400], [240, 440]] },
  { "type": "stroke", "layer": "details", "brush": "eraser", "color": "#000000", "size": 10, "opacity": 1.0, "points": [[245, 410], [255, 410]] },
  { "type": "layer.update", "id": "backdrop", "opacity": 0.95 }
]
```

## Agent CLI Reference (`tools/paint.mjs`)

| Command | Arguments | Description |
|---|---|---|
| `help` | None | Print command summary. |
| `status` | None | Report playback state, queue size, cursor, and latest feedback. |
| `submit` | `FILE [--replace] [--paused]` | Load commands from JSON file. `--replace` clears pending queue; `--paused` disables auto-play. |
| `pause` / `resume` | None | Pause or resume command queue playback. |
| `step` / `clear` | None | Step one command or clear pending unexecuted commands. |
| `undo` / `redo` | None | Step backward or forward through committed mark history. |
| `feedback` | `TEXT` | Record feedback note and immediately pause execution. |
| `save` / `load` | `FILE` | Save or load project JSON document. |

## HTTP REST API

All endpoints run on `http://127.0.0.1:4317`:

### `GET /api/state`
Returns the full session snapshot. Supports conditional polling: `GET /api/state?since=REVISION&instanceId=ID`. Returns `{ "unchanged": true }` when state is unchanged.

```json
{
  "instanceId": "3f8a9e21",
  "revision": 22,
  "artRevision": 15,
  "document": {
    "version": 1,
    "width": 1000,
    "height": 700,
    "background": "#f7f3e8",
    "layers": [{ "id": "paint", "name": "Painting", "visible": true, "opacity": 1 }],
    "marks": []
  },
  "playback": {
    "status": "playing",
    "speed": 1,
    "remaining": 8,
    "active": {
      "command": { "type": "stroke", "layer": "paint", "points": [[10, 20], [30, 40]] },
      "progress": 0.45
    }
  },
  "history": { "cursor": 14, "total": 20 },
  "feedback": [
    { "id": "4a7c-uuid", "text": "Darken the hill contours", "at": "2026-09-09T14:00:00.000Z", "cursor": 12 }
  ],
  "storageError": null
}
```

### `GET /api/project`
Returns the project document with complete command history and serialized queue:
```json
{
  "format": "codesketch",
  "version": 1,
  "commands": [
    { "type": "fill", "color": "#f7f3e8" },
    { "type": "layer.add", "id": "land", "name": "Hills" }
  ],
  "cursor": 2,
  "queue": [
    { "type": "stroke", "layer": "land", "color": "#526f69", "points": [[0, 400], [200, 420]] }
  ],
  "feedback": [
    { "id": "4a7c-uuid", "text": "Darken the hill contours", "at": "2026-09-09T14:00:00.000Z", "cursor": 1 }
  ]
}
```

### `POST /api/commands`
Submits commands to the queue.
- `commands` (array): Array of valid drawing command objects.
- `replace` (boolean, default `false`): Discards unexecuted pending queue items while retaining committed history.
- `play` (boolean, default `true`): Requests playback if not already paused. Sticky pause requires explicit resume.

### `POST /api/control`
Sends playback action: `{ "action": "pause" | "resume" | "step" | "clear" | "undo" | "redo" | "new" | "speed", "speed"?: number }`.

### `POST /api/feedback`
Records feedback text and stickily pauses execution: `{ "text": "..." }`.

### `POST /api/project`
Replaces the active document with the supplied project payload (max 8 MiB).

## The Agent Paint Loop

External agents operate as iterative collaborators by following this loop:

1. **Check Status (`status`)**:
   Query `GET /api/state` or run `node tools/paint.mjs status`. Inspect `playback.status`, `playback.remaining`, `history.cursor`, `history.total`, and existing items in `feedback`.
2. **Submit Small Batch (`submit`)**:
   Post a discrete batch of commands (e.g. 5 to 20 commands) using `POST /api/commands` or `node tools/paint.mjs submit batch.json`. Small batches ensure responsiveness and human oversight.
3. **Inspect Progress (`inspect`)**:
   Poll `/api/state` to monitor `playback.remaining` decreasing and `history.cursor` advancing.
4. **Read Feedback (`read feedback`)**:
   When a human submits feedback, playback pauses stickily (`playback.status: "paused"`). Inspect the latest entry in `feedback`. The external agent reasons about the text.
5. **Replace Pending (`replace pending`)**:
   If instructions require altering planned work, submit revised commands with `replace: true` (or `--replace`). This cancels unrendered pending queue items while preserving already committed marks in `history`.
6. **Explicitly Resume (`resume`)**:
   Because pause is sticky, after incorporating feedback send `POST /api/control` with `{ "action": "resume" }` or run `node tools/paint.mjs resume` to restart playback.

## Security & Execution Model

- **Zero Dependencies**: Pure native JavaScript implementation.
- **Strict Loopback Trust**: Operates solely on `127.0.0.1`. Untrusted remote connections are refused.
- **Deterministic Replay**: Documents serialize clean mark histories without executing arbitrary code.
