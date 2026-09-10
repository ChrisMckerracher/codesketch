# Codesketch UI: Creative Hierarchy, Behavioral Journeys & Design Intentions

**Author**: Lead Creative Designer  
**Workspace**: `/private/tmp/codesketch-gemini38-ui-20260910`  
**Reference Document**: `capabilities.md` (paint-at5.9 UI reset)  
**Status**: Authoritative Creative Deliverable & Product Hierarchy Specification

---

## 1. Executive Creative Vision & Benchmark Analysis

### 1.1 The Figma Benchmark: Intent, Context, and Restraint
Figma is the benchmark for digital creative software because it enforces strict contextual discipline:
1. **Atomic Intent-First Tools**: Tools represent atomic human intentions (Select, Draw, Shape, Comment). Clicking a tool establishes user intent and reconfigures the environment for that specific verb.
2. **Selection Dictates Property Scope**: The inspector never presents every conceivable parameter simultaneously. When nothing is selected, the inspector presents canvas and document properties. When a drawing tool is selected, it presents tool-specific parameters. When a layer is selected, it presents layer properties.
3. **The Canvas as Sacred Center**: All surrounding chrome is subservient to the artwork. Surfaces use deep, neutral tones to reduce eye fatigue and maximize artwork contrast. Chrome borders are whisper-quiet (1px subtle contrast), avoiding heavy shadows or intrusive ornamentation.
4. **Spatial Collaboration**: Collaboration is not a disconnected sidebar; it is directly mapped to canvas coordinates, spatial feedback regions, and pinned discussion.

### 1.2 Codesketch's Dual Identity: Local Instrument for Humans & Agents
Codesketch is a local painting instrument for humans and autonomous agents:
- The human paints with immediate gestural feedback on a bounded 1000 × 700 px canvas.
- The agent paints progressively, submitting validated batches of discrete painting commands.
- The human observes progressive painting, exercises an authoritative pause, inspects intermediate states, steps through commands, and pins spatial feedback with a clear lifecycle (`Agent listening` → `Acknowledged` → `Addressing` → `Resolved` / `Reopened`).
- Every user interface element bridges human creative craft and agent co-direction without visual clutter or ambiguity.

---

## 2. Core User Stories & Behavioral Journeys

### 2.1 The Paintbrush Story: From Intent to Stroke & The Layer-Return Path
The complete cognitive and physical story of selecting a brush, adjusting properties, painting on a layer, inspecting layers, and returning to painting:

```
+---------------------------------------------------------------------------------------------------------+
| 1. INTENT             2. TOOL SELECTION      3. CONTEXTUAL PROPERTIES    4. GESTURE & COMMIT            |
| Human decides to      Clicks Paintbrush (B)  Inspector morphs to Brush;  Cursor shows brush ring;       |
| paint blue shading.   in dock; lights up.    Size (24px), Opacity (85%), Drag paints to Layer 2;        |
|                       Focus moves to stage.  Color (#1E40AF) confirmed.  Stroke saved to session.       |
+---------------------------------------------------------------------------------------------------------+
                                                  │
                                                  ▼ (User clicks Layer in left panel)
+---------------------------------------------------------------------------------------------------------+
| 5. LAYER INSPECTION                          6. EXPLICIT RETURN PATH TO BRUSH PROPERTIES                |
| Left panel: User clicks 'Layer 2 - Ink'.     Inspector shows '← Return to Brush Properties (B)' pill;   |
| Right inspector shifts to Layer Properties   Clicking the pill, pressing 'B', or clicking canvas        |
| (Name, Visibility, Opacity slider).          instantly restores Brush Properties with Layer 2 active!   |
+---------------------------------------------------------------------------------------------------------+
```

#### Step 1: Intent & Eye Path
The artist evaluates their composition on the 1000 × 700 canvas. They need an ultramarine brush stroke with 24px width and 85% opacity to add shadow depth to their architectural line drawing.

