# Painting rendering

This context converts committed and transient painting values into browser Canvas pixels.

## Public entrypoint and key files

- [`index.mjs`](index.mjs) exports `createRenderer(canvas)` with per-layer buffering and compositing.
- [`stroke.mjs`](stroke.mjs) draws progressive strokes and brush variants.
- [`../../studio/renderer.mjs`](../../studio/renderer.mjs) coordinates rendering and PNG export for the UI.

## Boundaries and invariants

Rendering consumes normalized document values and has no direction, transport, or filesystem dependency.
Each layer is rendered into its own buffer, then composited by visibility and opacity.
The background is painted first; active playback and pointer drafts are transient and never committed by rendering.
Eraser strokes use destination-out within their target layer; marker and pencil modify opacity/width behavior.
Keep this implementation browser-compatible because [`assets.go`](../../../assets.go) embeds it for native capture.
Do not duplicate renderer logic in the Go CLI or another UI module.

## Verification

Run [`npm run verify`](../../../../../package.json), [`npm run test:browser`](../../../../../package.json),
and the capture contract tests at [`../../../tests/capture-contract.test.mjs`](../../../tests/capture-contract.test.mjs).
