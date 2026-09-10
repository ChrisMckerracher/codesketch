# Studio public assets

This folder contains the browser shell and static Mac-style workspace assets.

## Key files

- [`index.html`](index.html) defines the canvas, toolbar, inspector, playback controls, comments panel, and dialogs.
- [`base.css`](base.css) defines typography, colors, controls, and appearance foundations.
- [`layout.css`](layout.css), [`responsive.css`](responsive.css) define workspace geometry and narrow layouts.
- [`tools.css`](tools.css), [`inspector.css`](inspector.css), [`comments.css`](comments.css), and [`dialogs.css`](dialogs.css) style bounded UI surfaces.

The module entry is [`../src/studio/index.mjs`](../src/studio/index.mjs); HTML loads it as a same-origin module.
The transport serves these assets through its explicit static allowlist and sends a strict CSP.

## Boundaries and invariants

Keep assets dependency-free, local, and free of remote fonts, scripts, images, or styles.
The canvas remains the primary workspace; controls use neutral surfaces, system typography, and clear focus/disabled states.
Keep IDs, labels, and ARIA relationships aligned with the UI modules and browser scenarios.
Markdown documentation in this folder is not a runtime asset and is excluded from native embedding.

## Verification

Run [`npm run verify`](../../../package.json) and [`npm run test:browser`](../../../package.json) at desktop and narrow viewports.