#### Step 2: Tool Selection
- **Action**: The artist clicks the Paintbrush button in the Primary Tool Dock (or taps hotkey `B`).
- **Sensory Feedback**:
  - The Paintbrush button transitions to an active high-contrast accent state (`#3B82F6` container, white icon).
  - An accessible tooltip announces: `Paintbrush (B)`.
  - Keyboard focus remains on the canvas stage, avoiding focus-trapping inside the toolbar.

#### Step 3: Contextual Property Disclosure (Zero Hunting)
- The Right Contextual Inspector immediately shifts to **Brush Properties**.
- It displays only what is relevant to painting with the brush:
  1. **Stroke Size**: Numeric input `[ 24 ] px` with drag-scrub slider (1 to 128 px) and scannable preset pills (`[2] [8] [16] [24] [48]`).
  2. **Stroke Opacity**: Percentage field `[ 85% ]` with linear slider (0% to 100%).
  3. **Color & Palette**: Large active color chip (`#1E40AF`), hex input field (`#1E40AF`), and document swatches palette.
  4. **Target Layer Status**: Status card displaying `Painting onto: Layer 2 — Ink Lines (Active)` with a button to inspect layer properties.

#### Step 4: Canvas Feedback & Painting Gesture
- **Cursor Transformation**: The canvas cursor becomes a dynamic brush footprint ring matching the exact 24px brush diameter in canvas coordinates, with contrasting dual-tone outline visible over any background.
- **Direct Manipulation**: The artist drags across the 1000 × 700 canvas. The stroke renders in real-time.
- **Commit & History**: On release, the stroke commits to Layer 2. The header status updates (`Saved locally`), and `Undo (Cmd+Z)` becomes active.

#### Step 5 & 6: Inspecting Layers & The Seamless Path Back to Brush Properties
- **The Journey**: The artist wants to check whether Layer 1 (Background Wash) or Layer 2 (Ink Lines) has the correct opacity.
- They click `Layer 2 — Ink Lines` in the Left Layers panel.
- **Inspector Behavior**: The Right Inspector adapts to **Layer Properties**:
  - Displays: Layer Name input, Layer Visibility toggle, Layer Opacity slider (85%), and compositing order.
- **The Explicit Return Path**:
  - At the very top of the inspector, a prominent navigation pill is displayed:  
    `← Return to Brush Properties (B)`
  - The artist can return to their brush in three effortless ways:
    1. Click the `← Return to Brush Properties (B)` button in the inspector header.
    2. Tap keyboard shortcut `B`.
    3. Click anywhere on the 1000 × 700 canvas stage.
  - Returning immediately switches the inspector back to **Brush Properties**, while keeping `Layer 2` selected as the active target layer.

---

### 2.2 The Agent Observation & Review Story: Co-Creation, Authoritative Pause & Feedback
How an artist observes an autonomous agent painting, halts execution authoritatively, pins visual feedback, and tracks resolution:

```
+---------------------------------------------------------------------------------------------------------+
| 1. AGENT PROGRESSIVE PAINTING          2. AUTHORITATIVE HUMAN PAUSE                                     |
| Agent paints batch of commands;        Human spots skewed archway; taps Space or clicks Pause.          |
| strokes appear live;                   Playback halts immediately; HUD displays 'Paused by Human'.      |
| HUD shows progress '34 / 85'.          Execution remains stopped until continuation is authorized.      |
+---------------------------------------------------------------------------------------------------------+
                                                  │
                                                  ▼
+---------------------------------------------------------------------------------------------------------+
| 3. SPATIAL REGION FEEDBACK             4. HANDSHAKE & RESOLUTION TRACKING                               |
| Human presses 'C'; drags marquee over  Comment card displays real feedback; left panel tracks:          |
| archway (410, 220, 190 x 150).         'Agent listening' -> 'Acknowledged' -> 'Addressing' -> 'Resolved'|
| Floating composer card opens.          Continuation authorized by human when ready.                     |
+---------------------------------------------------------------------------------------------------------+
```

