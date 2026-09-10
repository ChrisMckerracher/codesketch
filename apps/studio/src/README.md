# Studio runtime source

`src` contains the canonical JavaScript runtime split into bounded contexts.

## Public entrypoints

- [`painting/index.mjs`](painting/index.mjs) exposes document reduction and validation.
- [`direction/index.mjs`](direction/index.mjs) exposes session, project, recovery, and playback contracts.
- [`transport/index.mjs`](transport/index.mjs) starts the local HTTP studio and persistence seam.
- [`studio/index.mjs`](studio/index.mjs) starts browser controls and polling.
- [`compositions/index.mjs`](compositions/index.mjs) supplies the editable landscape command batch.

## Dependency boundaries

The intended flow is studio → transport API and painting; transport → direction → painting.
Painting stays independent of browser, network, and filesystem concerns.
Direction consumes painting through its public entrypoint and owns session state, playback, history, projects, recovery, and comments.
Transport owns HTTP trust checks, static serving, authenticated lifecycle handling, and persistence. Its managed entrypoint publishes readiness and ownership for the native Go lifecycle manager.
Studio owns DOM interaction, rendering coordination, and user-facing state.
Cross-context imports target `index.mjs`; subcontexts expose their own index.

## Invariants

Commands are finite, bounded, deterministic, and validated as whole batches before acceptance.
Canvas coordinates use the shared 1000 × 700 document contract and explicit layer IDs.
Current contracts replace obsolete formats; no aliases, migrations, or compatibility adapters are added. Project files use v2; strict recovery envelopes use v1 and retain explicitly flushed partial progress.

## Verification

Use [`npm run verify`](../../../package.json) for syntax, boundaries, policy, and tests.
Use [`npm run test:browser`](../../../package.json) for observable browser workflows.
