# Workspace architecture and folder map

The `workspace/` context owns the tactile, zero-CLS Studio canvas workspace, pure custom vector typography, and persistent invisible semantic DOM backing controls. It is organized into nested bounded folder subcontexts under `apps/studio/src/studio/workspace/`, each exposing a public `index.mjs` entrypoint.

## Core entrypoints

- [`index.mjs`](index.mjs): Workspace lifecycle coordinator exporting `createWorkspace({ root, canvas, uiCanvas, controlsRoot, renderer, application, viewport })`. Wires vector rendering, control descriptors, input gestures, and uniform resize handling. Returns `{ ui, update, destroy }`.
- [`render.mjs`](render.mjs): Dual-canvas workspace render orchestration exporting `renderWorkspace({ ctx, v, model, ui, controls, artwork })` and `artworkSignature(model)`. Composites artwork clamped to active boundaries and renders vector UI chrome.

## Folder map and public contracts

- [`geometry/`](geometry/index.mjs): Fixed 1000×700 design space, collapse-aware canvas bounds, pointer-to-design coordinate mapping, and rectangle clipping.
  - Public contract: `DESIGN_WIDTH`, `DESIGN_HEIGHT`, `CANVAS_WIDTH`, `workspaceWidth(collapsed)`, `designPoint(event, element)`, `clampWorkspacePoint(point, collapsed)`, `clipRect(rect, bounds)`.
- [`vector/`](vector/index.mjs): Pure custom vector typography and bounded Canvas 2D graphic primitives without HTML DOM text nodes.
  - Public contract: `GLYPHS`, `createVector(ctx)` returning `{ rect, stroke, ellipse, roundRect, text, wrap, layout, measure }`.
- [`controls/`](controls/index.mjs): Declarative control descriptors and persistent invisible semantic DOM backing inputs (`<button>`, `<input type="range">`, `<textarea>`).
  - Public contract: `createControls({ root, dispatch, changed, point, vector })` returning `{ update(descriptors), destroy(), draw(ctx, v), inputState(id) }`.
- [`actions/`](actions/index.mjs): Workspace action dispatcher routing UI gestures to application intents and managing local UI state.
  - Public contract: `createWorkspaceActions({ application, ui, changed })` returning `{ dispatch(action, payload), destroy() }`. Integrates `layers`, `palette`, `replies`, and local handlers (`sidebar.collapse`, `sidebar.expand`, `comments.filter`, `comments.select`, `comments.scroll`, `comments.thread.scroll`, `feedback.toggle`, `project.save`).
- [`input/`](input/index.mjs): Pointer gestures, spatial selection marquee manipulation (drag, resize, boundary clamping), loupe pixel sampling, and semantic hit testing.
  - Public contract: `createWorkspaceInput({ root, canvas, model, dispatch, ui, changed, point, artwork, getControls, getBlockedRects, getThreadViewport })`.
- [`palette/`](palette/index.mjs): 8 quick color chips, 2D Saturation/Value matrix, 1D Hue slider, and offscreen canonical canvas eyedropper loupe.
  - Public contract: `renderPalette({ ctx, v, model, ui, artwork })`, `hexToHsv(hex)`, `hsvToHex(h, s, v)`, `samplePixel(canvas, x, y)`.
- [`sidebar/`](sidebar/index.mjs): Right 260px inspector panel (`x: 740..1000` expanded, collapsible to `x: 1000`).
  - Public contract: `renderSidebar({ ctx, v, model, ui })`. Renders header actions (`FB`, `SAVE`, `>|` / `EXPAND`), tool switcher (`INK`, `PENCIL`, `MARK`, `ERASE`), stroke sliders (Size, Opacity, Smoothing), preset color chips, and layer stack with inline opacity and thin 4px scrollbar at `x = 994`.
- [`feedback/`](feedback/index.mjs): Spatial selection marquee, pinned critique notes, anchored composer card, and review thread view.
  - Public contract: `renderFeedback({ ctx, v, model, ui })`, `feedbackRegions({ model, ui, v })`, `THREAD_VIEWPORT`, `threadViewport(anchor)`.
