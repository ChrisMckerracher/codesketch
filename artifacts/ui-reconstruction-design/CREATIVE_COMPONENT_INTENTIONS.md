# Codesketch UI: Creative Component Intentions & Design Decisions

**Author**: Lead Creative Designer  
**Workspace**: `/private/tmp/codesketch-gemini38-ui-20260910`  
**Target Roles**: Software Architect & Junior Implementation Workers  
**Reference Document**: `capabilities.md` (paint-at5.9 UI reset)  
**Status**: Authoritative Creative Deliverable & Product Hierarchy Specification

---

## 1. Overview & Scope Boundary
This document defines **authoritative creative component intentions, visual states, layout contracts, light-appearance styling, and compact reveal interactions**. Technical bindings and network protocols are supplied independently by the separate architecture reviewer. Every control, status label, and affordance specified herein traces strictly to the approved user capabilities in `capabilities.md`.

---

## 2. Component Intentions & Visual Anatomy

### 2.1 Global Document Header (`#global-header`)
- **Intent**: Surface document identity, live persistence health, history recovery, and global export actions without intruding on the artwork stage.
- **Visual Anatomy**:
  - `Brand Monogram`: Fixed 26 × 26 px geometric icon (`#3B82F6` to `#8B5CF6` gradient).
  - `Document Title Input`: Direct inline-editable text field displaying the project file name (`Cityscape Architecture.codesketch`). Focus ring on click; subtle hover state.
  - `Document Actions Dropdown`: Menu trigger for retained capabilities: `New Document`, `Load Example Composition`, `Save Project JSON`, `Load Project JSON`.
  - `Session Persistence Indicator`:
    - Normal: Emerald dot (`#10B981`) + `Saved locally`.
    - Active saving: Pulsing amber dot (`#F59E0B`) + `Saving snapshot...`.
    - Restored: Amber badge (`#D97706`) + `Session restored from local persistence`.
    - Sync / Connection failure: Crimson dot (`#EF4444`) + `Connection lost` or `Sync conflict: Server instance retired`.
  - `Global History`: `Undo` (`Cmd+Z`) and `Redo` (`Cmd+Shift+Z`) buttons with crisp vector icons; disabled states when stack is empty.
  - `Viewport Indicator`: Monospace badge displaying current stage zoom level (`100%`).
  - `Export Action`: High-visibility button (`Export PNG`) triggering native CLI capture options (full 1000 × 700 canvas, committed artwork crop, 1x / 2x / 4x scale).

### 2.2 Left Structure & Navigation Sidebar (`#left-sidebar`)
- **Intent**: Provide organized, non-distracting navigation between structural document layers and spatial feedback threads.
- **Segmented Header Tabs**:
  - `Layers Tab`: Direct switch to layer stack management.
  - `Feedback Tab`: Direct switch to review threads, with a count badge indicating open threads.
- **Layers Panel Anatomy**:
  - `Header`: Section label `Layer Stack` and `+ Add Layer` action.
  - `Layer Rows`: Ordered top-to-bottom matching rendering compositing order. Each row includes:
    - Visibility toggle button (`eye` icon: visible vs hidden).
    - Selection container: High-contrast accent fill when active (`rgba(59, 130, 246, 0.15)`).
    - Layer Name label: Inline double-click to rename.
    - Layer Opacity badge: Scannable percentage text (e.g. `100%`, `85%`).
- **Feedback Panel Anatomy**:
  - `Header`: Section label `Review Threads` and count of open vs resolved items.
  - `Thread Cards`:
    - Pin identifier badge (`#1`).
    - Author attribution (`Human Reviewer` or `Agent`).
    - Spatial tag: Coordinates badge (`Region: 410, 220 (190 × 150)`) or `Whole Artwork`.
    - Message body: Readable multi-line feedback copy.
    - Lifecycle status badge strictly tracing to `capabilities.md`:
      - `Agent listening`: Indicates the agent is actively observing feedback.
      - `Acknowledged`: Indicates the agent acknowledged the feedback.
      - `Addressing`: Indicates replacement work is being submitted.
      - `Resolved`: Indicates work is verified and resolved.
    - Action button: `Resolve` (for open threads) or `Reopen` (for resolved threads).

