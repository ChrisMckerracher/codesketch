# Visual Reference Study: Figma UI3 & Codesketch Mockup Architecture

**Purpose**: Creative UI design mockup (1000 × 700) for Codesketch based on the Figma UI3 visual language.  
**User Journey Under Study**: Clicking a paintbrush, logical grouping, tool properties, and target layer.  
**Scope Note**: This document serves purely as visual design reference analysis for a UI mockup exploration. Elements depicted in the design mockup do not imply implemented Codesketch product scope.

---

## 1. Actual Observations Visible in Figma Reference Screenshots

The following observations are taken directly from the inspected reference images:

### A. Anatomical Structure & Layout Regions (`figma_help_overview.png`)
- The interface is organized into five distinct regions over a light neutral background (`#F5F5F5`):
  - **(A) Navigation Bar**: Leftmost vertical rail / header containing workflows, logo, and file actions.
  - **(B) Left Sidebar**: Pages list and Layers tree panel.
  - **(C) Canvas**: Central open workspace where design objects/frames reside.
  - **(D) Right Sidebar**: Properties inspector (Design and Prototype panels) and sharing/collaboration actions.
  - **(E) Toolbar**: Centered floating pill containing object creation and selection tools.

### B. Floating Toolbar & Active State (`figma_help_toolbar.png`, `figma_ui3_overview.jpg`)
- **Structure**: Rounded horizontal pill container with white fill, 1px border, and elevation shadow floating centered near the bottom edge.
- **Active State Indicator**: The currently active tool (`Select / Pointer`) is styled with an inverted solid vibrant blue squircle (`#0D99FF` / `#0C8CE9`) with a white icon.
- **Tool Hierarchy**:
  - Selection (Pointer with dropdown caret)
  - Layout (`#` Frame tool with dropdown caret)
  - Shapes (Rectangle with dropdown caret)
  - Vector creation (Pen / Pencil tool with dropdown caret)
  - Text (`T`)
  - Collaboration (Comment bubble)
  - AI / Actions (`✦` Sparkle icon)
  - Mode Switch: Segmented switch on the far right toggling Dev Mode (`</>`).

### C. Right Properties Panel (`figma_help_properties.png`, `figma_ui3_ec54.png`, `figma_ui3_f934.png`)
- **Header & Collaboration**: Circular user avatar stack, Play/Present icon, and primary blue "Share" button (`#0C8CE9`).
- **Tab Bar**: Segmented tabs for `Design` and `Prototype` alongside a zoom readout (`100% ▾`).
- **Contextual Selection Cards**:
  - For a selected frame/vector object, the panel shows:
    - **Position & Alignment**: 6 alignment icon buttons in a 2-group row (`|<`, `>|<`, `>|`, `-^-`, `-v-`, `_v_`), followed by numeric coordinate inputs (X, Y, Rotation, Flip).
    - **Dimensions & Layout**: Width (W), Height (H), and `Clip content` checkbox.
    - **Appearance**: Opacity percentage (`100%`), corner radius, and visibility eye toggle.
    - **Fill & Stroke**: Color swatch pill (e.g. `#E4FF97`, 100% opacity), hex code, and `+`/`-` actions.
- **Sliders & Inputs (`figma_ui3_f934.png`)**:
  - Figma's control language features thin rounded horizontal tracks with circular thumb knobs:
    - Track A: Continuous progress bar with blue fill and white circular handle.
    - Track B: Stepped track with discrete notch dots.
    - Track C: Continuous color spectrum bar with white circular handle.

### D. Left Sidebar: Layers & Hierarchy (`figma_help_left_sidebar.png`, `figma_ui3_overview.jpg`)
- **Document Header**: File title (e.g. "Earthling Mobile Refresh", "Trivet") with dropdown caret.
- **Pages Section**: Expandable accordion with a `+` action button, listing individual pages (`Overview`, `Copy Iterations`).
- **Layers Tree**: Hierarchical tree with nested rows, indentation, frame icons (`#`), component diamonds, folder icons, and layer name labels. Selected rows are highlighted with a soft blue/gray tinted background.

---

## 2. Proposed Codesketch Painting UI Translation

Figma’s design system is built for vector UI design. Codesketch adapts Figma's visual density, spacing, and control hierarchy for a **native painting workflow** based on the specified user journey:

| Figma UI3 Pattern | Codesketch Painting Adaptation | User Journey Mapping |
|---|---|---|
| **Bottom Floating Pill** | Floating tool pill centered at `X: 330, Y: 628, W: 340, H: 52` | **Clicking a paintbrush**: The Paintbrush button is active with primary blue squircle fill (`#0D99FF`) and white brush icon. |
| **Right Inspector Cards** | Tool Properties Panel (`X: 762, Y: 56, W: 224, H: 630`) | **Tool properties**: Displays Paintbrush preset ("Studio Inker"), brush modes (Brush, Pencil, Marker, Eraser), Size slider (14px), Flow slider (100%), Smoothing slider (75%), and Cobalt Blue swatch (`#2563EB`). |
| **Contextual Target Control** | Dedicated Target Layer Card in Inspector (`Y: 432`) | **Target layer**: Clear destination selector (`Strokes commit to: # Lineart (Pass 03)`), ensuring user always knows where brush marks land. |
| **Left Sidebar Layers Tree** | Scene & Layer Hierarchy Panel (`X: 14, Y: 56, W: 224, H: 630`) | **Logical grouping**: Folders and layered structure (`Artwork Group`), with the target layer (`# Lineart [TARGET]`) highlighted with active blue styling in sync with the Inspector. |
| **Center Workspace Canvas** | Dedicated Painting Artboard (`X: 252, Y: 56, W: 496, H: 556`) | **Painting in action**: Shows the active 14px cobalt brush stroke in progress on the artboard under a reticle cursor (`14px • 100% flow`). |

*Design note*: Secondary UI elements (document title, export buttons, visual status indicators) are included to provide realistic visual framing matching Figma's density, but do not imply implemented runtime product features beyond the current Codesketch painting engine.
