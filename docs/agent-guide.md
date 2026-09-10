# Codesketch Agent Integration Guide

Codesketch is a local, dependency-free painting instrument designed for collaborative drawing between AI agents and human observers. The human watches strokes appear in real time on the canvas, pauses the painter at will, and leaves text feedback notes to guide the painting process.

This document is the complete guide for painting agents. You do not need to read the application source code to paint, observe, or respond to feedback.

Read `paint --artist-skill` for the complete paint-with-references workflow: inspect visual references, construct a pencil drawing, incorporate sketch feedback, and develop the approved painting. The offline bundle includes its reference-study and CLI craft/recovery notes. `paint guide --artist-skill` is equivalent, and both support `--json`.

---

## 1. System Model & Operating Limits

- **Canvas Dimensions**: The document is a fixed 1000 x 700 coordinate space ((0, 0) at top-left to (1000, 700) at bottom-right).
- **Default Layer**: The default artwork layer is named "paint". Additional layers stack back-to-front above previous layers.
- **Atomic Batch Validation**: Every mark or batch submitted is simulated against the document state before acceptance. If any coordinate, color, or property is invalid, the entire batch is rejected atomically without mutating the painting history or canvas.
- **Human Pause vs Agent Pause**:
  - When a human pauses execution or submits feedback, playback pauses stickily.
  - An agent pause (--paused) queues commands while leaving playback paused for staging.
  - Never present unconditional resume as the next step after every human pause. Only resume when the human direction has been incorporated and continuation is authorized.
