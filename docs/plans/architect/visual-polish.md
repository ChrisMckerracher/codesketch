# Visual polish audit and delivery (paint-at5)

Status: Delivered. Approved findings shipped across three final beads —
`paint-at5.1` (focus rings, contrast tokens), `paint-at5.2` (tool/palette
semantics), `paint-at5.3` (header clusters, neutral Export, welcome surface).
This document records the final behavior with measured evidence; superseded
intermediate recommendations are not carried forward.

## References

1. **Apple macOS Human Interface Guidelines: Toolbars** —
   [developer.apple.com/design/human-interface-guidelines/toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars) (accessed September 2026).
   Quiet neutral chrome and cohesive segmented control groups. Specific
   toolbar heights (50px) are Codesketch design choices.
2. **W3C WCAG 2.2 Understanding Contrast Minimum** —
   [w3.org/WAI/WCAG22/Understanding/contrast-minimum.html](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
   Informative text requires 4.5:1; disabled controls are exempt.
3. **Codesketch Interface Standard** —
   [../../standards/interface.md](../../standards/interface.md). Polished Mac
   creative instrument, prominent canvas, system font, compact desktop
   controls, light/dark support.
4. **Figma Blog: Our Approach to Designing UI3** —
   [figma.com/blog/our-approach-to-designing-ui3](https://www.figma.com/blog/our-approach-to-designing-ui3/)
   (published October 1, 2024 — historical design rationale only, not current
   2026 UI). Figma itself has since reverted floating panels toward fixed,
   resizable panels; Codesketch keeps its fixed, resizable three-pane layout.
   No floating-panel direction applies.

## Final findings and shipped behavior

| Finding | Shipped behavior | Evidence |
|---|---|---|
| Focus ring suppression on `.range-slider` and `.speed-select` | `outline: none` removed; global `:focus-visible` ring applies | Real keyboard Tab checks assert `activeElement`, `:focus-visible`, and computed `2px solid` outlines — light `rgb(0, 122, 255)`, dark `rgb(10, 132, 255)` (at5.1). Screenshots alone do not prove keyboard focus; the keyboard assertions are the evidence. |
| Dark informative text below 4.5:1 | Final dark tokens: secondary `#b8b8be`, tertiary `#a8a8ae`; status idle follows tertiary. The earlier suggestion `#8e8e93` did **not** clear the tinted control surface (≈`#38383a`, ≈4.0:1) and was never shipped | Measured on composited surfaces: `#b8b8be` 8.045:1 on `#222224`, 7.454:1 on `#28282a`, ≈5.35:1 on `#38383a`; `#a8a8ae` 6.713:1 on `#222224`, ≈4.88:1 on `#38383a` (at5-1-measurements.json) |
| Light tertiary below 4.5:1 on white | Final light tokens: secondary `#59595f`, tertiary `#6e6e73` | Measured: secondary 6.956:1 on `#ffffff`, 6.838:1 on `#fdfdfd`; tertiary 5.071:1 on `#ffffff`. Hierarchy preserved: primary > secondary > tertiary in both appearances |
| Tool/palette containers used invalid radiogroup semantics over native buttons | Ordinary labelled groups (`role="group"`); every tool/palette/background button carries `aria-pressed`, synchronized on click, keyboard shortcuts, and custom color selection (initial state included) | Browser keyboard/click assertions in `tests/browser/studio.mjs` section 9 and at5.2 verification, light+dark at 1440/1100 |
| Export filled with saturated accent; status pill floated between title and actions | Title plus status/queue cluster at the header's left; action groups anchored right; 50px toolbar height kept; Export is a neutral `.btn-action` with label, icon, and keyboard focus preserved | Header geometry and no-overflow checks at 1440/1100 light+dark (at5.3) |
| Hardcoded white welcome surface in dark appearance | `.welcome-btn` follows the neutral panel tokens (`--mac-panel-bg` surface, control border, appearance-correct text) within its existing rule | Dark-appearance captures |

## Guidance

- **Icons**: all generated SVGs use `stroke-width="2"` — that is 2 SVG user
  units in the 24-unit viewBox, not 2 CSS px. Preserve the SVG-unit value.
- **Contrast requirement**: informative text ≥ 4.5:1 against the actual
  composited surface (including translucent control tints), per the W3C
  reference above; disabled controls are exempt.
- **Playback controls**: Play/Step/Clear occupy the top row and the full-width
  visible Skip to end occupies the second row; the speed select keeps its
  native dropdown indicator.
- **Custom color/background picker rows**: normalized to 28px with native
  inputs preserved.
