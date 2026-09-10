# Direction feedback

This nested context validates and stores comments plus the control grant used around agent execution.

## Public entrypoint and key files

- [`index.mjs`](index.mjs) exports comment normalization, comment transitions, polling, and `ControlGrant`.
- [`schema.mjs`](schema.mjs) defines bounded comment fields, statuses, rectangles, and conflict/not-found errors.
- [`store.mjs`](store.mjs) prepares comments, applies status transitions, and produces polls.
- [`grant.mjs`](grant.mjs) tracks document generation, control epoch, and active grant token.

## Boundaries and invariants

Feedback imports painting validation through [`../../painting/index.mjs`](../../painting/index.mjs).
It remains independent of the browser, transport, and filesystem.
Comments use the 1000 × 700 canvas, bounded text and cursor metadata, unique IDs/numbers/sequences,
and statuses `open`, `acknowledged`, `addressed`, or `resolved`.
Human activity acknowledges the grant state; agent mutations must match current generation and epoch,
and execution requires the active grant when the session requires one.
Normalize and validate imported comments before session state changes.

## Verification

Run [`npm run verify`](../../../../../package.json) and the comment domain, session, and HTTP tests in [`../../../tests/`](../../../tests/README.md).
