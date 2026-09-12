# ==============================================================================
# Codesketch Studio Production Reconstruction Specification
# ==============================================================================
# User Approval Date: 2026-09-11
# Author: Gemini 3.8 Flash High (Creative & Writing Designer Agent)
# Governance: FROZEN BASELINE REFERENCE SPECIFICATION — WRITING ONLY
# Role: Implementation Acceptance Specification (Mockup remains frozen)
# Technical Baseline Corrections from User Review (2026-09-11; Visual Approval Pending):
# Note: Summarized feedback guides technical corrections; new explicit visual approval remains pending.
#   - Feedback dragging: starts empty, live drag marquee before pointerup, fixed opposite anchor on resize, grab offset on move
#   - Layer renaming: inline canonical edit committing once on Enter/blur, cancel on Escape, draft preservation, document generation fences
#   - Ordinal suppression: numeric-token names suppress generated ordinal without stored text rewriting
#   - Comment styling: unboxed reference comment rows with selected-only accent, title + bounds, real lifecycle status
#
#
# Exact Frozen Reference Paths:
#   - Isolated Repository References:
#       * docs/reference-mockup/index.html
#       * docs/reference-mockup/overflow_demo.html
#   - Designer Origin Mockup:
#       * /private/tmp/codesketch-designer-20260910-fresh/artifacts/mockup/index.html (port 8088)
#   - Architectural Plan:
#       * docs/plans/architect/studio-reconstruction.md
#   - Interface Standards:
#       * docs/standards/interface.md
#   - Epic Task Hierarchy:
#       * Authoritative task tree tracked in manager's bd tree under epic paint-2y5
#   - Visual Artifacts:
#       * live_both_thin_scrollbars.png
#       * crop_both_thin_scrollbars.png
#       * pure_custom_font_studio.png
#       * crop_new_layer_06.png
#       * live_red_stroke_layer06.png
#
# Production State vs Demonstration Fixture Distinctions:
#   - Demonstration Data as Test Fixtures: The mockup's seeded 6 layers (00 to 05), 12 critique
#     frames, and 24 project comments are explicitly treated as Given test fixtures in these
#     scenarios to test high-density rendering, clipping, and scrolling. Clean initial production
#     documents load without hardcoded illustrative data.
#   - Real Production State: Production connects to live document storage (real project.save JSON
#     download and server recovery); real stroke recording attached to actual document layers;
#     real review notes where 'ACK' status strictly requires explicit autonomous agent acknowledgement
#     (agent-only). Active filter strictly selects unresolved items, defined as status !== 'resolved'
#     (covering open, acknowledged, and addressed).
#   - Transport: Relies on HTTP polling (StudioApi sequence and 100ms polling loop); no WebSockets.
#   - Viewport Overlay Coordinate Mapping: The workspace operates in fixed 1000x700 design units.
#     The canvas viewport scales uniformly to fit the window with devicePixelRatio handled separately.
#     Underlying document coordinates are never remapped during scaling, panning, or collapse.
# ==============================================================================

