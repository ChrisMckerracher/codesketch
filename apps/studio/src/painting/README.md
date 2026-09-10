# Painting

Painting owns the artwork model and rendering implementation.

## Public entrypoint

- [`index.mjs`](index.mjs) exports document creation, command application, batch validation, replay, limits, and scalar validators.
- [`document/`](document/README.md) reduces and validates plain drawing commands.
- [`rendering/`](rendering/README.md) turns document values into Canvas pixels.

## Boundaries and invariants

Painting has no browser, network, filesystem, direction, transport, or studio imports.
Cross-context consumers use this entrypoint rather than nested implementation files.
The document is 1000 × 700 with a background, ordered layers, and marks.
Supported commands are `stroke`, `rect`, `ellipse`, `fill`, `layer.add`, and `layer.update`.
Commands use finite bounded values, hex colors, explicit layer IDs, and named brush modes.
Whole batches are validated before acceptance; replay is deterministic and ordered.
The renderer is a separate browser-facing subcontext and is also the canonical embedded renderer for native capture.

## Verification

Run [`npm run verify`](../../../../package.json) and the document tests under [`../../tests/`](../../tests/README.md).
Run [`npm run test:browser`](../../../../package.json) for rendered pixels and compositing workflows.
