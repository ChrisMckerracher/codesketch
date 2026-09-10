# Application

[`index.mjs`](index.mjs) is the browser application coordinator.
It creates the model, requests queue, review service, document service,
and dispatch function used by mounted UI contexts.

`actions.mjs` validates playback controls. `mutations.mjs` validates local
intent payloads, resolves the current document generation, and submits
layer, background, and stroke changes. `local.mjs` handles tool, tab, drawer,
property, filename, and other local intents. Viewport intents are delegated
separately to `handleView` from [`../viewport/index.mjs`](../viewport/index.mjs).

Dispatch deduplicates tracked work, reports failures through model notices,
and rejects unknown or malformed intents. Document or session rotation clears
an in-progress draft. Server mutations carry the current generation through
the request coordinator. A supplied held generation is honored rather than
recaptured. Same-context pause requests share confirmation.

Dependencies flow to [`../model/`](../model/README.md),
[`../requests/`](../requests/README.md), [`../documents/`](../documents/README.md),
[`../review/`](../review/README.md), and [`../viewport/`](../viewport/README.md).
Coverage: `studio-application.test.mjs`.