Feature: Codesketch Studio Reconstruction
  As a digital artist and design reviewer
  I want a tactile, zero-CLS native studio workspace with custom vector typography
  So that I can paint on multi-layer canvases and collaborate on spatial reviews without visual distraction

  Background:
    Given the studio application is initialized in an isolated 1000x700 container
    And the canvas drawing engine is ready with default dark backdrop "#0F172A"
    And the transport is configured with StudioApi HTTP polling

  # ============================================================================
  # Section 1: Studio Geometry, Sizing, Viewport Mapping & Edge Drag Constraints
  # ============================================================================

  Scenario: Studio container and widescreen canvas base geometry
    Given the studio is loaded in default expanded sidebar mode
    Then the root studio container width is 1000 pixels and height is 700 pixels
    And the drawing canvas workspace occupies x from 0 to 740 pixels and y from 0 to 700 pixels
    And the inspector sidebar panel occupies x from 740 to 1000 pixels with width 260 pixels
    And the canvas cursor is set to crosshair

  Scenario: Viewport overlay coordinate mapping scales uniformly without remapping document data
    Given the available browser viewport has dimensions 1400 by 980 pixels with devicePixelRatio 2.0
    When the studio container scales uniformly to fit the viewport
    Then the rendered scale factor is calculated as Math.min(1400/1000, 980/700) equal to 1.4
    And the internal canvas pixel backing store is allocated at 2000 by 1400 pixels for retina sharpness
    And internal pointer coordinates and document vector marks map linearly to 1000x700 design units
    And no document stroke coordinates or spatial comment bounds are remapped or mutated by viewport scaling
    And no auxiliary zoom, pan, or hand tool controls participate in document geometry

  Scenario: Sidebar panel collapse expands canvas to full width
    Given the studio sidebar is expanded with canvas width 740 pixels
    When the human clicks the collapse button at x 958 and y 11
    Then the sidebar collapses and the canvas width expands to 1000 pixels
    And the full 1000-pixel document artwork is revealed without remapping document data
    And an expand studio button appears at x 896, y 12 with width 94 pixels
    When the human clicks the expand studio button
    Then the sidebar expands to width 260 pixels and canvas width returns to 740 pixels

  Scenario: Drawing stroke edge clamping keeps marks within canvas boundaries
    Given the sidebar is expanded with canvas boundary at x 740 pixels
    When the human begins drawing a stroke at x 700 and drags past x 745
    Then drawing events beyond x 740 are ignored by the drawing engine
    And no stroke points are appended inside the right sidebar inspector area

  # ============================================================================
  # Section 2: Pure Custom Vector Typography & Semantic DOM Controls
  # ============================================================================

  Scenario: All visible interface typography renders exclusively through vector glyphs
    Given the studio displays tool names, slider metrics, layer names, and comment labels
    Then zero HTML paragraph, span, or heading text elements exist inside the canvas container
    And all interface lettering is rendered via vector stroke paths from createVector(ctx).text()
    And stroke lineCap and lineJoin for typography are set to "round"
    And glyph scale and character spacing scale proportionally without browser font rasterization

  Scenario: Glyph typography supports required character sets and wrapping methods
    Given the vector subcontext creates a vector context via createVector(ctx)
    Then vector path definitions exist for uppercase letters A through Z and digits 0 through 9
    And vector path definitions exist for symbols colon, hyphen, slash, plus, hash, brackets, parentheses, percent, period, comma, equals, angle brackets, pipe, ampersand, and exclamation mark
    And createVector(ctx).wrap() wraps text within specified pixel widths
    And createVector(ctx).measure() returns text width as a number
    And whitespace is rendered as a spatial horizontal advance without stroke marks

  Scenario: Persistent invisible semantic DOM backing elements support keyboard, IME, and clipboard
    Given visible interface controls are rendered via canvas vector paths
    Then persistent invisible semantic DOM elements exist matching each control descriptor bounding box
    When the human tabs through the interface using the keyboard
    Then keyboard focus traverses semantic button and slider elements in document order
    And a custom vector focus ring renders on the canvas surface around the focused control
    When the human pastes text or inputs multi-byte IME characters into an active comment input
    Then the semantic DOM input receives the clipboard or IME payload and updates the control descriptor

  # ============================================================================
  # Section 3: Journey 1 - Canvas Drawing, Tool Properties, Eraser & Palette
  # ============================================================================

  Scenario Outline: Selecting drawing tools updates active tool state
    When the human clicks the "<ToolButton>" button at top 70 pixels
    Then active tool becomes "<ToolName>"
    And the tool label "<ToolName>" renders highlighted in accent color "#0284C7"
    And other tool labels render in inactive slate color "#94A3B8"

    Examples:
      | ToolButton   | ToolName |
      | btnToolInk    | INK      |
      | btnToolPencil | PENCIL   |
      | btnToolMark   | MARK     |
      | btnToolErase  | ERASE    |

  Scenario: Dragging stroke property sliders modulates brush dynamics
    Given the default brush size is 14 pixels, opacity is 100 percent, and smoothing is 75 percent
    When the human drags the size slider at y 130 to 50 percent of its track
    Then the active brush size becomes 50 pixels
    And the size readout displays "50 PX" rendered in vector glyphs
    When the human drags the opacity slider at y 156 to 80 percent of its track
    Then the stroke opacity becomes 80 percent
    And the opacity readout displays "80%"
    When the human drags the smoothing slider at y 182 to 90 percent of its track
    Then the smoothing value becomes 90 percent

  Scenario: Stroke smoothing uses canonical renderer plus deterministic local manual-stroke smoothing
    Given active tool is "INK" with smoothing 75 percent
    When the human draws a curved stroke across canvas points (100, 150), (140, 220), (200, 240)
    Then deterministic local manual-stroke smoothing calculates smoothed curve points
    And the real-time drawing preview renders using those exact smoothed points
    When pointerup occurs
    Then the stroke committed to the canonical artwork store contains those exact same smoothed points

  Scenario: Eraser performs per-layer alpha transparency with bounded effective size
    Given the active tool is "ERASE" and selected brush size is 60 pixels
    Then the effective eraser size is calculated as Math.min(100, 2 * 60) which equals 100 pixels
    When the human erases over existing marks on active layer "03"
    Then the marks on layer "03" are cleared down to transparent alpha using destination-out blending
    And artwork marks on underlying layer "02" remain completely visible through the erased area

  Scenario: Palette quick chip selection updates active pigment
    Given the palette displays 8 preset chips at y 222
    When the human clicks chip 6 for Cadmium Red
    Then the active drawing color updates to "#DC2626"
    And chip 6 receives an active outer selection ring of diameter 24 pixels
    And the hex display badge displays "#DC2626" in vector glyphs

  Scenario: Color picker popover enables 2D sat-val, 1D hue, and recent mixes
    When the human clicks the pigment hex trigger button at x 914, y 204
    Then the color picker popover opens at x 476, y 168 with width 248 and height 216 pixels
    And the popover displays a 228x62 pixel 2D saturation-value matrix
    And the popover displays a 228x12 pixel 1D hue spectrum slider from 0 to 360 degrees
    When the human drags the reticle in the 2D field and adjusts the hue thumb
    Then the hex code field updates in real time
    When the human clicks "[ APPLY PIGMENT ]"
    Then the chosen pigment commits to active brush color
    And the pigment is prepended to the 6 recent mixes swatches
    And the color picker popover closes

  Scenario: Eyedropper loupe samples pigment directly from offscreen canonical canvas
    Given the color picker popover is open
    When the human clicks the "[ PICK ]" eyedropper button
    Then canvas cursor changes from crosshair to hidden loupe mode
    And hovering over the canvas renders a 28-pixel circular magnifying loupe
    And the loupe samples pixel color directly from the offscreen canonical canvas without UI chrome interference
    When the human clicks on a lake reflection pixel with color "#38BDF8"
    Then the sampled color "#38BDF8" is captured
    And eyedropper mode deactivates
    And the color picker hex field updates to "#38BDF8"

  Scenario: Real drawing strokes persist attached to active layer
    Given the active layer is "03" and active color is "#2563EB"
    When the human draws a vector stroke across canvas points (100, 200) to (300, 250)
    Then a stroke object is created with layer "03", color "#2563EB", and points coordinates
    And the stroke is committed to the document's real stroke store
    And the stroke renders in real time on the canvas

  # ============================================================================
  # Section 4: Journey 2 - Layer Stack Hierarchy, Opacity & Zero-CLS Overflow
  # ============================================================================

  Scenario: Layer stack visual hierarchy and active selection card (Demonstration Fixture)
    Given a test fixture layer stack is loaded containing layers 05 down to 00
    And layer "03" (LINEART) is selected as active layer
    Then layer "03" renders with an expanded 50-pixel active card in "#F0F9FF"
    And layer "03" displays a 3-pixel vertical accent bar in "#0284C7" on its left
    And layer "03" displays an inline horizontal opacity slider between x 810 and 938
    And inactive layers render with compact 30-pixel row height without opacity sliders

  Scenario: Creating a new layer dynamically appends to document and displays reversed
    Given the highest existing layer number is 5
    When the human clicks the "+ NEW" layer button at x 932, y 252
    Then a new layer with canonical layer ID "layer-6" and presentation label "LAYER 6" is created with opacity 1.0 and visible true
    And the new layer is appended to the canonical document layer collection for bottom-to-top compositing
    And the layer stack displays the collection in reverse order with "LAYER 6" at the top
    And canonical layer "layer-6" is selected as the active layer after acknowledgement
    And the active drawing tool selection is preserved
    And layer "layer-6" expands with the 50-pixel active card and opacity slider
    And layer scroll offset resets to 0 to keep the new layer in view

  Scenario: Sequential layer opacity mutations coalesce slider values
    Given canonical layer "layer-6" is active and contains user strokes with base opacity 1.0
    When the human rapidly drags the layer opacity slider through values 90, 80, 70, to 50 percent
    Then intermediate slider updates coalesce into a debounced mutation targeting canonical layer ID "layer-6"
    And layer "layer-6" canonical opacity property updates to 0.5 and the presentation readout displays "50%"
    And all strokes attached to layer "layer-6" render on the canvas at 50 percent transparency
    And strokes attached to other layers maintain their own respective layer opacities
    And the active drawing tool remains selected throughout the opacity adjustment

  Scenario: Toggling layer visibility hides and restores layer marks
    Given canonical layer "layer-6" contains visible user strokes
    When the human clicks the eye visibility button for layer "layer-6" at x 964
    Then canonical layer "layer-6" visible property becomes false
    And the eye icon renders dimmed with a diagonal slash mark
    And user strokes on layer "layer-6" are hidden from canvas rendering
    When the human clicks the eye visibility button again
    Then canonical layer "layer-6" visible property becomes true
    And the eye icon renders open with white pupil
    And user strokes on layer "layer-6" reappear on canvas

  Scenario: Layer names containing numeric tokens suppress generated ordinal without stored text rewrite
    Given layer 3 has stored canonical name "03 LINEART" and layer 4 has stored canonical name "Layer 4"
    And layer 0 has stored canonical name "BACKGROUND"
    When the layer stack renders row presentation numbers
    Then layer 0 displays the generated zero-padded ordinal "00" followed by "BACKGROUND"
    But layer 3 displays "03 LINEART" suppressing the duplicate generated "03" ordinal
    And layer 4 displays "Layer 4" suppressing the duplicate generated "04" ordinal
    And stored canonical layer names in document state remain strictly untouched without text rewriting

  Scenario: Clicking layer name activates inline full canonical edit committing once on Enter or blur and canceling on Escape
    Given a layer row with canonical name "LINEART" is displayed in the layer stack
    When the human clicks the layer name button separate from row selection and visibility
    Then an inline single-line text editor mounts populated with "LINEART" and all text selected
    When the human edits the name to "03 LINEART" and presses Enter
    Then the rename commits once with the full submitted text to the canonical document layer
    And the inline text editor closes
    When the human clicks the layer name again, edits text to "Discarded", and presses Escape
    Then the edit is cancelled without dispatching a rename and the canonical name "03 LINEART" is restored
    When the human clicks the layer name, edits text to "Ink Wash", and clicks outside to trigger blur
    Then blur commits the rename once without duplicate dispatch

  Scenario: Inline layer rename draft survives polling and scrolling while handling save failure and document generation fences
    Given an inline layer rename editor is active with uncommitted draft text "Background Mountains"
    When studio background polling cycles occur or the layer list scrolls
    Then the local draft text "Background Mountains" is preserved across descriptor updates
    When a save failure occurs during rename dispatch
    Then the inline editor remains open with the draft text preserved and does not switch editors
    When instance or document generation rotates establishing a layer mutation fence
    Then pending rename dispatches are rejected as stale and the inline edit is cancelled cleanly


  Scenario: Layer stack overflow scrolls within bounded 200px viewport without shifting comments
    Given a test fixture stack of 8 layers with total content height exceeding 200 pixels
    Then the layers touch container and canvas rendering are strictly clipped between y 272 and 472
    And the comments section header remains stable at y 476 with zero layout shift
    When the human scrolls the mouse wheel over the layers section
    Then layerScrollY updates smoothly within calculated scroll bounds
    And layer rows scroll vertically within the 200-pixel viewport
    And touch targets outside y 272 to 472 are unmounted to prevent overlap

  Scenario: Layer stack displays unified thin 4px paint-stroke scrollbar
    Given the layer stack content height exceeds the 200-pixel viewport
    Then a floating rounded paint stroke scrollbar thumb renders at x 994
    And the scrollbar stroke size is 4 pixels and color is slate "#94A3B8"
    And the scrollbar track spans y 276 to 468
    And the thumb height scales proportionally to visible layer content ratio

  # ============================================================================
  # Section 5: Journey 3 - Spatial Feedback Selection, Fenced Review & Replies
  # ============================================================================

  Scenario: Area feedback mode starts empty without initial marquee or composer
    Given the studio is loaded in expanded sidebar mode
    When the human activates area feedback mode
    Then feedback mode opens in empty state with selection null and selectedCommentId null
    And zero selection marquee renders on the canvas and zero composer card is mounted
    And the canvas drawing surface is ready for pointer drag selection

  Scenario: First drag in empty feedback mode shows live selection box before pointerup then mounts composer
    Given area feedback mode is active in empty state
    When the human presses pointer down on the canvas at (120, 160) and drags to (440, 350)
    Then before pointerup a live dashed selection marquee and dimension badge "[ 320 X 190 PX ]" render on the canvas
    And the feedback composer card and text draft control remain unmounted during pointer drag
    When pointerup occurs at (440, 350)
    Then the selection bounds commit to x 120, y 160, width 320, height 190
    And the anchored feedback composer card mounts with the editable critique textarea

  Scenario: Moving feedback selection marquee retains dimensions and relative pointer grab offset
    Given an active feedback selection marquee exists at x 100, y 100 with width 200 and height 100
    When the human presses pointer down inside the marquee at (140, 130) and moves to (240, 230)
    Then move retains the marquee width 200 and height 100 while preserving the relative pointer grab offset (40, 30)
    And the marquee bounds update to x 200, y 200 with width 200 and height 100 clamped within visible artwork bounds

  Scenario: Resizing feedback selection marquee preserves fixed opposite anchor across crossing
    Given an active feedback selection marquee exists at x 100, y 100 with width 200 and height 100
    When the human drags the southeast resize handle at (300, 200) back across the northwest corner to (50, 50)
    Then resize maintains the northwest corner (100, 100) as the fixed opposite anchor throughout the gesture
    And positioning the pointer at the exact anchor coordinate maintains a one-unit preview before crossing
    And moving past the anchor flips the selection across the fixed opposite anchor without losing anchor origin
    When pointerup occurs at (250, 150)
    Then the selection commits with canonical bounds referencing the original fixed opposite anchor

  Scenario: Canvas spatial selection marquee and edge dragging with rectangle-aware bounds
    Given area feedback flow is open in expanded sidebar mode
    And a completed non-zero drag has established an active selection marquee
    Then a selection marquee displays on canvas with blue wash "rgba(2, 132, 199, 0.14)"
    And the marquee displays an alternating dashed two-tone border in "#0284C7" and "#FFFFFF"
    And 4 corner handles render with 8x8 pixel white squares
    And a top dimension badge renders displaying live dimensions "[ 320 X 190 PX ]"
    When the human drags inside the selection marquee of width 320 and height 190
    Then the marquee origin x is clamped between 0 and 420 so bounds remain within visible artwork region 0 to 740
    And the marquee origin y is clamped between 0 and 510 so bounds remain within visible artwork region 0 to 700
    And the dimension badge and corner handles move synchronously

  Scenario: Selection marquee dragging in collapsed sidebar mode spans full width
    Given area feedback flow is open and the sidebar is collapsed
    And a completed non-zero drag has established an active selection marquee
    When the human drags a selection marquee of width 300 and height 200 toward the right edge
    Then the marquee origin x is clamped between 0 and 700 so bounds span up to x 1000
    And the full 1000-pixel document bounds are available for spatial feedback

  Scenario: Inspecting stored comments preserves original document-space bounds
    Given a stored comment has original document-space bounds x 800, y 100, width 150, height 120
    When the comment is selected and inspected
    Then the comment's stored coordinates are preserved without presentation clipping or rewriting

  Scenario: Anchored popover composer card displays context and frame stepper
    Given the selection marquee is positioned at x 120, y 160 with width 320 and height 190
    Then the feedback composer card anchors at x 452, y 156 with width 248 and height 178
    And a pointer arrow connects the marquee right edge to the composer card
    And the card header displays a frame cycling stepper "[<]" and "[>]"
    And the card displays target coordinate bounds and layer associations
    And an editable critique textarea is mounted inside the card

  Scenario: Submitting critique enforces epoch fencing and authorizes correction
    Given a confirmed review pause has captured generation, art revision, and control epoch
    And critique text "SOFTEN RIDGE EDGES AND LIGHTEN WASH" is entered in model.review.text
    When the human clicks the "[ SEND ]" button in the composer card
    Then the review request is dispatched carrying the captured generation, art revision, control epoch, and a unique request ID
    And approved SEND itself authorizes execution continuation for the submitted correction without a separate resume step
    And a pre-existing pause is superseded by this explicit human SEND but never by background automation
    And the note enters pending review state awaiting agent response

  Scenario: Subsequent intentional pause halts execution after critique submission
    Given a critique has been submitted authorizing execution continuation
    When an intentional human pause is subsequently dispatched
    Then the intentional pause halts autonomous execution

  Scenario: Artwork change or later pause rejects stale critique submission and preserves draft
    Given a confirmed review pause captured initial generation, art revision, and control epoch
    And critique text "REFINE WATER HIGHLIGHTS" is entered in model.review.text
    When artwork changes occur or a subsequent intentional pause is dispatched before submission
    And the human clicks the "[ SEND ]" button
    Then the stale critique submission is rejected
    And the draft critique text in model.review.text is preserved for editing

  Scenario: Uncertain transport retry re-dispatches with original request ID and payload
    Given a critique submission encounters an uncertain network or transport failure
    When the retry is dispatched
    Then the retry retains the original request ID and original payload
    And the draft critique text in model.review.text remains intact

  Scenario: Real agent acknowledgement updates review note status in production
    Given a pending critique note exists in the document review collection
    When a genuine autonomous agent acknowledgement is received from the review service
    Then the review note status updates from "OPEN" to "ACKNOWLEDGED"
    And the status pill in the comments list updates to "ACK" in slate "#F1F5F9"
    And ACK status is strictly restricted to autonomous agent acknowledgement and rejected for human responses
    And no fake or illustrative demonstration statuses are seeded in production

  Scenario: Comment threads support optional bounded replies and native CLI reply operation
    Given an acknowledged review comment "#21" exists in the document with generation 1 and seq 12
    When the native CLI command from apps/paint/internal/cli "paint comments reply 21 'Edges softened in rev 4' --generation 1 --seq 12 --request-id 'req-reply-21-1'" is executed
    Then a reply record with fields author, text, at, id, and requestId is appended to comment "#21"
    And the comment enforces bounds of maximum 32 replies per comment and 2000 characters per reply
    And author is set to "agent" or "human"
    And the comment card in the studio inspector displays the reply live with author and timestamp
    And optional replies are current semantic data in document schema without compatibility migration adapters

  Scenario: Dismissing feedback composer card hides selection overlays
    Given the feedback composer card and marquee are displayed
    When the human clicks the close button "[X]" or "[ CANCEL ]"
    Then the feedback composer card and selection marquee are hidden
    And the canvas returns to unobstructed drawing mode

  # ============================================================================
  # Section 6: Journey 4 - Comments Review Navigation & Zero-CLS Gutter
  # ============================================================================

  Scenario: Comments list viewport renders review items with status badges (Demonstration Fixture)
    Given a test fixture review collection with 24 comments is loaded
    Then comments are displayed in the bottom sidebar viewport between y 514 and 654
    And each comment card renders at fixed width 216 pixels between x 752 and 968
    And active comments display an "ACTIVE" pill in light blue "#E0F2FE"
    And acknowledged comments display an "ACK" pill in slate "#F1F5F9"
    And each row displays combined comment number and text, spatial bounds coordinates, and actual status
    And comment thread replies retain author attribution within stored thread state

  Scenario: Unboxed reference comment rows render with selected-only accent, title, bounds, and real lifecycle status
    Given the comments review list is loaded in the sidebar
    Then unselected comment rows render unboxed with a hairline divider at fixed width 216 pixels between x 752 and 968
    And unselected comment rows render without background card fill or vertical accent bars
    And each comment row displays title with comment number, text, and spatial bounds coordinates
    And each comment row displays its real lifecycle status badge in a rounded status pill
    When the human clicks a comment row to select it
    Then only the selected comment row receives a background card in "#F0F9FF" and a 3-pixel vertical accent bar in "#0284C7"

  Scenario: Active filter strictly selects unresolved comments
    Given the comments list contains comments with status "open", "acknowledged", and "addressed", alongside resolved comments with status "resolved"
    When the human clicks the "[ 4 ACTIVE ]" filter chiclet
    Then all comments with status !== 'resolved' (including open, acknowledged, and addressed) are rendered in the viewport
    And resolved comments with status "resolved" are excluded from display
    And the active filter chiclet renders with highlighted styling
    When a human reviewer explicitly marks an addressed comment as resolved
    Then the comment transitions to status "resolved" and is removed from the ACTIVE filter view

  Scenario: Zero Cumulative Layout Shift invariant verified via layout-shift performance observer
    Given a PerformanceObserver is attached to observe "layout-shift" entries
    And comment cards have fixed width 216 pixels between x 752 and 968
    And the comments section has a permanent 24-pixel reserved gutter between x 968 and 992
    And the thin 4-pixel scrollbar axis is positioned at x 994 explicitly
    When the human clicks the "[ 4 ACTIVE ]" filter chiclet
    Then the comments list filters to only active items without changing card width (fixed at 216px)
    When the human clicks the "[ 24 ALL ]" filter chiclet
    Then all comments load and the scrollbar thumb appears in the reserved gutter
    And the card width remains strictly 216 pixels
    Then the accumulated Cumulative Layout Shift across filter toggles is strictly 0.0000
    And no fake CLS text is rendered; layout stability is verified by fixed geometry

  Scenario: Comments scrollbar matches thin 4px paint stroke aligned at x 994
    Given comment cards exceed the 140-pixel viewport height
    Then a floating rounded paint stroke scrollbar thumb renders at x 994
    And the scrollbar stroke size is strictly 4 pixels with round caps
    And the scrollbar thumb color is slate "#94A3B8"
    And the scrollbar track spans y 518 to 650
    And the scrollbar aligns on the exact same vertical track x 994 as the layers scrollbar above
    And direct dragging on the dedicated touch zone between x 980 and 1000 updates scroll position

  Scenario: Clicking a comment card focuses spatial marquee on canvas
    Given comment card "#21 CRAG LINEART" is displayed with bounds (120, 160 -> 440, 350)
    When the human clicks comment card "#21"
    Then card "#21" receives selected card styling with accent bar in "#0284C7"
    And the canvas selection marquee jumps to bounds x 120, y 160, width 320, height 190
    And the feedback composer card anchors next to the marquee with frame data loaded

  # ============================================================================
  # Section 7: Journey 5 - Studio Workspace Controls, SAVE & Keyboard Interaction
  # ============================================================================

  Scenario: Real project SAVE execution with visual confirmation
    When the human clicks the "[ SAVE ]" button at x 872, y 11
    Then the studio invokes real document serialization via project.save
    And triggers a browser download of the authentic v2 document JSON
    And the header displays a temporary saved confirmation state for 2.5 seconds
    And after 2.5 seconds the saved state reverts to standard idle state

  Scenario: Graceful recovery upon project SAVE failure
    Given a storage or network failure occurs during document save
    When the human clicks the "[ SAVE ]" button
    Then the studio displays a prominent error indicator in the header
    And the local in-memory document state and uncommitted edits are fully preserved

  Scenario: Committed PNG export renders on isolated surface containing committed marks only
    Given the header exposes only "[ SAVE ]" in the final baseline UI
    And in-flight brush strokes are being drawn and a feedback composer preview is active
    When a committed PNG export is invoked through the native CLI or exporter engine
    Then the export renders the committed document on an isolated surface through the committed exporter
    And the exported PNG pixels contain committed marks only, strictly excluding in-flight stroke previews, playback overlays, and local UI chrome

  Scenario: Header area feedback button toggles feedback flow
    Given the feedback card and selection marquee are hidden
    When the human clicks the "[ FB ]" button at x 818, y 11
    Then area feedback mode opens in empty state with zero initial selection and no composer card
    When the human clicks the "[ FB ]" button again
    Then area feedback mode closes and canvas returns to unobstructed drawing mode

  Scenario: Keyboard activation of layer controls
    Given a layer row has keyboard focus
    When the human presses Enter or Space
    Then the focused layer becomes the active layer
    When keyboard focus is on the layer visibility button and Enter or Space is pressed
    Then the layer visibility toggles without changing the active layer selection
