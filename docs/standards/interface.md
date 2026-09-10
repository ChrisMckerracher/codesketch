# Mac application design

Codesketch presents a compact Mac creative workspace with the painting as its
main content. The current shell has a quiet global header, a Layers/Feedback
sidebar, a central canvas stage, a contextual inspector, a playback HUD, a
tool dock, and a feedback composer. Compact widths expose the sidebars through
rail-triggered drawers.

Use the system font, neutral light/dark surfaces, thin separators, restrained
shadows, compact desktop controls, and system-blue selection accents. Reserve
strong color for artwork, swatches, and state dots. Keep the canvas centered on
its neutral work surface with visible bounds. Use familiar labels such as
Open, Save, Export, Layers, Feedback, Fit, and 100%.

Every visible action is a semantic button or control with native keyboard,
focus, hover, selected, disabled, and pointer states. Control icons use inline
SVG markup declared in `public/index.html` or emitted by the owning module.
The separately served `public/icon.svg` is the favicon/runtime asset; it is a
different mechanism. Keep both routes explicit and local.

The viewport supports Fit, 100%, zoom, and Hand. Fit computes the available
stage geometry and clamps the rendered scale to a minimum of 5%; manual zoom
has a 25% lower bound. The HUD keeps its status text in a stable-width field
so Idle, Playing, Paused, and Pausing… do not shift adjacent controls.

The application model is the presentation boundary: the viewport receives the
model store so it can calculate transforms and pointer coordinates, while
mounted components receive immutable model values and an intent dispatcher.
The application fans every model update to all mounted components.

Review and painting share the confirmed pause contract. Beginning review waits
for a same-instance, same-generation paused snapshot at the acknowledged
control epoch. Leaving review cancels it before a paint-tool return; the
authoritative pause and any pending review draft remain intact until the
corresponding state transition resolves. A closed review returns synchronously
through the local application route.

Substantial UI work requires a user visual checkpoint. Before implementation
begins, present a concrete mockup of the hierarchy and key user journey,
request the user's critique, and iterate until the user gives explicit visual
approval; only then delegate implementation. Automated checks and other agents
never establish user design approval. When closing design or polish work,
record technical verification and user visual acceptance separately.

Inspect desktop and compact widths in light and dark appearance. Verify actual
canvas pixels, status labels, keyboard focus, and pointer behavior. Keep the
dependency-free browser implementation and the current-only contracts.

References: [Apple macOS design](https://developer.apple.com/design/human-interface-guidelines/designing-for-macos), [toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars), and [sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars).
