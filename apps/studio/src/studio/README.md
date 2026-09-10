# Studio source map

`src/studio` owns browser interaction, presentation, and the HTTP client.
The bootstrap entrypoint is [`index.mjs`](index.mjs); it composes state,
application dispatch, renderer, and mounted UI contexts.

Core contexts:

- [`application/`](application/README.md) routes intents and tracks work.
- [`documents/`](documents/README.md) handles projects and PNG export.
- [`gesture/`](gesture/README.md) turns pointer input into commands.
- [`header/`](header/README.md), [`tools/`](tools/README.md), and [`viewport/`](viewport/README.md) mount workspace controls.
- [`inspector/`](inspector/README.md) edits tool, layer, and document properties.
- [`layers/`](layers/README.md) renders layer state; [`playback/`](playback/README.md) renders queue controls.
- [`model/`](model/README.md), [`requests/`](requests/README.md), and [`review/`](review/README.md) provide state, transport, and feedback flows.

`api.mjs`, `response.mjs`, and `response-artwork.mjs` define the browser-facing
HTTP and response seams. `renderer.mjs` delegates pixels to painting’s public
renderer. Contexts communicate through public `index.mjs` entrypoints.

Named coverage is in [`../../tests/`](../../tests/README.md), especially
`studio-application.test.mjs`, `studio-model.test.mjs`, and focused request,
gesture, document, and review suites.