#### Step 1: Observing Progressive Painting
- An autonomous agent connects to the session and paints a batch of linework commands.
- The Agent Director HUD (anchored at top-center of the stage) activates:
  - Status beacon: Violet pulsating light + `Agent Painting (2.0x)`.
  - Progress counter: `Progress: 34 / 85`.
  - Visual progress bar displays percentage completed.
- Strokes appear progressively on the canvas in real-time.

#### Step 2: Authoritative Human Pause
- The human spots a perspective error on the center archway.
- The human taps `Space` or clicks the prominent Amber Pause button on the Director HUD.
- **Contract Fulfillment**: *Human pause remains authoritative until continuation is authorized.*
  - Execution freezes instantly. The pending commands remain buffered.
  - Director HUD updates to an unmistakable Amber badge: `⏸ Paused by Human`.
  - Continuation is blocked until the human explicitly clicks `Resume` or authorizes continuation.

#### Step 3: Single-Stepping & Inspection
- The human wants to inspect the next pending command.
- The human clicks the Step button (`]` or `Cmd+Right`). Exactly one pending command advances (`35 / 85`), confirming the defect.

#### Step 4: Leaving Spatial Region Feedback
- The human clicks the Comment tool in the primary dock (or taps `C`).
- Canvas enters feedback review mode:
  - The cursor transforms into a precision crosshair pin.
  - The human drags a rectangular marquee over the flawed archway (`x: 410, y: 220, w: 190, h: 150`).
  - A dashed violet marquee with corner handles locks over the visible artwork.
- A floating Comment Composer Card opens anchored to the region:
  - Header: `Feedback on Region — 410, 220 (190 × 150)`.
  - Message area with real copy:  
    `"The keystone here is skewed 5° left. Please align with the center column and repaint the hatching on Layer 2."`
  - Checkbox: `☑ Keep paused until continuation authorized`.
  - Action: Human clicks `Send to Agent` (`Cmd+Enter`).

#### Step 5: Handshake Lifecycle & Agent Addressing
- The feedback pin `#1` locks onto the canvas coordinates.
- The Left Sidebar displays the Feedback panel:
  - Feedback thread `#1` displays human attribution and timestamp.
  - Lifecycle states strictly follow `capabilities.md`:
    1. `Agent listening`: The interface reflects that the agent is actively listening for review feedback.
    2. `Acknowledged`: The agent acknowledges receipt of the feedback and region coordinates.
    3. `Addressing`: The agent begins submitting replacement commands to correct the artwork.
    4. `Resolved`: The correction is verified; either the human or the agent marks the thread as resolved.
    5. `Reopened`: If further adjustments are needed, the human reopens the thread.

---

## 3. Spatial and Information Hierarchy Model

Codesketch organizes all capabilities into five unified spatial zones:

```
+---------------------------------------------------------------------------------------------------------+
| ZONE 0: GLOBAL DOCUMENT HEADER (48px)                                                                   |
| [Logo] [Title: Cityscape Architecture.codesketch]   [Status: Saved locally]   [Undo/Redo] [100%] [Export]|
+-----------------------+---------------------------------------------------------+-----------------------+
| ZONE 1: LEFT SIDEBAR  | ZONE 2: CENTER STAGE - SACRED 1000 x 700 CANVAS          | ZONE 4: CONTEXTUAL    |
| (260px)               |                                                         | INSPECTOR (280px)     |
| [Layers | Feedback]   |   +-------------------------------------------------+   |                       |
|                       |   | ZONE 5: AGENT DIRECTOR HUD (Floating Top)       |   | [BRUSH PROPERTIES]    |
| - Layer 3 (Highlights)|   | [Agent Painting (2.0x)] [Progress 34/85] [Pause]|   | [<- Return to Brush]  |
| - Layer 2 (Ink Lines)*|   +-------------------------------------------------+   | Size: [ 24 ] px ===== |
| - Layer 1 (Background)|                                                         | Opacity: [ 85% ] ==== |
|                       |             [ 1000 x 700 CANVAS STAGE ]                 | Color: [#1E40AF]      |
| [Add Layer +]         |             (True 10:7 Aspect Ratio, Bounds)            | Painting onto Layer 2 |
|                       |                                                         |                       |
|                       |   +-------------------------------------------------+   | [LAYER PROPERTIES]    |
|                       |   | ZONE 3: PRIMARY TOOL DOCK (Floating Bottom)     |   | (When Layer Selected) |
|                       |   | [V] [H] | [B] [Shift+P] [M] [E] | [R] [O] | [C] |   | Opacity, Visibility   |
+-----------------------+---+-------------------------------------------------+---+-----------------------+
```

