export const HELP_TEXT = `paint - Codesketch agent CLI

Usage: node tools/paint.mjs <command> [args] [flags]

Observation commands:
  status [--json]                 Summary of session state, playback, cursor, and notes
  view [FILE] [--crop x,y,w,h] [--scale N] [--json]
                                  Capture canvas PNG (includes active stroke)
  export FILE [--crop x,y,w,h] [--scale N] [--json]
                                  Export full committed artwork PNG
  wait [--timeout SEC] [--json]   Wait promptly until playback is idle or paused
  watch [--timeout SEC] [--interval MS] [--json]
                                  Stream state and feedback changes

Drawing commands (support --paused, --replace, --json):
  stroke --points "x,y x,y..." [--brush B] [--color C] [--size S] [--opacity O] [--layer L]
                                  Draw continuous brush, pencil, marker, or eraser stroke
  rect --x X --y Y --width W --height H [--color C] [--opacity O] [--layer L]
                                  Draw filled rectangle
  ellipse --x X --y Y --width W --height H [--color C] [--opacity O] [--layer L]
                                  Draw filled ellipse
  fill COLOR                      Set document background color (#rrggbb)
  layer list [--json]             List registered layers
  layer add ID NAME               Add a new artwork layer
  layer update ID [--name N] [--opacity O] [--visible true|false]
                                  Update existing layer properties
  submit FILE|- [--replace] [--paused] [--json]
                                  Queue commands from JSON file or stdin ("-")

Session commands:
  pause | resume | step | clear | undo | redo | new
                                  Send playback control action
  speed NUMBER                    Set playback animation speed (0.25 to 8)
  feedback [TEXT...] [--json]     Record feedback note (pauses), or list notes if no text
  save FILE                       Save project JSON document
  load FILE [--json]              Load project JSON document

Guidance:
  help [COMMAND]                  Show command list or detailed command help
  guide                           Print complete practical painting workflow

Environment:
  PAINT_URL                       Base URL (default http://127.0.0.1:4317)
  PAINT_BROWSER                   Custom Chromium executable path for view/export`;

export const COMMAND_HELP = {
  status: `Usage: node tools/paint.mjs status [--json]
Prints compact summary of session state, playback status, marks count, and feedback.
Use --json to receive the complete raw state snapshot.`,

  view: `Usage: node tools/paint.mjs view [FILE] [--crop x,y,w,h] [--scale N] [--json]
Captures an immutable snapshot of the canvas to PNG including any active partial stroke.
Default output is a temporary PNG file. Reports path, MIME, dimensions, revision, and playback status.`,

  export: `Usage: node tools/paint.mjs export FILE [--crop x,y,w,h] [--scale N] [--json]
Exports a clean PNG of committed artwork marks (committed=true). FILE is required.`,

  wait: `Usage: node tools/paint.mjs wait [--timeout SECONDS] [--json]
Polls playback until it reaches "idle" or "paused". Returns promptly when settled.
Exits nonzero with WAIT_TIMEOUT if the timeout expires while still playing.`,

  watch: `Usage: node tools/paint.mjs watch [--timeout SECONDS] [--interval MILLISECONDS] [--json]
Emits initial state and subsequent revision/status/feedback changes.
Exits 0 after the timeout duration expires. Never auto-resumes playback.`,

  stroke: `Usage: node tools/paint.mjs stroke --points "x,y x,y..." [flags]
Flags:
  --points "10,20 30,40"   Coordinate pairs (required)
  --brush B                Brush: brush (default), pencil, marker, eraser
  --color '#rrggbb'        Hex color (default #253d38)
  --size N                 Stroke diameter 1..100 (default 8)
  --opacity N              Opacity 0..1 (default 1)
  --layer L                Target layer ID (default "paint")
  --paused                 Keep playback paused
  --replace                Replace unexecuted pending queue
  --json                   Output full raw API response`,

  rect: `Usage: node tools/paint.mjs rect --x X --y Y --width W --height H [flags]
Draws a filled rectangle on the target layer. Supports --color, --opacity, --layer, --paused, --replace, --json.`,

  ellipse: `Usage: node tools/paint.mjs ellipse --x X --y Y --width W --height H [flags]
Draws a filled ellipse on the target layer. Supports --color, --opacity, --layer, --paused, --replace, --json.`,

  fill: `Usage: node tools/paint.mjs fill COLOR [--paused] [--replace] [--json]
Sets canvas background fill color to #rrggbb.`,

  layer: `Usage:
  node tools/paint.mjs layer list [--json]
  node tools/paint.mjs layer add ID NAME [--paused] [--replace] [--json]
  node tools/paint.mjs layer update ID [--name N] [--opacity O] [--visible true|false] [--paused] [--replace] [--json]`,

  submit: `Usage: node tools/paint.mjs submit FILE|- [--replace] [--paused] [--json]
Submits a JSON array of commands or {commands: [...]} from a file or standard input ("-").
Enforces bounded input (max 8 MiB).`,

  pause: `Usage: node tools/paint.mjs pause [--json]
Pauses command queue playback.`,

  resume: `Usage: node tools/paint.mjs resume [--json]
Resumes command queue playback if commands are pending.`,

  step: `Usage: node tools/paint.mjs step [--json]
Commits exactly one pending command from the queue and leaves playback paused.`,

  clear: `Usage: node tools/paint.mjs clear [--json]
Clears all unexecuted pending commands from the queue and pauses playback.`,

  undo: `Usage: node tools/paint.mjs undo [--json]
Steps back one committed mark in history, clearing pending queue.`,

  redo: `Usage: node tools/paint.mjs redo [--json]
Steps forward one committed mark in history, clearing pending queue.`,

  new: `Usage: node tools/paint.mjs new [--json]
Creates a fresh session, clearing document marks, history, queue, and feedback.`,

  speed: `Usage: node tools/paint.mjs speed NUMBER [--json]
Sets playback animation multiplier (between 0.25 and 8).`,

  feedback: `Usage: node tools/paint.mjs feedback [TEXT...] [--json]
If TEXT is provided, records feedback and stickily pauses playback.
If no TEXT is provided, lists existing feedback notes.`,

  save: `Usage: node tools/paint.mjs save FILE
Saves project JSON containing complete history, queue, and feedback.`,

  load: `Usage: node tools/paint.mjs load FILE [--json]
Loads project JSON document into the studio.`,

  guide: `Usage: node tools/paint.mjs guide
Prints the comprehensive agent painting guide, coordinate system, limits, and workflow.`,

  help: `Usage: node tools/paint.mjs help [COMMAND]
Shows top-level help or specific command documentation.`,
};