### 2.3 The Center Stage & Sacred Canvas (`#stage-viewport` & `#canvas-wrapper`)
- **Intent**: Showcase the artwork with complete visual fidelity, preserving true canvas proportions and offering zero-distraction focus.
- **Proportion Contract**:
  - The canvas dimensions are strictly **1000 × 700 px** (aspect ratio `10:7`, or `1.4286`).
  - The canvas stage is centered in an expansive neutral backdrop (`#0a0a0c` dark / `#e2e8f0` light).
  - Surrounding frame features a 1px boundary stroke and ambient drop shadow.
- **Vector Overlay Layer (`#stage-overlay`)**:
  - `Brush Footprint Indicator`: Real-time dual-stroke SVG ring (white outer, black inner) matching the exact active brush diameter in canvas coordinates.
  - `Region Selection Marquee`: Animated dashed violet bounding box (`#8B5CF6`) with 8 × 8 px corner handles and pin label `#1`.
  - `Pinned Markers`: SVG circular pins anchored to specified canvas coordinates.
- **Floating Feedback Composer Card (`#floating-feedback-card`)**:
  - Anchored dynamically adjacent to the selected canvas region.
  - Card header with region coordinates tag (`410, 220, 190 × 150`).
  - Form field: Multi-line text area for human review instructions.
  - Authoritative pause checkbox: `☑ Keep paused until continuation authorized`.
  - Actions: `Cancel` and `Send to Agent` (`Cmd+Enter`).

### 2.4 Primary Tool Dock (`#tool-dock`)
- **Intent**: Surface intent-first tool selection as a floating ergonomic dock centered at the bottom of the viewport.
- **Logical Grouping & Dividers**:
  - Group 1 (Navigation): `Select (V)`, `Hand / Pan (H)`.
  - *Subtle 1px divider*
  - Group 2 (Drawing Instruments): `Paintbrush (B)`, `Pencil (Shift+P)`, `Marker (M)`, `Eraser (E)` (layer-local erasure).
  - *Subtle 1px divider*
  - Group 3 (Geometric Shapes): `Rectangle (R)`, `Ellipse (O)`.
  - *Subtle 1px divider*
  - Group 4 (Feedback): `Comment & Region Review (C)`.
- **Active & Focus Feedback**:
  - Active tool receives solid Figma-blue fill (`#3B82F6`) and elevated shadow.
  - High-visibility keyboard focus rings.
  - Tooltips with hotkey badges on hover.

### 2.5 Right Contextual Property Inspector (`#right-inspector`)
- **Intent**: Surface only the parameters relevant to the active tool or selection, eliminating panel hunting.
- **Context A: Drawing Tool Active (Brush / Pencil / Marker / Eraser)**:
  - Header: Tool Title (`Brush Properties`) and subtitle `Contextual Tool Inspector`.
  - Stroke Dynamics Group:
    - Size slider + numeric input (`[ 24 ] px`, range 1–128).
    - Quick preset pills: `[2] [8] [16] [24] [48]`.
    - Opacity slider + percentage input (`[ 85% ]`, range 0–100%).
  - Color & Palette Group:
    - Large active color swatch chip (`#1E40AF`).
    - Hex input field (`#1E40AF`).
    - Document swatches palette bar.
  - Target Layer Card:
    - Displays `Painting onto: Layer 2 — Ink Lines`.
    - Action button `[Inspect]`.
- **Context B: Layer Selected in Left Panel (The Layer-to-Brush Return Path)**:
  - **Explicit Return Breadcrumb**: At the very top of the inspector, a prominent navigation pill is rendered:  
    `← Return to Brush Properties (B)`
  - Layer Identity: Layer name input field with inline rename support.
  - Layer Visibility: Toggle button (`Visible` / `Hidden`).
  - Layer Opacity: Direct scrub slider and percentage field (0% to 100%).
  - Compositing info: Preserves layer order and compositing.
  - **Return Mechanism**: Clicking `← Return to Brush Properties (B)`, pressing hotkey `B`, or clicking on the canvas stage instantly restores the Brush Properties view with the selected layer preserved as the active target!
- **Context C: Shape Tool Active (Rectangle / Ellipse)**:
  - Fill Color, Stroke Color, Stroke Width slider, Opacity slider, Target Layer.
- **Context D: Document / Cold Start**:
  - Dimensions (`1000 × 700 px`), Canvas Background Color picker, Example composition quick loader.