### Zone 0: Global Document Header (Top Bar, 48px)
- **Title & Document Scope**: Editable document title (`Cityscape Architecture.codesketch`), Document menu (`New Document`, `Load Example Composition`, `Save Project JSON`, `Load Project JSON`).
- **Persistence & Connection Health**: Live status indicator:
  - `● Saved locally` (emerald green dot).
  - `◌ Saving snapshot...` (pulsing amber dot).
  - `⚡ Session restored from local persistence` (amber notification badge).
  - `✕ Connection lost` or `✕ Sync conflict: Server instance retired` (crimson alert).
- **Global Actions**: `Undo (Cmd+Z)`, `Redo (Cmd+Shift+Z)`, `Zoom (100%)`, `Export PNG` (native capture with full canvas, crop, and scale options).

### Zone 1: Left Structure & Navigation Sidebar (260px)
- **Segmented Tabs**:
  - `Layers`: Displays layer stack ordered strictly top-to-bottom (compositing order). Each row includes visibility toggle (`eye`), layer name, opacity badge, and selection highlight. Bottom button: `+ Add Layer`.
  - `Feedback`: Lists whole-artwork and region feedback threads with author, timestamp, region bounds tag, message body, status badge (`Agent listening`, `Acknowledged`, `Addressing`, `Resolved`), and `Resolve` / `Reopen` toggle.

### Zone 2: The Center Stage (1000 × 700 Canvas Viewport)
- Deep neutral backdrop (`#0a0a0c`) providing high contrast.
- **Exact 1000 × 700 px Canvas**: Preserves true 10:7 aspect ratio without distortion.
- Crisp border and soft ambient elevation.
- Zero-lag vector overlay rendering the dynamic brush cursor circle, region selection marquee, and pinned feedback markers.

### Zone 3: Primary Tool Dock (Floating Bottom-Center, 42px)
- Ergonomic floating pill docked above viewport bottom, organized by verb:
  - **Navigation**: `Select (V)`, `Hand / Pan (H)`.
  - **Drawing Instruments**: `Paintbrush (B)`, `Pencil (Shift+P)`, `Marker (M)`, `Eraser (E)`.
  - **Geometric Shapes**: `Rectangle (R)`, `Ellipse (O)`.
  - **Feedback**: `Comment & Region Review (C)`.

### Zone 4: Right Contextual Property Inspector (280px)
- Adapts strictly to active tool or selection:
  - **When Brush/Pencil/Marker/Eraser active**: Displays tool name, size slider/input, opacity slider/input, color swatch + hex + swatches grid, target layer status card.
  - **When Layer selected in Left Panel**: Displays Layer Properties (Name, Visibility, Opacity slider) and the explicit `← Return to Brush Properties (B)` navigation pill.
  - **When Shape (Rect/Ellipse) active**: Displays shape dimensions, fill color, stroke color, stroke width, opacity, target layer.
  - **When Canvas default / Cold start**: Displays canvas dimensions (`1000 × 700 px`), canvas background color picker, example composition loader.

