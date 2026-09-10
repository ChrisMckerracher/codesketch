# Inspector

[`index.mjs`](index.mjs) mounts the contextual inspector and routes model
state to tool, layer, and document panels.

[`tool-context.mjs`](tool-context.mjs) edits brush or shape properties, color,
opacity, fill settings, and size presets. [`layer-context.mjs`](layer-context.mjs)
edits the selected layer name, visibility, and opacity. [`document-context.mjs`](document-context.mjs)
edits background color and exposes the demo action.

[`dom.mjs`](dom.mjs) supplies element creation, field conversion, color
discovery, server availability, and guarded field synchronization. Active
edits stay stable while snapshots arrive and cancel when their context rotates.

The inspector depends on application dispatch and model snapshots. Coverage:
`studio-application.test.mjs`, `studio-model.test.mjs`, and
`studio-documents.test.mjs`.
