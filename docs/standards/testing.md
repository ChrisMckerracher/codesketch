# Verification and release evidence

Native Node tests cover the drawing vocabulary, immutable document reduction, validation budgets, atomic batch rejection, ordered replay, queue replacement, pause/feedback behavior, history, project import, local persistence, and HTTP trust boundaries. Use isolated sessions and temporary directories. Tests must clean up servers and timers.

`npm run verify` runs syntax, source-size, context-boundary, and zero-dependency checks before the native tests. External browser tooling already installed on the workstation is allowed for verification; keep its runtime packages and generated artifacts outside the shipped application.

Use Playwright CLI against the running loopback server for observable user workflows: draw with a real pointer, undo and redo, switch brushes and colors, add/select/hide a layer, change opacity, watch progressive demo playback, pause, step, submit feedback, resume, save and load a project, and download a valid PNG. Inspect the browser console and test narrow and wide viewports. Verify the canvas pixels as well as DOM labels when testing drawing and compositing.

The lead reviews findings and runs verification. Herdr workers implement all code and regression tests. Turn each discovered defect into a bounded worker assignment with reproduction, expected result, and exact file ownership. Repeat checks when fixes change the relevant behavior. Report remaining limitations candidly and keep the final repository state reviewable.
