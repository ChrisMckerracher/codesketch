# Painting document

This context validates plain commands and immutably reduces them into the current document shape.

## Public entrypoint and key files

- [`index.mjs`](index.mjs) exports `createDocument`, `applyCommand`, `validateBatch`, `replay`, and scalar validators.
- [`validation.mjs`](validation.mjs) defines command normalization, colors, identifiers, labels, and limits.

The default document has version `1`, size 1000 × 700, background `#f7f3e8`,
one visible `paint` layer, and no marks.

## Boundaries and invariants

Document code has no browser, Canvas, direction, transport, or filesystem dependency.
It accepts only the six current command types and rejects unknown or obsolete input. Unknown command `type` values are rejected; extra fields on otherwise recognized commands are not generally rejected by this context.
Limits bound commands, stroke points, total points, and layers; shapes must fit the canvas.
`validateBatch` applies a proposed sequence against a simulated document and returns normalized commands.
Callers must use the returned document/commands and treat inputs as untrusted.

## Verification

Run [`npm run verify`](../../../../../package.json) and [`document.test.mjs`](../../../tests/document.test.mjs).
