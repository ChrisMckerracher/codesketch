# Viewport

[`index.mjs`](index.mjs) mounts the canvas stage and owns fit, actual-size,
zoom, and hand-tool panning behavior.

Manual zoom intents clamp scale between 0.25× and 4×. Fit measures the stage,
preserves the 1000 × 700 aspect ratio, and can render below 0.25× when space
requires it. Pointer panning updates translation while the hand tool is active,
preserves the rendered scale, and keeps pointer capture cleanup on release or
cancellation.

The stage supplies canvas coordinates through comments geometry and exposes
the canvas and overlay to gesture and review presentation mounts. Resize
observation reapplies transforms; destroy aborts listeners and observers.

The context depends on model state, dispatch, and the committed public shell.
Coverage: `studio-application.test.mjs` and browser appearance scenarios.