export const GUIDE_TEXT = `# Codesketch Agent Painting Guide

## 1. System Model & Coordinates
- Fixed canvas: 1000 × 700 coordinate space (top-left (0,0) to bottom-right (1000,700)).
- External agent paints via loopback HTTP API / CLI. A human watches playback live in the browser.
- Default layer is "paint". Custom layers stack back-to-front.
- Batches are validated before acceptance; any invalid parameter atomically rejects the whole batch.
- Zero dependencies and no Playwright required; headless Chromium is managed internally.

## 2. Drawing Primitives & Actual Renderer Mechanics
- stroke: Continuous path through coordinate pairs:
    * brush (default): Five soft overlapping passes [1.18x, 1x, 0.82x, 0.64x, 0.46x width] at opacity * 0.16 with round caps.
    * pencil: Fine line at width max(1, size * 0.35) and opacity * 0.85 with round caps.
    * marker: Semi-transparent stroke at opacity * 0.45 with square line caps using standard source-over compositing.
    * eraser: Uses destination-out compositing to clear marks strictly on the target layer.
- rect & ellipse: Filled geometry with x, y, width, height, color (#rrggbb), opacity (0..1).
- fill: Global document background color (#rrggbb).
- layer: "layer add <id> <name>" registers a new layer. "layer update <id>" alters visibility/opacity.

## 3. Limits & Budgets
- Commands per session: 3,000 total marks + queue
- Points per stroke: 2,000 coordinate pairs
- Total document points: 150,000 points across all strokes
- Layers: 24 maximum concurrent layers
- Feedback entries: 100 notes maximum (up to 2,000 characters each)
- Payloads: 8 MiB maximum import size, 7 MiB project serialization budget

## 4. Collaborative Observation & Feedback Loop
1. Check state:
   node tools/paint.mjs status
2. Submit batch from file or stdin:
   cat << 'EOF' | node tools/paint.mjs submit -
   [
     {"type":"fill","color":"#eef2f6"},
     {"type":"layer.add","id":"sky","name":"Sky"},
     {"type":"rect","layer":"sky","x":0,"y":0,"width":1000,"height":400,"color":"#93c5fd","opacity":1},
     {"type":"stroke","layer":"paint","brush":"pencil","points":[[100,500],[300,450],[500,520]],"size":4,"color":"#1e293b"}
   ]
   EOF
3. Wait for playback queue to settle:
   node tools/paint.mjs wait --timeout 30
4. Inspect rendered image:
   node tools/paint.mjs view /tmp/view.png
   Open the returned PNG using your agent image-viewing capability (e.g. view_file) to inspect colors and compositing.
   To inspect fine details:
   node tools/paint.mjs view /tmp/detail.png --crop 250,420,100,100 --scale 2
5. Handling human pauses vs agent pauses:
   - When a human pauses or submits feedback, playback pauses stickily.
   - Run "node tools/paint.mjs feedback" to read all notes.
   - Do NOT unconditionally resume. Incorporate the human's direction first.
   - If the human explicitly paused to inspect or requested changes, submit revisions with --replace:
     node tools/paint.mjs submit revised.json --replace
   - Resume a human pause only after the human resumes or explicitly authorizes continuation. Resume an agent-initiated pause when its planned work is ready:
     node tools/paint.mjs resume
6. Export final committed artwork:
   node tools/paint.mjs export final.png`;
