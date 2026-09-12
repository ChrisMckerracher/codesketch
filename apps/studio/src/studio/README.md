# Studio source map

`src/studio` owns browser interaction, presentation, and the HTTP client.
The bootstrap entrypoint is [`index.mjs`](index.mjs); it composes state,
application dispatch, renderer, and mounted UI contexts.

Core contexts:

- [`application/`](application/README.md) routes intents and tracks work.
- [`comments/`](comments/README.md) handles comment synchronization and lifecycle.
- [`documents/`](documents/README.md) handles projects and PNG export.
- [`gesture/`](gesture/README.md) turns pointer input into commands with stroke smoothing.
- [`model/`](model/README.md), [`requests/`](requests/README.md), and [`review/`](review/README.md) provide state, transport, and feedback flows.
- [`workspace/`](workspace/README.md) provides the tactile, zero-CLS Studio canvas workspace, custom vector typography, and persistent invisible semantic DOM backing controls.

`api.mjs`, `response.mjs`, and `response-artwork.mjs` define the browser-facing
HTTP and response seams. `renderer.mjs` delegates pixels to painting’s public
renderer. Contexts communicate through public `index.mjs` entrypoints.

Named coverage is in [`../../tests/`](../../tests/README.md), especially
`studio-application.test.mjs`, `studio-model.test.mjs`, and focused request,
gesture, document, and review suites.