### Zone 5: Agent Director & Playback HUD (Floating Top-Center, 42px)
- Floats directly above the canvas for instant co-direction:
  - **Agent State Badge**: `Agent Idle`, `Agent Painting (speed)`, `Paused by Human`, `Agent listening`.
  - **Queue Progress**: `Progress: 34 / 85` with linear progress track.
  - **Playback Controls**: `Pause / Resume` toggle (`Space`), `Step` advance one command (`]`), `Speed` dropdown (`0.5x`, `1.0x`, `2.0x`, `5.0x`).
  - **Batch Queue Management**: `Clear Pending` (discard unexecuted work), `Finish All` (atomically render all pending work).

---

## 4. Capability Traceability Matrix

Every control and status in Codesketch traces directly to `capabilities.md`:

| UI Control / Status | Placement | Backing Retained Capability in capabilities.md |
|---|---|---|
| **1000 × 700 Canvas** | Center Stage | "Create a 1000 × 700 painting" |
| **Canvas Background Color** | Inspector (Canvas) | "change its background" |
| **Brush, Pencil, Marker, Eraser** | Tool Dock | "apply brush, pencil, marker, eraser... commands with color, size, and opacity" |
| **Rectangle, Ellipse Shapes** | Tool Dock | "rectangle, and ellipse commands with color, size, and opacity" |
| **Size & Opacity Inputs/Sliders** | Inspector (Tool) | "with color, size, and opacity" |
| **Layer Stack & Order** | Left Sidebar (Layers) | "Add and update named layers... Rendering preserves layer order, compositing" |
| **Layer Visibility & Opacity** | Left Sidebar / Inspector | "including visibility and opacity" |
| **Layer-Local Eraser** | Tool Dock (Eraser) | "layer-local erasure" |
| **Progressive Painting Render** | Canvas Stage | "Observe committed artwork and progressive painting" |
| **Command Batches & Pending Work** | Director HUD / Inspector | "Submit validated command batches, replace pending work" |
| **Pause & Resume Playback** | Director HUD (`Space`) | "pause, resume" |
| **Authoritative Human Pause** | Director HUD | "Human pause remains authoritative until continuation is authorized" |
| **Advance One Command (Step)** | Director HUD (`]`) | "advance one command" |
| **Playback Speed Selector** | Director HUD | "change speed" |
| **Clear & Atomically Finish Work** | Director HUD | "clear pending work, or atomically finish pending work" |
| **Undo & Redo** | Header Bar | "Undo and redo completed work" |
| **New Document** | Document Menu | "start a new document" |
| **Load Example Composition** | Document Menu / Empty State | "load the example composition" |
| **Whole-Artwork & Region Feedback** | Tool Dock (`C`) / Stage | "Leave whole-artwork or region feedback" |
| **Agent Listening Activity** | Feedback Thread Badge | "observe agent listening activity" |
| **Agent Acknowledged & Addressing** | Feedback Thread Badge | "track agent acknowledgement and addressing" |
| **Resolve & Reopen Feedback** | Feedback Thread Card | "resolve or reopen feedback" |
| **Save & Load Project JSON** | Document Menu | "Save and load editable project JSON" |
| **Session Persistence Recovery** | Header / Alert Banner | "recover local sessions through atomic persistence" |
| **Native PNG Capture (Scale/Crops)**| Header Bar (`Export PNG`) | "capture PNGs through the native CLI, including supported crops, scale..." |
| **Connection / Sync Failure Alert**| Header / Modal Dialog | "Observe connection, playback, persistence, and validation failures... rejects delayed revisions and retired server instances" |

---

## 5. Separation of Proposed UX Additions vs. Retained Capabilities

To protect implementation boundaries, all ergonomic user-experience enhancements are explicitly isolated below:

