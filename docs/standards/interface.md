# Codesketch Studio Interface Standards

> [!IMPORTANT]
> **Supersession Notice (2026-09-11)**: This standard supersedes legacy Mac application presentation rules (system font typography, floating tool dock, separate playback HUD, compact drawer rails, and zoom/pan/fit view navigation) with the user-approved Codesketch Studio vector baseline. Frozen references in this isolated repository are located at `docs/reference-mockup/index.html` and `docs/reference-mockup/overflow_demo.html`.

## 1. Authority, Approval & Visual Governance
- **Authoritative Approval**: Explicitly approved by user on **2026-09-11** following visual inspection and tactile interaction. Full reconstruction and release authorization granted.
- **Frozen Reference Baselines**:
  - Isolated Repository References: `docs/reference-mockup/index.html` and `docs/reference-mockup/overflow_demo.html` (frozen read-only).
  - Designer Origin: `/private/tmp/codesketch-designer-20260910-fresh/artifacts/mockup/index.html` (port 8088).
  - Acceptance Specification: `docs/specs/studio-reconstruction.feature`.
  - Architectural Plan: `docs/plans/architect/studio-reconstruction.md`.
  - Epic Task Hierarchy: Authoritative tasks and sequence are tracked in manager's `bd` tree under epic `paint-2y5`.
- **Zero Feature Creep Rule**: No invented UI features, docking frames, secondary headers, or unapproved pan/zoom controls. The application must be reconstructed strictly based on the approved features in the frozen reference and no more.

---

## 2. Geometry, Viewport & Dual Rendering Architecture

### 2.1 Fixed Design Geometry
- **Design Resolution**: Fixed at strictly **1000×700** design units.
- **Workspace Partitioning**:
  - **Artwork Stage**: Occupies `x: 0..740`, `y: 0..700` in default expanded mode.
  - **Inspector Sidebar**: Overlays right 260 units at `x: 740..1000`, `y: 0..700`.
  - **Expanded Mode Interaction**: Clamps artwork interaction and stroke marks strictly to `x: 0..740`. Pointer dragging past `x = 740` does not leak marks into the sidebar. Rectangle-aware bounds clamp feedback selection marquee origin to visible artwork region (`x: 0..740` expanded, `x: 0..1000` collapsed, `y: 0..700`) accounting for rectangle width and height; inspecting stored comments preserves original document-space bounds.
  - **Sidebar Collapse**: Toggling sidebar collapse expands the visible canvas workspace to `x: 0..1000`. Full document marks are revealed without remapping underlying document coordinates.
- **Uniform Viewport Scaling**:
  - The entire 1000×700 design space scales uniformly to fit the browser window (`Math.min(availW / 1000, availH / 700)`).
  - Canvas backing store accounts for `window.devicePixelRatio` independently for crisp rendering on high-DPI displays.
  - **No document data remapping**: Internal pointer events, brush paths, and review coordinates translate directly to the 1000×700 design space. Extra zoom, pan, hand tool, or complex viewport cameras are prohibited.

### 2.2 Dual Rendering Pipeline
1. **Canonical Artwork Canvas (Offscreen)**:
   - Renders 1000×700 committed artwork layers, vector marks, and layer transparency.
   - Clean of UI chrome, overlays, and cursor artifacts.
   - Serves as the authoritative source for eyedropper pixel sampling (sampling the displayed artwork composite without UI chrome).
   - PNG export renders the committed document on an isolated surface through the existing committed exporter, strictly excluding active playback, in-flight stroke previews, and local drafts (only `[ SAVE ]` is exposed by the final baseline UI).
2. **Workspace UI Canvas (Onscreen)**:
   - Renders composite artwork clamped to active boundaries, followed by vector UI chrome, palette, layer cards, scrollbars, selection marquee, and composer popover.

---

## 3. Pure Custom Vector Typography & Semantic DOM Controls

### 3.1 Folder Subcontexts & Vector Contract
- The presentation layer is organized into folder subcontexts under `apps/studio/src/studio/workspace/`, each exporting a public `index.mjs`: `geometry`, `vector`, `controls`, `sidebar`, `palette`, and `feedback`.
- **Vector Engine Contract**: `vector/index.mjs` exports `createVector(ctx)` wrapping Canvas 2D context with:
  - `text(text, x, y, scale, color, size, opacity)`: Draws vector glyph strokes from `GLYPHS` dictionary with round caps/joins.
  - `wrap(text, maxWidth, scale)`: Computes word wrapping for given pixel widths.
  - `measure(text, scale)`: Measures rendered text width as a number in design units (no width/height object).
  - Primitives: `rect`, `stroke`, `ellipse`, `roundRect`.