### 2.6 Floating Agent Director HUD (`#director-hud`)
- **Intent**: Provide immediate, authoritative oversight of autonomous agent progressive painting without occupying static sidebar space.
- **Visual Anatomy**:
  - `Agent State Pill`:
    - `Agent Idle`: Muted gray indicator.
    - `Agent Painting (2.0x)`: Pulsating violet beacon (`#8B5CF6`).
    - `Paused by Human`: High-contrast amber badge (`#F59E0B`).
    - `Agent listening`: Violet indicator (`#A855F7`).
  - `Queue Progress Track`: Monospace text (`Progress: 34 / 85`) with a 4px linear progress fill bar.
  - `Authoritative Pause Button`: High-contrast button (`⏸ Pause` when running; `▶ Resume` when paused).
  - `Step Button`: Single-command step button (`Step ❯`).
  - `Speed Selector`: Dropdown for `0.5x`, `1.0x`, `2.0x`, `5.0x`.
  - `Queue Actions`: `Clear Pending` and `Finish All`.

---

## 3. Concrete Design Decisions & Trade-off Rationale

1. **Rejection of Disjointed Panels**:
   - Capabilities are organized by human intent and contextual relevance rather than restoring legacy panel files.
   - Tools live in the tool dock; properties live in the contextual inspector; layers live in the structural left panel; playback lives on the stage.
2. **Authoritative Human Pause as a Primary Stage Phenomenon**:
   - The brief mandates that human pause is authoritative until continuation is authorized.
   - Rather than tucking pause into a secondary menu, it floats prominently over the canvas with an unmistakable Amber badge.
3. **The Two-Way Layer & Tool Bridge**:
   - In digital art creation, selecting a layer to inspect its opacity must never permanently trap the user in layer settings.
   - Providing an explicit `← Return to Brush Properties (B)` button alongside keyboard shortcut `B` and stage clicks gives artists three frictionless return paths.
4. **Stripping Internal Bookkeeping from User Chrome**:
   - Internal technical parameters (epochs, internal revisions, instance IDs) are replaced with human-readable status labels (`Saved locally`, `Session restored from local persistence`, `Sync conflict: Server instance retired`).
5. **Strict Adherence to Retained Logic**:
   - Every single visual element traces directly to `capabilities.md`.
   - Proposed ergonomic additions (preset pills, swatches bar, cursor ring) are explicitly documented and cleanly decoupled.

---

## 4. Light-Appearance Theme Specification

To provide an immaculate visual experience across diverse ambient lighting environments, Codesketch defines a complete **Light Appearance Theme**:

### 4.1 Surface & Elevation Palette (Light)
- `--cs-bg-root`: `#f1f5f9` (clean cool studio gray backdrop).
- `--cs-bg-header`: `#ffffff` (crisp matte white header).
- `--cs-bg-sidebar`: `#f8fafc` (very light slate sidebar).
- `--cs-bg-card`: `#ffffff` (solid white card with 1px border).
- `--cs-bg-card-hover`: `#f1f5f9` (subtle interactive hover).
- `--cs-bg-input`: `#f8fafc` (recessed input background with `#cbd5e1` border).
- `--cs-bg-dock`: `rgba(255, 255, 255, 0.94)` with `backdrop-filter: blur(14px)`.
- `--cs-bg-hud`: `rgba(255, 255, 255, 0.95)` with `backdrop-filter: blur(14px)`.
- `--cs-canvas-backdrop`: `#e2e8f0` (medium cool gray providing high separation around canvas).
- `--cs-canvas-paper`: `#ffffff` (pristine artboard surface).

### 4.2 Contrast & Text Standards (Light)
- `--cs-text-primary`: `#0f172a` (near-black slate, WCAG AAA contrast ratio > 15:1 against `#ffffff`).
- `--cs-text-secondary`: `#334155` (dark slate gray, WCAG AAA contrast ratio > 7:1).
- `--cs-text-muted`: `#64748b` (slate, WCAG AA contrast ratio > 4.5:1).
- `--cs-border-subtle`: `rgba(15, 23, 42, 0.08)` (subtle structural divider).
- `--cs-border-medium`: `rgba(15, 23, 42, 0.16)` (card outline).
- `--cs-border-strong`: `rgba(15, 23, 42, 0.28)` (focused control boundary).
- Active accents: Blue (`#2563eb`), Violet (`#7c3aed`), Amber (`#d97706`), Emerald (`#059669`).

---

## 5. Compact Layout & Accessible Reveal Interaction Contract

