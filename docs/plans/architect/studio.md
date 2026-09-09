# Codesketch studio

## Problem and goals

Agents need a small, explicit drawing vocabulary and immediate visible results. Humans need to observe the process and direct it. Deliver a local, dependency-free painting studio with an agent CLI/API and a polished browser workspace.

## Scope

One shared local 1000 × 700 document; layer visibility and opacity; brush, pencil, marker, and eraser strokes; filled rectangles and ellipses; background fill; undo/redo; animated command queue with pause, resume, step, speed, and clear-pending controls; feedback that pauses execution; project JSON save/load; PNG export; atomic local recovery; and an original landscape demonstration. Natural-language interpretation is supplied by the external agent using the documented API. Remote hosting, accounts, real-time multi-user editing, and generative-image services are outside this release.

## Contracts and flow

Commands are plain JSON with `type`: `stroke`, `rect`, `ellipse`, `fill`, `layer.add`, or `layer.update`. Shapes/strokes specify a layer ID. A stroke has points as `[x,y]` pairs, color, size, opacity, and brush. Shapes have x, y, width, height, color, opacity. Fill sets document background. Layers have id, name, visible, opacity. Default layer ID is `paint`.

Document is `{version:1,width:1000,height:700,background,layers,marks}`. Direction stores command history, cursor, queue, active progress, feedback, playback status and revision. Document replay applies history through cursor; active progress is a transient mark. Validation simulates the complete incoming queue before accepting it. Feedback always pauses the painter. Replacing a queue cancels the partial active stroke and preserves completed work. Browser pointer input pauses playback and commits completed manual marks. History changes clear pending work to maintain a valid document.

HTTP reads session state; writes commands, playback actions, feedback, or projects. Browser polls revisions, renders only changed artwork, and shows queue and feedback. Agent CLI submits JSON files and reads status/feedback. Local recovery records committed history and feedback; queued work restores paused. Canvas renders per layer so erasing respects the target layer.

## Implementation and validation

The lead owns architecture, contracts, review, verification, and delivery. Herdr workers implement the document domain, direction, transport, UI, CLI, and checks through bounded assignments with exact file ownership. The lead delegates application code, tests, and fixes. Native unit tests cover command contracts, replay, atomic rejection, pause/step, feedback, queue replacement, history, project import, and hostile inputs. HTTP tests cover trust boundaries and persistence. Browser checks cover pointer painting, layer compositing, visible playback, pause, feedback, project save/load, export, and responsive layout.

## Risks and decisions

Replay is intentionally bounded to keep local memory and rendering predictable. Large paintings may reach the documented command budget. Persistence failures must be visible. Multiple tabs observe the same session. The local API trusts local processes and rejects cross-origin browser writes. User has explicitly authorized autonomous scoping, decomposition, implementation, and verification of this initial release.
