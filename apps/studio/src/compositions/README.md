# Compositions

This context provides original, deterministic example artwork as editable paint commands.

## Public entrypoint

- [`index.mjs`](index.mjs) exports `landscape()`.

`landscape()` returns a command array beginning with a background fill and layer additions,
then uses strokes and an ellipse to build the demonstration landscape.
Its seeded pseudo-random details make repeated demo loads stable while preserving editable marks.

## Boundaries and invariants

Composition code depends on no UI, transport, filesystem, or external service.
Commands must remain valid for [`painting/index.mjs`](../painting/index.mjs): current command names,
hex colors, bounded canvas coordinates, explicit layers, and supported brush modes.
Keep the composition original and deterministic; do not introduce a second rendering path.
The transport currently loads this batch for `/api/demo` and submits it through the session contract.

## Verification

Run [`npm run verify`](../../../../package.json), including document validation tests.
Exercise the demo through [`npm run test:browser`](../../../../package.json) when changing composition content.
