import json

commands = []

def add_command(cmd):
    commands.append(cmd)

def draw_rect(layer, x, y, w, h, color, opacity=1.0):
    x = max(0, min(1000 - w, x))
    y = max(0, min(700 - h, y))
    w = max(1, min(1000 - x, w))
    h = max(1, min(700 - y, h))
    add_command({
        "type": "rect",
        "layer": layer,
        "x": int(x),
        "y": int(y),
        "width": int(w),
        "height": int(h),
        "color": color,
        "opacity": round(opacity, 2)
    })

def draw_ellipse(layer, x, y, w, h, color, opacity=1.0):
    x = max(0, min(1000 - w, x))
    y = max(0, min(700 - h, y))
    w = max(1, min(1000 - x, w))
    h = max(1, min(700 - y, h))
    add_command({
        "type": "ellipse",
        "layer": layer,
        "x": int(x),
        "y": int(y),
        "width": int(w),
        "height": int(h),
        "color": color,
        "opacity": round(opacity, 2)
    })

def draw_stroke(layer, pts, color="#1E293B", size=2, brush="brush", opacity=1.0):
    clamped_pts = []
    for pt in pts:
        cx = max(0, min(1000, int(round(pt[0]))))
        cy = max(0, min(700, int(round(pt[1]))))
        clamped_pts.append([cx, cy])
    if len(clamped_pts) >= 1:
        add_command({
            "type": "stroke",
            "layer": layer,
            "brush": brush,
            "size": int(size),
            "color": color,
            "opacity": round(opacity, 2),
            "points": clamped_pts
        })

GLYPHS = {
    'A': [[(0,7), (0,2), (2,0), (3,0), (5,2), (5,7)], [(0,4), (5,4)]],
    'B': [[(0,7), (0,0), (4,0), (5,1.5), (4,3.5), (0,3.5), (4,3.5), (5,5), (4,7), (0,7)]],
    'C': [[(5,1), (3,0), (2,0), (0,2), (0,5), (2,7), (3,7), (5,6)]],
    'D': [[(0,7), (0,0), (3,0), (5,2), (5,5), (3,7), (0,7)]],
    'E': [[(5,0), (0,0), (0,7), (5,7)], [(0,3.5), (4,3.5)]],
    'F': [[(0,7), (0,0), (5,0)], [(0,3.5), (3.5,3.5)]],
    'G': [[(5,1), (3,0), (2,0), (0,2), (0,5), (2,7), (4,7), (5,6), (5,3.5), (3,3.5)]],
    'H': [[(0,0), (0,7)], [(5,0), (5,7)], [(0,3.5), (5,3.5)]],
    'I': [[(0,0), (4,0)], [(2,0), (2,7)], [(0,7), (4,7)]],
    'J': [[(4,0), (4,5), (3,7), (1,7), (0,5)]],
    'K': [[(0,0), (0,7)], [(5,0), (0,4), (5,7)]],
    'L': [[(0,0), (0,7), (5,7)]],
    'M': [[(0,7), (0,0), (2.5,4), (5,0), (5,7)]],
    'N': [[(0,7), (0,0), (5,7), (5,0)]],
    'O': [[(2,0), (3,0), (5,2), (5,5), (3,7), (2,7), (0,5), (0,2), (2,0)]],
    'P': [[(0,7), (0,0), (4,0), (5,1.5), (4,3.5), (0,3.5)]],
    'Q': [[(2,0), (3,0), (5,2), (5,5), (3,7), (2,7), (0,5), (0,2), (2,0)], [(3,5), (5,7)]],
    'R': [[(0,7), (0,0), (4,0), (5,1.5), (4,3.5), (0,3.5)], [(3,3.5), (5,7)]],
    'S': [[(5,1), (3,0), (1,0), (0,1.5), (1,3.5), (4,3.5), (5,5.5), (4,7), (2,7), (0,6)]],
    'T': [[(0,0), (5,0)], [(2.5,0), (2.5,7)]],
    'U': [[(0,0), (0,5), (2,7), (3,7), (5,5), (5,0)]],
    'V': [[(0,0), (2.5,7), (5,0)]],
    'W': [[(0,0), (1.5,7), (2.5,3), (3.5,7), (5,0)]],
    'X': [[(0,0), (5,7)], [(5,0), (0,7)]],
    'Y': [[(0,0), (2.5,3.5), (5,0)], [(2.5,3.5), (2.5,7)]],
    'Z': [[(0,0), (5,0), (0,7), (5,7)]],
    ' ': []
}

def draw_text(layer, text, x, y, scale=1.0, color="#1E293B", size=1, opacity=1.0):
    cur_x = x
    char_w = 6 * scale
    spacing = 2 * scale
    for ch in text.upper():
        if ch in GLYPHS:
            paths = GLYPHS[ch]
            for path in paths:
                pts = [[cur_x + px * scale, y + py * scale] for px, py in path]
                if len(pts) == 1:
                    pts.append([pts[0][0] + 0.1, pts[0][1] + 0.1])
                draw_stroke(layer, pts, color=color, size=size, opacity=opacity)
        cur_x += char_w + spacing

# =========================================================================
# 1. 100% OPAQUE FULL-BLEED CANVAS (ZERO GHOST MARKS, ZERO POINTLESS TEXT)
# Spans x: 240..760, y: 0..700 completely opaque!
# =========================================================================

# Sky gradient bands - 100% opaque to obliterate all prior text/borders
draw_rect("typography", 240, 0, 520, 120, "#DDD6FE", opacity=1.0)  # serene violet
draw_rect("typography", 240, 120, 520, 80, "#FED7AA", opacity=1.0) # warm amber
draw_rect("typography", 240, 200, 520, 60, "#FECDD3", opacity=1.0) # twilight rose
draw_rect("typography", 240, 260, 520, 55, "#FEF08A", opacity=1.0) # golden horizon glow

