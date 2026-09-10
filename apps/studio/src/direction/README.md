# Direction

Direction owns the human/agent session above the painting document.

## Public entrypoint and key files

- [`index.mjs`](index.mjs) exports `Session`, project/recovery validators, and playback duration.
- [`session.mjs`](session.mjs) owns history, queue, active playback, comments, revisions, grants, and recovery state.
- [`history.mjs`](history.mjs) manages ordered commands and cursor movement.
- [`project.mjs`](project.mjs) validates current Codesketch v2 project envelopes.
- [`recovery.mjs`](recovery.mjs) validates the current recovery envelope.
- [`feedback/`](feedback/README.md) owns comment schemas and control grants.

## Boundaries and invariants

Direction imports painting only through [`../painting/index.mjs`](../painting/index.mjs).
It does not import browser, HTTP, or filesystem modules.
Batch validation simulates the full proposed queue before session mutation.
Playback preserves ordered replay; queue replacement cancels a partial active stroke and retains completed work.
Comments pause playback stickily, and history changes clear pending work.
Undo/redo clear pending playback. Agent generation and epoch checks apply to agent drawing and history mutations; human controls, pause, and speed follow their own contracts.
Mutations require current document generation and control epoch; executing agent work may require a grant token.
Project imports accept only format `codesketch`, version `2`, with bounded history, queue, comments, and size.

## Verification

Run [`npm run verify`](../../../../package.json) and the direction-focused tests under [`../../tests/`](../../tests/README.md).
