# Tools

[`index.mjs`](index.mjs) mounts the tool dock and compact responsive controls.
[`dock.mjs`](dock.mjs) renders grouped tool buttons and zoom presets;
[`compact.mjs`](compact.mjs) wires side drawers and mobile rails.

[`shortcuts.mjs`](shortcuts.mjs) handles Cmd/Ctrl-Z undo, Cmd/Ctrl-Shift-Z
redo, Cmd/Ctrl-S save, Space pause/resume, `]` step, `C` region feedback,
`L` layers, and the documented drawing-tool keys while respecting editable
controls, modifier keys, composition, and native button behavior. The Hand
tool provides pointer panning; zoom remains a dock control. [`shared.mjs`](shared.mjs)
provides labels, icons, DOM helpers, and server availability checks.

Tool selection and viewport actions dispatch through the application boundary.
Unavailable server actions remain disabled, and drawer focus returns to its
trigger after close.

Styles are in [`../../../public/stage.css`](../../../public/stage.css) and
`controls.css`. Coverage: browser appearance and layer keyboard scenarios.
