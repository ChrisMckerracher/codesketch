# Native paint craft and recovery

Use the current `paint guide` as the authority for syntax, rendering behavior, and limits. This reference records practical decisions that mattered during the collaborative workflow.

## Marks and inspection

- Use native drawing, status, feedback, and project commands. Capture the studio with `paint view`; open the returned file with the image reader. `paint export` is the delivery capture.
- Keep construction, contours, color shapes, and environment on intentional layers. Reduce construction visibility after checking it, so guide lines do not obscure anatomy during review.
- Stage focused batches and inspect meaningful milestones. Stay responsive to the user's drawing corrections.
- Calculate command and point budgets before submitting a large revision. Leave room for corrections. Do not change the application's limits as part of a painting request.
- Pencil size and opacity are renderer-specific. Consult the guide rather than assuming that an opacity of one produces an opaque painted area.
- When using path helpers, preserve pen lifts between independent subpaths. A connector across a gap can become an unintended line through a face or hand.
- When filling a hand-designed concave shape with strokes, preserve gaps and disconnected spans. One continuous scan path can accidentally bridge them. Inspect overlaps around hair, glasses, hands, and clothing.
- Repeated overlap within a single stroke may not build opacity as separate marks would. Check the rendered result before relying on a fill to cover underlying lines.

## Pauses and user direction

Read current playback state and feedback before changing playback. Preserve a human pause unless continuation is authorized. Authorization is part of the conversation: when the user explicitly says to ignore their pauses and finish drawing, carry that instruction forward rather than repeatedly asking to resume. A later instruction to stop or pause takes precedence.

Distinguish artistic feedback from playback control. A pause is not sketch approval. A wait timeout is not a drawing failure or a user instruction; inspect state and continue waiting or working as appropriate.

Keep background playback helpers bounded by the current drawing job. Stop an auto-resume helper before intentionally pausing a pass for critique or rebuilding it.

## Save and recover

Keep the drawing's source marks and editable project files outside temporary memory. Save the approved sketch and substantial revisions under the project's artifact directory. Temporary scripts alone are insufficient for a session handoff.

If the user clears the canvas accidentally:

1. Inspect `paint status` and save the surviving project.
2. Determine whether the committed artwork, pending queue, or whole document was cleared.
3. Compare the surviving commands with saved work structurally. JSON key order may differ after normalization, and the user may have inserted their own marks.
4. Restore the missing queue or load the appropriate saved stage. Preserve surviving user work. Do not blindly replay already committed marks.
5. Inspect the restored canvas and save another checkpoint.

Use the user's request to recover as authorization for the necessary restoration. Report what survived and what was restored without making the user reconstruct the lost commands.

## Handoff

Record the active stage, selected reference paths or URLs, current critique, saved project path, and next drawing step. Keep any uncompleted final painting task open. Capture reusable workflow guidance separately from the artwork and avoid turning an unsuccessful drawing into a template for future anatomy.