In compact viewports (e.g. 1024px tablet/desktop), horizontal screen real estate is limited. Rather than permanently hiding layer names or brush controls, Codesketch implements an **Accessible Flyout Reveal Model**:

```
+---------------------------------------------------------------------------------------------------------+
| COMPACT VIEWPORT (1024px): ACCESSIBLE REVEAL INTERACTION                                                |
|                                                                                                         |
| [Header: Cityscape Architecture.codesketch]              [Saved locally]              [100%] [Export]   |
+---+-------------------------------------------------------------------------------------------------+---+
| R |                                                                                                 | R |
| A |  [COMPACT LAYERS FLYOUT DRAWER]       [ 1000 x 700 CANVAS STAGE ]    [COMPACT BRUSH FLYOUT DRAWER| A |
| I |  +----------------------------+       (True 10:7 Proportions, Scaled  +--------------------------+| I |
| L |  | Layer Stack            [X] |        Centered in Viewport)          | Brush Properties     [X] || L |
|   |  |----------------------------|                                       |--------------------------||   |
| L |  | [o] Layer 3 - Highlights   |                                       | Size: [ 24 ] px =======  || P |
| a |  | [*] Layer 2 - Ink Lines *  |                                       | Pills: [2][8][16][24][48]|| r |
| y |  | [o] Layer 1 - Background   |                                       | Opacity: [ 85% ] ======  || o |
| e |  |----------------------------|                                       | Color: [#1E40AF] [Chip]  || p |
| r |  | [+ Add Layer]              |                                       | Target: Layer 2 - Ink    || s |
| s |  +----------------------------+                                       +--------------------------+|   |
+---+-------------------------------------------------------------------------------------------------+---+
|                       [PRIMARY TOOL DOCK: Select | Brush* | Shapes | Comment]                           |
+---------------------------------------------------------------------------------------------------------+
```

### 5.1 How Users Choose Named Layers in Compact Layout
1. **The Compact Rail Trigger**:
   - The left sidebar contracts to a 52px icon rail with two prominent buttons: `Layers (L)` and `Feedback (C)`.
   - The active layer is indicated by a highlighted icon state.
2. **Accessible Reveal Drawer (`#compact-layers-drawer`)**:
   - Clicking the `Layers` icon trigger (or pressing `L`) smoothly slides open the **Layers Flyout Drawer** over the left edge (width: 260px, elevated shadow).
   - **Full Layer Information**:
     - All named layers are fully readable: `Layer 3 — Highlights (100%)`, `Layer 2 — Ink Lines (85% active)`, `Layer 1 — Background Wash (100%)`.
     - Visibility toggle (`eye`), opacity badges, and `+ Add Layer` button are immediately accessible.
   - **Layer Selection**:
     - Clicking any layer row selects it, immediately updating the active painting target layer for the session.
3. **Dismissal & Focus**:
   - An accessible close button (`✕`) is provided in the drawer header.
   - Pressing `Escape` or clicking outside on the canvas closes the drawer, returning focus to the canvas stage.

### 5.2 How Users Open and Edit Brush Properties in Compact Layout
1. **The Compact Properties Trigger**:
   - The right sidebar contracts to a 56px icon rail featuring:
     - The **Tune Properties Button** (slider icon with tooltip `Brush Properties (B)`).
     - The **Active Color Chip** (displaying the current pigment, e.g. `#1E40AF`).
2. **Accessible Reveal Drawer (`#compact-inspector-drawer`)**:
   - Clicking either the slider icon, the color chip, or double-clicking the Paintbrush tool in the dock slides open the **Contextual Properties Flyout Drawer** over the right edge (width: 280px, elevated shadow).
   - **Complete Property Controls**:
     - Header: `Brush Properties` with subtitle `Contextual Tool Inspector` and close button (`✕`).
     - Stroke Dynamics: Full interactive size slider + numeric input (`24 px`) + preset pills (`[2] [8] [16] [24] [48]`).
     - Opacity: Full interactive opacity slider + percentage input (`85%`).
     - Color & Palette: Large active color swatch chip + hex input (`#1E40AF`) + 7-swatch palette grid.
     - Target Layer Confirmation: `Painting onto: Layer 2 — Ink Lines`.
3. **Direct Manipulation**:
   - The artist can adjust any slider or click swatches; changes apply immediately to the active painting tool.
4. **Dismissal & Focus**:
   - Closing via `✕`, `Escape`, or clicking on the canvas dismisses the flyout without changing tool parameters, keeping the user ready to paint.