- **Queue Replacement**: Replacing the queue (--replace) cancels unrendered pending work and any active partial stroke, while safely preserving all previously committed history marks.
- **Zero External Dependencies**: The studio and CLI require zero third-party packages. Headless Chromium capture is handled internally without Playwright.
- **Local Loopback Only**: The studio runs on a local HTTP loopback server (default http://127.0.0.1:4317). No external networks or credentials are used.

### Architectural Limits

| Limit | Boundary | Description |
|---|---|---|
| Commands per session | 3,000 | Total committed marks plus queued commands |
| Points per stroke | 2,000 | Maximum coordinate pairs in a single stroke |
| Total document points | 150,000 | Sum of all stroke points across document history |
| Concurrent layers | 24 | Maximum artwork layers |
| Feedback notes | 100 | Maximum stored feedback entries (up to 2,000 chars each) |
| Playback speed | 0.25x to 8x | Supported animation playback multipliers |
| Request body ceiling | 8 MiB | Maximum JSON payload size |
| Response stream ceiling | 16 MiB | Maximum state/feedback read size |
| Project budget | 7 MiB | Enforced serialization budget for projects |

---

## 2. Drawing Primitives & Renderer Mechanics

### Brushes (stroke)
Strokes follow a continuous path across coordinate pairs:
- brush (default): Five soft overlapping passes [1.18x, 1.0x, 0.82x, 0.64x, 0.46x size] rendered with round caps at opacity * 0.16. This creates a soft, expressive, buildable stroke.
- pencil: Fine, sharp line with round caps rendered at width max(1, size * 0.35) and opacity * 0.85. Perfect for sketching structural contours and hatching.
- marker: Translucent stroke with square line caps rendered at opacity * 0.45 using standard source-over compositing. Layering builds tonal density.
- eraser: Destination-out compositing (destination-out) that clears marks strictly on the target layer without touching other layers.

### Geometric Shapes (rect & ellipse)
- rect: Axis-aligned filled rectangle specified by x, y, width, height, color, and opacity.
- ellipse: Filled ellipse bounded within x, y, width, height, color, and opacity.

### Canvas Background (fill)
- fill: Fills the document background with a hex color (#rrggbb).

### Layers (layer)
- layer list: Lists all registered layers, their visibility, and opacity.
- layer add <id> <name>: Registers a new layer above existing layers. Layer IDs must start with a letter and contain up to 40 alphanumeric characters, hyphens, or underscores.
- layer update <id>: Adjusts layer --name, --opacity (0.0 to 1.0), or --visible true|false.

---

## 3. CLI Command Reference (paint)

Install the native Go executable with `make install`, then begin with `paint guide`. It includes this guide and its preview renderer and works from any directory. `paint doctor` checks studio and browser availability; `paint completion bash|zsh|fish` prints shell completion definitions. PNG capture supports macOS and Linux with an installed Chrome or Chromium browser.

### Observation Commands

#### status [--json]
Prints a compact summary of the session: instance ID, revision numbers, playback status, queued commands, cursor/total marks, layer count, and latest feedback note.
- Adding --json emits the full raw state snapshot from the server.

#### view [FILE] [--crop x,y,w,h] [--scale N] [--json]
Captures an immutable PNG snapshot of the live canvas, including any in-progress partial stroke.
- If FILE is omitted, saves to a temporary file in the OS temp directory.
- Reports output path, MIME type (image/png), dimensions, revision, instance ID, and playback state.
- Optional --crop x,y,w,h extracts a sub-region in canvas coordinates.
- Optional --scale N (e.g. 2) scales the output for inspecting fine detail.
- Agents should inspect the returned PNG path using their image-viewing tool (e.g. view_file) to observe canvas progress.

#### export FILE [--crop x,y,w,h] [--scale N] [--json]
Exports a clean PNG containing only committed artwork marks (committed: true). FILE is required.

#### wait [--timeout SECONDS] [--json]
Polls the studio and returns success promptly as soon as playback settles into idle or paused.
- Default timeout is 30 seconds (valid range: 0.001 to 3600 seconds).
- Bounded network calls ensure a hung connection never exceeds the remaining deadline.
- Prints state summary and all feedback notes.
- If the timeout expires while commands are still playing, exits nonzero with error WAIT_TIMEOUT.

#### watch [--timeout SECONDS] [--interval MILLISECONDS] [--json]
Streams playback and feedback changes. Emits an initial summary and subsequent updates whenever revision, playback, or feedback changes.
- Default timeout: 30 seconds; default interval: 400 milliseconds.
- With --json, emits compact events containing instance, revision, playback, history, and feedback metadata (excluding huge document marks arrays).
- Exits with status 0 upon normal timeout completion. Never auto-resumes playback.

---

### Drawing Commands

All drawing commands accept --paused, --replace, and --json:
- --paused: Queues the command without unpausing playback.
- --replace: Discards unexecuted pending commands in the queue before adding the new command.
- --json: Outputs the complete raw API response snapshot.

Mutation acknowledgements report the resulting playback state and remaining queued marks:
"Queued stroke (3 points on \"paint\") - playback: playing, 1 remaining (revision 4)"

#### stroke
paint stroke --points "120,240 180,260 220,300" --brush pencil --color "#253d38" --size 4 --opacity 1 --layer paint

#### rect
paint rect --x 0 --y 450 --width 1000 --height 250 --color "#1b4d3e" --opacity 1 --layer background

#### ellipse
paint ellipse --x 700 --y 80 --width 120 --height 120 --color "#f59e0b" --opacity 0.9 --layer sky

#### fill
paint fill "#f4efe6"

#### layer
paint layer list
paint layer add background "Backdrop Layer"
paint layer update background --opacity 0.85 --visible true

#### submit
Submits a batch from a JSON file or standard input (-). Input size is bounded (max 8 MiB) and timed out.
Example batch submitted via stdin:
cat << "BATCH" | paint submit -
[
  {"type":"fill","color":"#eef2f6"},
  {"type":"layer.add","id":"backdrop","name":"Backdrop"},
  {"type":"rect","layer":"backdrop","x":0,"y":300,"width":1000,"height":400,"color":"#15803d"},
  {"type":"stroke","layer":"paint","brush":"brush","size":12,"color":"#0284c7","points":[[100,200],[300,250],[600,220]]}
]
BATCH

---

### Session & Playback Commands

- pause: Pauses playback of queued commands.
- resume: Resumes playback if commands are queued.
- step: Advances and commits exactly one command from the queue, remaining paused.
- clear: Clears all pending unexecuted commands from the queue and pauses.
- undo: Undoes the last committed mark in history, moving the cursor back.
- redo: Redoes the previously undone mark.
- new: Clears the session to an empty document and resets history, queue, and feedback.
- speed NUMBER: Sets playback speed (between 0.25 and 8.0, e.g. paint speed 2).
- feedback [TEXT...]:
  - With text: Records a feedback note from the human and immediately pauses execution.
  - Without text: Lists all stored feedback notes.
- save FILE: Saves the full project JSON (document history, cursor, queue, feedback) to FILE.
- load FILE: Restores a previously saved project JSON document.

---

### Guidance Commands (Offline)

These commands execute offline without a running server:
- help [COMMAND] (or <command> --help): Prints command summary or detailed help for a specific command.
- guide: Prints the practical painting guide to stdout.

---

## 4. The Collaborative Agent Painting Workflow

External agents should structure their painting sessions into iterative cycles:

### Step 1: Initialize and inspect session
paint status

### Step 2: Establish layers and background
paint fill "#e8eff5"
paint layer add sky "Sky & Mountains"
paint layer add foliage "Midground Foliage"

### Step 3: Queue a batch of marks
Submit small, focused batches (5-20 marks) so the human observer can watch progress:
paint rect --x 0 --y 400 --width 1000 --height 300 --color "#355e3b" --layer foliage
paint stroke --points "200,400 250,320 300,400" --brush pencil --color "#1e3a1e" --size 5 --layer foliage

### Step 4: Wait for playback
paint wait --timeout 30

### Step 5: Visually inspect progress
Capture a snapshot of the artwork to observe the result:
paint view /tmp/progress.png
Open /tmp/progress.png with your image reader to evaluate color harmony, contrast, and layout.
To inspect fine details (e.g. a face or focal point at x=220, y=340):
paint view /tmp/focal_detail.png --crop 200,320,80,80 --scale 2

### Step 6: Review feedback and handle human pause
Check if the human paused the session or provided feedback:
paint feedback
If notes exist (e.g. "Darken the hill shadows and lighten the sky"):
1. Formulate corrected marks.
2. Submit them with --replace to overwrite obsolete planned work:
   paint submit revisions.json --replace
3. Resume a human pause only after the human resumes or explicitly authorizes continuation. Resume an agent-initiated pause when its planned work is ready:
   paint resume

### Step 7: Export final piece
When the artwork is complete:
paint export artwork.png
paint save artwork.json

---

## 5. Scripting & Error Handling

- Success: Commands exit with status code 0.
- Runtime failure: Errors are written to STDERR with exit code 1.
- Invalid invocation: Exit code 2.
- Interruption: Exit code 130.
- Structured JSON Errors: When --json is included in the command arguments, errors on STDERR are structured JSON objects:
  {"error": "WAIT_TIMEOUT", "message": "wait timed out after 5s before playback settled (WAIT_TIMEOUT)"}
- Loopback Safety: The CLI only connects to loopback addresses (127.0.0.1, localhost, ::1). Requests to non-loopback addresses are rejected immediately before any network transmission.
