# Studio application

`apps/studio` is the dependency-free browser studio and its canonical JavaScript runtime.

## Key files

- [`src/transport/index.mjs`](src/transport/index.mjs) exports `createStudio` and persistence attachment.
- [`src/studio/index.mjs`](src/studio/index.mjs) bootstraps the browser workspace.
- [`public/index.html`](public/index.html) defines the application shell.
- [`assets.go`](assets.go) embeds the reviewed runtime tree for native distribution.

The runtime flow is browser studio → local transport → direction session → painting document. The managed Node entrypoint exposes authenticated lifecycle status and stop; the native Go manager starts, reuses, stops, and restarts that runtime.
The transport serves only the explicit `public/`, `src/studio/`, and `src/painting/` runtime paths.

## Boundaries and invariants

Keep JavaScript in native ES modules with browser APIs and Node built-ins only.
Cross-context imports use each context's `index.mjs`; domain code does not import UI, HTTP, or filesystem code.
Project and recovery inputs are current-only contracts and are rejected before mutation when invalid.
Markdown READMEs are excluded from runtime embedding and do not become served application assets.
Port 4317 is the managed production default; development and tests use isolated loopback ports and temporary persistence. `npm start` uses port 0 with in-memory persistence.

## Verification

From the repository root, run [`npm run verify`](../../package.json),
[`npm run test:browser`](../../package.json), and relevant isolated Go checks from [`Makefile`](../../Makefile).
