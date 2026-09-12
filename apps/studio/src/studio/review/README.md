# Review

[`index.mjs`](index.mjs) exposes the headless review service.
[`session.mjs`](session.mjs) manages spatial region feedback through
begin, rect selection, text drafting, fenced submission, retry, cancel,
and status transitions. Feedback SEND authorizes continuation directly
at the confirmed control epoch without requiring a separate Resume step.

[`pause.mjs`](pause.mjs) confirms a pause against instance ID, document
generation, paused status, and control epoch before review proceeds. Human
pause and keep-paused requests remain authoritative until continuation is
authorized.

The service patches review state, sends current art and generation context,
and marks stale or uncertain operations explicitly. Visual feedback presentation
is owned by [`../workspace/`](../workspace/README.md).

Dependencies are model, requests, dispatch, and comments’ pause handshake.
Coverage: `studio-review.test.mjs`, `studio-review-submit.test.mjs`, and
the comments pause/session suites.
