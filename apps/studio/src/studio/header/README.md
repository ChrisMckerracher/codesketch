# Header

[`index.mjs`](index.mjs) mounts the document header and its desktop actions.
It displays connection, storage, playback, and request status; edits the
document filename; and exposes New Document, demo, project open/save, and PNG
export actions.

Undo, redo, Fit, and actual-size controls dispatch application intents. The
project picker accepts JSON files and reports failures through the shared
notice/status surface.

Buttons reflect pending work and current model capabilities. Menu positioning
tracks viewport changes, and mount cleanup aborts listeners and clears DOM
state.

The header depends on the application dispatch contract and model snapshots;
its visual classes are defined in [`../../../public/controls.css`](../../../public/controls.css).
Coverage: `studio-application.test.mjs` and `static-ui.test.mjs`.
