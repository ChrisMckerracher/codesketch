# Review

[`index.mjs`](index.mjs) exposes the review service and presentation mount.
[`session.mjs`](session.mjs) manages region or whole-canvas feedback through
begin, select, compose, submit, retry, cancel, and status transitions.

[`pause.mjs`](pause.mjs) confirms a pause against instance ID, document
generation, paused status, and control epoch before review proceeds. Human
pause and keep-paused requests remain authoritative until continuation is
authorized.

The service patches review state, sends current art and generation context,
and marks stale or uncertain operations explicitly. Presentation code stays
under [`presentation/`](presentation/README.md).

Dependencies are model, requests, dispatch, and comments’ pause handshake.
Coverage: `studio-review.test.mjs`, `studio-review-submit.test.mjs`, and
the comments pause/session suites.
