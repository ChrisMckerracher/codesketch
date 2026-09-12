# Codesketch Studio — Responsive Full-Width Preview (Proposed, Awaiting Approval)

- **Status**: Proposed design preview awaiting user approval.
- **Document Distinctions**: Reference artwork region is 740×700px (canonical mountain painting); production document contract remains unchanged at 1000×700px.
- **1440×900 Fit (with 32px Stage Padding)**: Canvas 1080×900px, Sidebar 360×900px, fitScale 1.194285714, artX 98, artY 32, marquee {x: 241, y: 223, w: 382, h: 227}.
- **2560×1440 Fit (with 32px Stage Padding)**: Canvas 2200×1440px, Sidebar 360×1440px, fitScale 1.965714286, artX 373, artY 32, marquee {x: 609, y: 347, w: 629, h: 373}.
- **Canvas Scaling Separation**: Only artwork and spatial marquee rectangle follow artwork fit; stage margins absorb aspect ratio differences.
- **Fixed Composer & Hitboxes**: Fixed 248×178px CSS card; cardInteractiveGroup has position:absolute so input/cancel/send hitboxes exactly overlay the drawn card.
- **Pointer Verification**: Verified actual pointer click into blank field and typing inside fixed 248×178 composer card at both 1440 and 2560.
- **Fixed Controls**: Dimension badge 92×18px, drag pill 58×16px, corner handles 8×8px, Pin #1 ACK (46×16px), Pin #5 ACT (48×16px), Cluster (88×22px).
- **Sidebar Comments**: Unboxed rows with selected accent on #21; displays number plus actual sentence at 10.5px glyph height wordwrapped across 332px row width.
- **Compact Metadata**: Bounds coordinates (0.52 scale) and status pills (46×14px [ACTIVE] / 36×14px [ACK]); redundant titles and authors removed.
- **Artifacts**: `/private/tmp/codesketch-width-preview-20260911/index.html`, `preview-1440x900.png`, `preview-2560x1440.png`, `notes.md`.
