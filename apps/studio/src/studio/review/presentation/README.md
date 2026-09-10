# Review presentation

[`index.mjs`](index.mjs) mounts the feedback composer, comment list, and SVG
overlay on the canvas. It translates pointer selection and keyboard actions
into review intents and rerenders from model state.

[`composer.mjs`](composer.mjs) edits bounded feedback text and exposes submit,
retry, reselect, whole-canvas, hold, and cancel actions. [`list.mjs`](list.mjs)
shows comment status and supports resolve, reopen, and highlight.

[`overlay.mjs`](overlay.mjs) draws the active selection, saved rectangles,
highlight, and keyboard-accessible comment pins. The overlay stays separate
from painting pixels and is removed on destroy.

The presentation depends on comments geometry and review dispatch. Coverage:
`studio-review.test.mjs`, `studio-review-submit.test.mjs`, and browser comment
scenarios.
