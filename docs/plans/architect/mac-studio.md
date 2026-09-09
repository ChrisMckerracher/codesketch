# Mac studio visual pass

The user requests the look and feel of a polished native Apple creative application. The initial painting tool is complete at commit `115ac1c`; this pass changes its presentation and interaction hierarchy.

## Design contract

Use a compact document toolbar, a neutral canvas work surface, and quiet aligned inspectors. System typography and small monochrome icons support a working desktop instrument. Replace prominent branding with a modest application/document title. Consolidate status into unobtrusive text. Present tools as compact selections, colors as useful swatches, and layers as a familiar topmost-first list. Playback and notes stay easy to reach. Follow system light/dark appearance. Keep all existing painting and agent controls functional.

The existing native browser/Node implementation remains the rendering and transport substrate for this visual pass. Package distribution and runtime migration are separate architecture decisions. The visual design is driven by the Mac application experience.

## Ownership and acceptance

Agy implements the presentation in public styles, markup, and narrowly scoped studio labels/icons. The lead reviews screenshots and interactions. Opencode performs a bounded independent review of state/control regressions if needed. All agent requests use Herdr. Cross-context boundaries and the zero-dependency contract remain in force.

Acceptance: a coherent Mac creative-app workspace at desktop size, full canvas bounds, legible system light/dark appearance, clear tool selection and layer rows, functional painting/playback/notes/export, passing existing native and browser checks, and source files below 300 lines.