| Proposed UX Addition | Purpose & Value | Interaction Details |
|---|---|---|
| **Quick Brush Size Preset Pills (`2, 8, 16, 24, 48`)** | Ergonomic shortcut | Clicking a pill sets the retained `size` parameter without manual typing. |
| **Document Swatches Palette Bar** | Pigment reuse | Displays recent hex colors used in the current session for 1-click selection. |
| **Dynamic Brush Footprint Ring** | Visual preview | Renders an SVG ring on the canvas overlay showing the exact brush diameter before touch-down. |
| **Keyboard Shortcut Badges in Tooltips** | Discoverability | Shows hotkey hints (`B`, `Space`, `]`, `C`) on hover for zero-friction learning. |
| **Visual Queue Progress Fill Bar** | Temporal awareness | Renders a 4px fill track visually depicting pending command progress on the Director HUD. |
| **Layer-to-Brush Return Pill** | Navigation clarity | Renders `← Return to Brush Properties (B)` when a layer is inspected, preventing tool property trapping. |

---

## 6. Key Visual States Catalog

| State Key | State Name | Core Visual Attributes & Behavior |
|---|---|---|
| `state-brush` | **Default Paintbrush Active** | Paintbrush selected in dock; Right Inspector displays Brush Properties (Size: 24px, Opacity: 85%, Color: #1E40AF); Layer 2 active; Canvas displays dynamic brush ring preview; HUD indicates Agent Idle. |
| `state-agent` | **Agent Progressive Painting** | Agent Director HUD active with pulsating violet beacon; Progress bar at 34/85; Speed at 2.0x; Canvas renders progressive linework live; Select tool active. |
| `state-review` | **Authoritative Pause & Review** | Agent halted (Amber badge: `Paused by Human`); Comment tool active (`C`); Dashed region marquee over canvas (`410, 220, 190 × 150`); Floating feedback composer card open; Feedback panel displays `Agent listening...`. |
| `state-empty` | **New Document / Cold Start** | Pristine 1000 × 700 canvas; Inspector displays Document Canvas dimensions and background color; Layers panel has 1 empty layer; Empty state guide with `Load Example Composition` button. |
| `state-recovery` | **Editing Recovery & Server Alert**| Notification banner indicates session restored from local persistence; Non-blocking alert dialog handles retired server instance / delayed revision gracefully. |
| `state-compact` | **Compact Desktop (1024px)** | Sidebars collapse into compact icon rails; Center 1000 × 700 canvas maintains true proportions with responsive fit; Tool dock remains accessible. |
| `state-compact-open` | **Compact Revealed Properties & Layers** | 1024px compact layout with accessible slide-over drawers revealed: `#compact-layers-drawer` allows choosing named layers, while `#compact-inspector-drawer` allows editing brush size, opacity, and palette. |
| `state-light-desktop` | **Light Appearance Desktop** | Complete light theme with `#ffffff` cards/headers, `#f1f5f9` backdrop, `#e2e8f0` canvas frame, WCAG AAA text contrast (`#0f172a`), and pristine tool clarity. |

---

## 7. Visual Craft, Contrast & Keyboard Accessibility Standards

1. **Informative Text Contrast (WCAG AA/AAA)**:
   - Primary labels and headers: `#f4f4f6` on `#18181c` (contrast ratio > 14:1).
   - Secondary text and dimensions: `#9d9da6` / `#cbd5e1` (contrast ratio > 4.8:1).
   - Amber warning badges: `#fef3c7` on `#78350f` (contrast ratio > 8.5:1).
   - Violet status pills: `#d8b4fe` on `#4c1d95` (contrast ratio > 7.2:1).
2. **True Canvas Proportions**:
   - Canvas is fixed at **1000 × 700 px** (`10:7` aspect ratio).
   - Canvas container scales cleanly with responsive viewport transforms without distortion or clipping.
3. **Keyboard Focus & Navigation**:
   - All interactive controls feature high-visibility focus rings: `outline: 2px solid #3b82f6; outline-offset: 2px;`.
   - Single-key hotkeys: `B` (Brush), `P` (Pencil), `M` (Marker), `E` (Eraser), `R` (Rectangle), `O` (Ellipse), `C` (Comment), `Space` (Pause/Resume), `]` (Step), `Cmd+Z` (Undo), `Cmd+Shift+Z` (Redo).\n
