---
name: paint-with-references
description: Draw and paint in Codesketch with the native paint CLI, using inspected visual references, pencil construction, and user feedback before final rendering. Use for collaborative painting sessions where the user wants to watch actual drawing develop and approve the sketch.
---

# Paint with references

Work as a painter in conversation with the person commissioning the picture. Establish the visual target, draw a readable pencil study, revise its construction with the user, and develop the approved drawing into the final painting.

## Medium and scope

- Begin with `paint guide` and `paint status`. Use the installed CLI and its current guide for drawing, layers, feedback, inspection, and project files.
- Draw through native marks. **Image generation is banned unless the user explicitly approves its use for this painting.** This includes generated visual references and image-model edits. Do not trace generated artwork or convert it into native strokes to bypass the ban. Requests for higher quality, more detail, a professional finish, or a final painting do not grant approval to use image generation.
- Reference images support observation and deliberate drawing. A small reference study can help establish proportions or technique; keep it distinct from the user's original composition.
- Painting scripts may express hand-designed paths, curves, hatching, and batches. Their job is to operate the instrument. Keep application code and dependencies outside the painting task.
- Save artwork and drawing sources in a project-local artifact directory. Follow repository instructions for task tracking and file ownership where applicable.

## Establish the target

Ask a few focused questions when the answers affect the picture: subject or likeness, action and emotion, framing, and the specific visual reference. Reuse choices the user has already made. Continue independent reference gathering while optional questions are pending.

Translate the brief into observable requirements. For example, "excited and a little scared" may require an open mouth, lifted brows, tense shoulders, and trembling contours. A request for a professional anime frame also sets a bar for anatomy, silhouette, line control, and consistency with the chosen frames.

## Find and actually study references

Start with ordinary image-search terms that name the subject and the exact period or version. The user found the desired look with **`season 1 pokemon`**. A franchise name alone can return later seasons, promotional art, fan art, or modern reinterpretations.

Collect enough references to answer distinct drawing questions: overall composition, character proportions, expression, hands or pose, and environment. Let the user's selected examples determine the target. When they narrow the request to one frame and say to focus, study that frame closely before broadening the search.

Open or download the actual images and inspect them with the image reader. Search snippets, alt text, and generated image-search descriptions do not establish what a picture shows. Crop or enlarge reference details when needed. If a source fails, identify that briefly and work with the accessible references; do not claim to have studied an inaccessible image.

Record a short visual analysis grounded in what is visible:

- Ratios and silhouettes: head to shoulders, palm to face, sleeve and forearm width.
- Construction: eye plane, jaw turns, shoulder position, elbow bend, wrist direction, overlapping fingers and thumb.
- Drawing choices: contour thickness, where lines stop, angular versus curved edges, and the economy of interior marks.
- Rendering choices: shadow boundaries, palette relationships, background texture, and depth.

Use these observations to change the drawing. Read [the reference-study example](references/season-one-example.md) when working on the original Pokémon-anime look or when a concrete example of this search method would help.

## Build the pencil drawing

Start on a saved fresh stage with separate layers for light construction and developed pencil contours. Establish the composition and figure proportions before drawing clothing, detailed fingers, foliage, or color.

For a figure, place the head, face centerline and eye plane, neck, ribcage, shoulder joints, upper-arm axes, elbow hinges, forearm volumes, wrists, and palm blocks. Construct the thumb and folded finger mass from those volumes. The construction must determine the contours; drawing guide circles underneath an unchanged unsuccessful pose does not solve it.

Use the pencil for serious drawing. A sketch should already communicate the proposed composition, anatomy, emotion, and quality. "Sketch" describes the stage of development, not permission for weak draftsmanship or placeholder clip art.

Develop one complete, readable pencil pass that the user can assess. When a part is uncertain, a larger hand, head, or arm study is useful before committing the whole composition. Check:

- Does the pose read in silhouette?
- Can each arm be followed from shoulder through elbow and wrist to hand?
- Do the upper arm and forearm have plausible relative lengths and widths for this pose and perspective?
- Does each fist have a clear palm, knuckle arch, folded fingers, and one opposing thumb? Avoid tangled interior loops.
- Do the facial construction and proportions resemble the selected reference's drawing language?

Inspect the actual canvas before shading. Detail, more marks, or elaborate descriptions cannot repair weak construction.

## Show, listen, revise

Capture with `paint view`, then open its returned image path with the image reader. Inspect the full frame and crop important areas when needed. Show the actual drawing to the user. On macOS, use `open <image-path>` when they request an external viewer; an inline preview does not fulfill that request.

Give concise observations grounded in the image. Describe improvements only after visually checking them. Avoid promises such as "the next pass will be professional" or claiming success from a stroke count, source script, or completed tool call.

Ask for feedback on a coherent sketch or a clearly scoped study. If the user says to finish the sketch before requesting feedback, complete that pass first. Keep questions focused on the decisions that remain unresolved.

Treat criticism as direction for the active picture. Identify the underlying issue accurately: anatomy, proportions, contour control, staging, style fidelity, or rendering. A complaint about amateur draftsmanship calls for construction work. If the foundations repeatedly fail, save the pass and restart from the reference and proportions.

Revise the pencil drawing and inspect it again. Get approval of the sketch before developing the final painting. Carry an existing approval forward; a new approval is needed when a substantial redesign reopens the composition or pose, unless the user has already authorized proceeding.

## Develop and deliver the final

Use the approved pencil construction as the basis for refined contours, value and color shapes, lighting, and environment detail. Keep the reference visible in the evaluation: style belongs to the shapes and drawing decisions as well as the palette.

Work in focused native batches with visual checkpoints. Preserve the approved sketch and significant revisions as editable project files. Read [CLI craft and recovery](references/cli-craft.md) when planning marks, handling pauses, or recovering a cleared canvas.

Inspect the completed frame and focal details before calling it finished. Export the PNG and save the native project. Report the actual stage and any unresolved drawing issue candidly. A finished sketch is a reviewable milestone; the final painting remains outstanding until it has been developed and checked.