- **Zero-DOM Text Invariant**: Zero HTML `<p>`, `<span>`, `<h1>`–`<h6>`, or native text elements exist for visible interface chrome inside the workspace. All visible typography renders exclusively via vector paths.
- **Supported Character Sets**: Uppercase `A-Z`, digits `0-9`, and full symbol dictionary (`:`, `-`, `/`, `+`, `#`, `[`, `]`, `(`, `)`, `%`, `.`, `,`, `=`, `<`, `>`, `|`, `&`, `!`, whitespace).

### 3.2 Invisible Persistent Semantic DOM Inputs
- All interactive controls have persistent invisible semantic DOM backing elements (`<button>`, `<input type="range">`, `<textarea>`) positioned at their exact descriptor bounds.
- Backing elements support native keyboard navigation (`Tab`, `Enter`, `Space`), screen readers, native IME text composition, and system clipboard paste/selection.
- Visible focus rings, cursor carets, and error states are rendered exclusively as custom vector graphics on the canvas surface.

---

## 4. Control Descriptors & Interaction Model

### 4.1 Functional Control Descriptors
Renderer functions emit declarative control descriptors for every interactive zone:
```typescript
interface ControlDescriptor {
  id: string;
  kind: 'button' | 'slider' | 'toggle' | 'chip' | 'card' | 'input' | 'area';
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  action: string;
  payload?: Record<string, unknown>;
  value?: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}
```
- **Action Routing**: Pointer interactions are hit-tested against active descriptors by the workspace controller, dispatching `{action, payload}` to the application dispatcher.

### 4.2 State Partitioning
- **Canonical Model State** (Synchronized with server persistence from accepted snapshots): Document layer collection (canonical IDs, names, bottom-to-top compositing order, visibility `visible: boolean`, opacity `opacity: number` 0..1), committed artwork marks and strokes, review threads, spatial comment bounds, and document save/revision epoch.
- **Local Application-Model State**: Active tool (`brush`, `pencil`, `marker`, `eraser`, with `INK`, `PENCIL`, `MARK`, `ERASE` as visible UI labels), brush parameters (size `1..100`, opacity `0..1`, smoothing `0..1`, color hex), and review composer text draft in `model.review.text`.
- **Ephemeral UI State**: Sidebar collapse (`isCollapsed`), layer scroll (`layerScrollY`), comment scroll (`commentScrollY`), filter toggle (`filter: 'ALL' | 'ACTIVE'`), focused comment, pigment picker state (popover visibility and 2D reticle coordinates), and temporary confirmation states (e.g. 2.5s "SAVED" indicator).

---

## 5. Tool Dynamics, Palette & Layer Stack

### 5.1 Stroke Dynamics & Eraser
- **Stroke Smoothing**: Artwork mark creation relies on the canonical renderer plus deterministic local manual-stroke smoothing. Interactive brush preview and committed stroke store share identical smoothed points.
- **Eraser Transparency**: Eraser is a true per-layer transparency operation using `destination-out` composite blending to erase marks down to transparent alpha.
- **Bounded Eraser Size**: Effective eraser size is strictly bounded: `effectiveSize = Math.min(100, 2 * selectedBrushSize)`.
- **Sequential Layer Mutations**: Layer slider adjustments coalesce intermediate values; active drawing tool selection is preserved across all layer operations.

### 5.2 Palette & Color Picker
- **Preset Chips**: 8 quick chips with active selection ring (24px diameter).
- **Color Picker Popover**: 2D Saturation-Value matrix (228×62), 1D Hue spectrum slider (228×12, 0°–360°), and 6 recent mixes swatches.
- **Eyedropper Loupe**: 28px circular magnifying loupe with crosshair reticle. Must sample directly from the offscreen canonical canvas to guarantee underlay-safe sampling free of UI chrome contamination.

