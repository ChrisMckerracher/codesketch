# Playback HUD

[`index.mjs`](index.mjs) mounts the stage playback HUD. It shows idle,
playing, pausing, and paused status, remaining commands, active progress,
speed, and controls for pause/resume, step, clear pending, and Finish All.

Controls dispatch `playback.control` intents with the current model context.
Pending buttons disable independently, unavailable server state disables all
server actions, and transient errors remain visible before clearing.

Speed presets are 0.5×, 1×, 2×, and 5×; a current custom speed remains visible.
Mount cleanup aborts listeners and clears timers and children.

The HUD depends on model snapshots and application dispatch. Styles live in
[`../../../public/controls.css`](../../../public/controls.css). Coverage:
`studio-request-pause.test.mjs`, `finish-session.test.mjs`, and browser finish.
