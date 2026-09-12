# Gesture input

[`index.mjs`](index.mjs) owns pointer gestures for painting tools and shapes.
It pauses playback before a manual mark, tracks pointer capture, keeps a
draft during movement, and commits only after the captured context remains
current.

[`command.mjs`](command.mjs) clamps canvas points to 1000 × 700, bounds stroke
points at 2,000, and builds current `stroke`, `rect`, and `ellipse` commands.
[`smoothing.mjs`](smoothing.mjs) applies deterministic local manual-stroke
smoothing (`smoothPoints`), sharing identical smoothed points between interactive
brush preview and the committed stroke store.

Pointer cancellation, lost capture, offline state, stale generations, and
session rotation clear drafts safely. Shape dimensions remain positive and
bounded by the canvas.

Dependencies are the model, application dispatch, review-independent canvas,
and comments geometry conventions. Coverage: `studio-gesture.test.mjs`,
`studio-gesture-deferred.test.mjs`, and `studio-smoothing.test.mjs`.