# Distant Mountain Range
mtn_pts_distant = [
    [240, 270], [290, 230], [350, 255], [420, 195], [490, 260],
    [560, 205], [630, 240], [690, 175], [740, 230], [760, 210]
]
draw_stroke("typography", mtn_pts_distant, color="#93C5FD", size=6, brush="brush", opacity=1.0)
for y in range(250, 320, 12):
    draw_rect("typography", 240, y, 520, 14, "#BFDBFE", opacity=0.7)

# Midground Mountain Ridge
mtn_mid = [
    [240, 330], [280, 295], [330, 320], [390, 250], [460, 310],
    [520, 230], [580, 300], [640, 220], [700, 275], [760, 250]
]
draw_stroke("typography", mtn_mid, color="#3B82F6", size=8, brush="brush", opacity=1.0)
for y in range(300, 385, 12):
    draw_rect("typography", 240, y, 520, 14, "#2563EB", opacity=0.8)

# Crag texture
crags = [
    [[390, 250], [410, 330]],
    [[520, 230], [495, 325]],
    [[520, 230], [545, 330]],
    [[640, 220], [620, 325]],
    [[640, 220], [665, 315]]
]
for c in crags:
    draw_stroke("typography", c, color="#1D4ED8", size=4, brush="brush", opacity=1.0)

# Foreground Pine Hills (100% opaque base to wipe midground beneath)
draw_rect("typography", 240, 420, 520, 95, "#065F46", opacity=1.0)
hill_pts = [
    [240, 420], [310, 380], [390, 405], [480, 360], [580, 395],
    [660, 350], [720, 375], [760, 360]
]
draw_stroke("typography", hill_pts, color="#047857", size=10, brush="brush", opacity=1.0)
for y in range(390, 430, 10):
    draw_rect("typography", 240, y, 520, 12, "#065F46", opacity=1.0)

# Pine trees
pine_positions = [255, 285, 325, 370, 420, 460, 505, 550, 595, 635, 680, 720, 750]
for px in pine_positions:
    py = 390 if px < 480 else 370
    draw_stroke("typography", [[px, py+28], [px, py]], color="#022C22", size=3, brush="brush")
    draw_stroke("typography", [[px-7, py+16], [px, py+3], [px+7, py+16]], color="#064E3B", size=4, brush="brush")
    draw_stroke("typography", [[px-11, py+26], [px, py+10], [px+11, py+26]], color="#047857", size=4, brush="brush")

# Deep Reflective Lake Water (100% opaque)
draw_rect("typography", 240, 510, 520, 190, "#0F172A", opacity=1.0)
water_ripples = [
    (270, 530, 110), (460, 540, 150), (340, 560, 120), (560, 575, 140),
    (290, 595, 90), (480, 610, 160), (380, 635, 130), (540, 655, 120),
    (310, 675, 140), (500, 685, 100)
]
for rx, ry, rw in water_ripples:
    draw_rect("typography", rx, ry, rw, 3, "#38BDF8", opacity=0.45)

# ACTIVE LIVE PAINTBRUSH STROKE (The core journey: Inking Lineart pass)
brush_pts = [
    [240, 335], [300, 320], [370, 280], [450, 305], [520, 260], [580, 285]
]
draw_stroke("typography", brush_pts, color="#2563EB", size=14, brush="brush", opacity=0.95)
# Subtle cursor crosshair at active brush tip
draw_ellipse("typography", 574, 279, 12, 12, "#FFFFFF", opacity=0.6)
draw_stroke("typography", [[580, 275], [580, 295]], color="#FFFFFF", size=1)
draw_stroke("typography", [[570, 285], [590, 285]], color="#FFFFFF", size=1)


# =========================================================================
# 2. CLEAN UP ALL POINTLESS TEXT IN SIDEBARS
# =========================================================================
# Left Sidebar:
# Remove bottom meta stats (MARKS: 142 / 3000, CODESKETCH ENGINE V2)
draw_rect("typography", 0, 630, 239, 70, "#FFFFFF")
# Wipe "LAYERS (SCENE HIERARCHY)" at y=176..196 -> replace with clean "LAYERS"
draw_rect("typography", 18, 176, 218, 20, "#FFFFFF")
draw_text("typography", "LAYERS", 24, 184, scale=0.85, color="#94A3B8", size=1)

# Right Sidebar:
# Wipe "TOOL SELECTION (ACTIVE)" at y=84..100 -> replace with clean "TOOL"
draw_rect("typography", 770, 84, 220, 18, "#FFFFFF")
draw_text("typography", "TOOL", 774, 90, scale=0.85, color="#94A3B8", size=1)
# Wipe stray pointer lines at x=750..770
draw_rect("typography", 750, 105, 18, 40, "#FFFFFF")
draw_rect("typography", 750, 210, 18, 30, "#FFFFFF")
draw_rect("typography", 750, 430, 18, 30, "#FFFFFF")
# Redraw left divider line of right panel
draw_rect("typography", 760, 0, 1, 700, "#E2E8F0")

# Clean up "TARGET LAYER (ACTIVE)" -> "TARGET LAYER"
draw_rect("typography", 778, 422, 200, 16, "#F0F9FF")
draw_text("typography", "TARGET LAYER", 780, 426, scale=0.85, color="#0284C7", size=2)

print(f"Total commands generated: {len(commands)}")
with open("/private/tmp/codesketch-designer-20260910-fresh/artifacts/drawing/revisions_clean_fullbleed.json", "w") as f:
    json.dump(commands, f, indent=2)