### 5.3 Layer Stack & Overflow
- **Active Card**: 50px expanded card (`#F0F9FF`) with 3px accent bar (`#0284C7`) and inline opacity slider (`x: 810..938`).
- **Inactive Rows**: Compact 30px rows.
- **Layer Addition (`+ NEW`)**: Appends a new layer to the document layer collection (bottom-to-top compositing) and displays in reverse order (top layer first in UI stack), using actual canonical layer IDs for mutations. The newly created layer is activated after acknowledgement, preserving the active drawing tool, and layer scroll resets to 0. Canonical layer properties use `opacity` (number 0..1) and `visible` (boolean), with percentage strings derived for presentation.
- **Viewport Clipping**: Layer stack content strictly clipped between `y: 272..472` (200px height). Scrolling layers never shifts the comments section below.

---

## 6. Review Lifecycle, Feedback & Zero-CLS Gutter

### 6.1 Feedback Marquee & Fenced Submission
- **Canvas Selection Marquee**: Blue wash (`rgba(2, 132, 199, 0.14)`), two-tone alternating dashed border (`#0284C7` and `#FFFFFF`), 4 corner drag handles (8×8), and dimension badge (`[ 320 X 190 PX ]`). Rectangle-aware bounds clamp origin to visible artwork region (`x: 0..740` expanded, `x: 0..1000` collapsed, `y: 0..700`) accounting for rectangle width and height. Inspecting stored comments preserves original document-space bounds.
- **Composer Card**: Anchored adjacent to selection with frame stepper, coordinate readouts, and critique input.
- **Fenced Submission**: Confirmed review pause captures `generation`, `artRevision`, and `controlEpoch`. Feedback `SEND` dispatches with these captured guards, along with a unique `requestId` and payload.
- **Continuation & Pause**: The user explicitly hates a separate Resume step; approved `SEND` itself authorizes the submitted correction. A pre-existing pause may be superseded by this explicit human `SEND`, never by background automation. This is not automatic resume. Do not add pause-provenance architecture or new UI controls. Subsequent intentional pause or artwork changes reject stale submit; draft text in `model.review.text` is preserved on rejection. Uncertain transport retries preserve original payload and `requestId`.

### 6.2 Comments Navigation, Native CLI & Real Agent ACK
- **Real Production State vs Demonstration Fixtures**:
  - Demonstration counts (e.g. 24 comments, 12 frames, 6 initial layers) are test scenario fixtures, NOT initial production data.
  - Initial production documents load with authentic user data or clean initial layers.
  - Review items display `ACK` strictly upon genuine agent acknowledgement (agent-only, not human).
  - The `ACTIVE` filter strictly filters for unresolved items, defined as `status !== 'resolved'` (covering `open`, `acknowledged`, and `addressed`). Human resolution is the explicit transition that sets status to `resolved` and removes the item from `ACTIVE`.
- **Bounded Comment Replies & Canonical CLI**: Comments schema supports an optional bounded reply collection (`{ id, author, text, at, requestId }` where author is `human` or `agent`, max 32 replies per comment, max 2000 chars each). Native CLI in `apps/paint/internal/cli` provides the canonical reply operation: `paint comments reply <id> <text> --generation <generation> --seq <seq> --request-id <unique-id>`. Optional replies are current semantic data without backwards-compatibility migration adapters.

### 6.3 Zero Cumulative Layout Shift (CLS)
- **Layout Invariance**: Comment cards are fixed at width 216px (`x: 752..968`).
- **Reserved Gutter**: Permanent 24px reserved gutter (`x: 968..1000`) houses the floating paint-stroke scrollbar.
- **Collinear Thin Scrollbars**: Both Layers (`y: 276..468`) and Comments (`y: 518..650`) use identical 4px rounded paint-stroke scrollbar thumbs aligned collinearly at `x = 994`.
- **True Measurement**: No hardcoded or fake CLS claims in production; layout stability is verified via standard `PerformanceObserver` layout-shift measurements (`CLS = 0.0000`).

---

## 7. Persistence, Transport & Coding Constraints

### 7.1 Persistence & Transport
- **`project.save`**: Invokes real document serialization and triggers browser JSON download of the authentic v2 document schema with a 2.5-second visual confirmation state.
- **Transport**: Architecture transport relies on HTTP polling (`StudioApi` sequenced requests and 100ms state polling loop); no WebSocket protocol participates.
- **Save Failure**: Network or storage failure displays an error state without losing in-memory artwork edits.

### 7.2 Engineering Constraints & File Sizing
- **Per-file hard ceiling**: Strictly **300 lines** (target under 200).
- **Task assignment targets**: Around **500 changed lines** including tests (split before 1000).
- **Implementation Isolation**: Standard-library and browser APIs only; no external package installations.
