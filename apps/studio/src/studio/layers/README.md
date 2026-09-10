# Layers

[`index.mjs`](index.mjs) renders the layer stack from the current document.
Rows show visibility, name, and opacity; the selected row opens layer context
in the inspector.

The Add Layer action generates a unique `layer-N` ID and chooses the next
unused `Layer N` label when the UI supplies one; layer names are not required
to be unique. Visibility uses the current layer update intent. Double-click or F2 starts inline renaming;
Enter and blur commit, while Escape cancels.

Rows preserve order, selection, and active edits across snapshots. Edits are
cancelled when the layer disappears, the session identity changes, or the
server becomes unavailable. Mount cleanup removes listeners and rows.

The module depends on model snapshots and application dispatch, with styles
in [`../../../public/layers.css`](../../../public/layers.css). Coverage:
`studio-application.test.mjs` and browser layer scenarios.
