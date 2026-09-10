# Studio public assets

This folder is the dependency-free browser shell served by the studio.
[`index.html`](index.html) defines the workspace landmarks: header, layer and
feedback sidebar, canvas stage, contextual inspector, drawers, and notice area.

Stylesheet entrypoints are [`tokens.css`](tokens.css),
[`workspace.css`](workspace.css), [`controls.css`](controls.css),
[`stage.css`](stage.css), [`layers.css`](layers.css), [`inspector.css`](inspector.css),
and [`feedback.css`](feedback.css). They share `--cs-*` tokens and system
typography, with light and dark appearance rules.

[`icon.svg`](icon.svg) supplies the studio’s static icon asset.

The canvas remains the primary workspace. The shell keeps the 1000 × 700
canvas, compact desktop controls, neutral surfaces, keyboard focus rings,
responsive side rails/drawers, and reduced-motion behavior visible in the
committed markup and CSS.

Native embedding treats Markdown as documentation rather than runtime asset
content. The static contract is covered by
[`../tests/static-ui.test.mjs`](../tests/static-ui.test.mjs) and browser
scenarios under [`../tests/browser/`](../tests/browser/README.md).
