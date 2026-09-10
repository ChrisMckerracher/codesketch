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

def draw_rounded_rect(layer, x, y, w, h, r, color, opacity=1.0):
    r = min(r, w // 2, h // 2)
    if r <= 0:
        draw_rect(layer, x, y, w, h, color, opacity)
        return
    draw_rect(layer, x + r, y, w - 2*r, h, color, opacity)
    draw_rect(layer, x, y + r, r, h - 2*r, color, opacity)
    draw_rect(layer, x + w - r, y + r, r, h - 2*r, color, opacity)
    add_command({"type": "ellipse", "layer": layer, "x": int(x), "y": int(y), "width": int(2*r), "height": int(2*r), "color": color, "opacity": round(opacity, 2)})
    add_command({"type": "ellipse", "layer": layer, "x": int(x + w - 2*r), "y": int(y), "width": int(2*r), "height": int(2*r), "color": color, "opacity": round(opacity, 2)})
    add_command({"type": "ellipse", "layer": layer, "x": int(x), "y": int(y + h - 2*r), "width": int(2*r), "height": int(2*r), "color": color, "opacity": round(opacity, 2)})
    add_command({"type": "ellipse", "layer": layer, "x": int(x + w - 2*r), "y": int(y + h - 2*r), "width": int(2*r), "height": int(2*r), "color": color, "opacity": round(opacity, 2)})

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
    '0': [[(2,0), (3,0), (5,2), (5,5), (3,7), (2,7), (0,5), (0,2), (2,0)], [(4,1), (1,6)]],
    '1': [[(1,2), (2.5,0), (2.5,7)], [(1,7), (4,7)]],
    '2': [[(0,2), (1,0), (4,0), (5,2), (0,7), (5,7)]],
    '3': [[(0,1), (1,0), (4,0), (5,2), (3,3.5), (5,5), (4,7), (1,7), (0,6)]],
    '4': [[(4,7), (4,0), (0,5), (5,5)]],
    '5': [[(5,0), (0,0), (0,3.5), (4,3.5), (5,5), (4,7), (1,7), (0,6)]],
    '6': [[(4,0), (2,0), (0,3), (0,5), (2,7), (4,7), (5,5), (4,3.5), (0,3.5)]],
    '7': [[(0,0), (5,0), (2,7)]],
    '8': [[(2,0), (3,0), (5,1.5), (3,3.5), (2,3.5), (0,1.5), (2,0)], [(2,3.5), (3,3.5), (5,5.5), (3,7), (2,7), (0,5.5), (2,3.5)]],
    '9': [[(5,3.5), (1,3.5), (0,2), (1,0), (4,0), (5,3), (5,5), (3,7), (1,7)]],
    ':': [[(2.5,2), (2.5,2.5)], [(2.5,5), (2.5,5.5)]],
    '-': [[(0,3.5), (5,3.5)]],
    '/': [[(0,7), (5,0)]],
    '+': [[(2.5,1), (2.5,6)], [(0,3.5), (5,3.5)]],
    '#': [[(1.5,0), (1.5,7)], [(3.5,0), (3.5,7)], [(0,2.5), (5,2.5)], [(0,4.5), (5,4.5)]],
    '[': [[(3,0), (1,0), (1,7), (3,7)]],
    ']': [[(1,0), (3,0), (3,7), (1,7)]],
    '(': [[(3,0), (1,2), (1,5), (3,7)]],
    ')': [[(1,0), (3,2), (3,5), (1,7)]],
    '%': [[(0,1), (1,1)], [(4,6), (5,6)], [(0,7), (5,0)]],
    '.': [[(2,6.5), (3,6.5)]],
    ',': [[(2,6), (3,6), (1,8)]],
    '=': [[(0,2.5), (5,2.5)], [(0,4.5), (5,4.5)]],
    '>': [[(0,1), (4,3.5), (0,6)]],
    '<': [[(4,1), (0,3.5), (4,6)]],
    '|': [[(2.5,0), (2.5,7)]],
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
# COMPLETE RE-RENDER OF NATIVE CODESKETCH UI (ADDRESSING COMMENT 8 IN TOTALITY)
# Layer: typography (highest layer, 100% opaque fills, perfectly clean)
# =========================================================================

# -------------------------------------------------------------------------
# 1. CENTER CANVAS: 100% OPAQUE FULL BLEED PAINTING (NO LABELS, NO GUTTERS)
# Spans x: 240..760, y: 0..700
# -------------------------------------------------------------------------
# Sky Gradient Bands
draw_rect("typography", 240, 0, 520, 120, "#DDD6FE", opacity=1.0)
draw_rect("typography", 240, 120, 520, 80, "#FED7AA", opacity=1.0)
draw_rect("typography", 240, 200, 520, 60, "#FECDD3", opacity=1.0)
draw_rect("typography", 240, 260, 520, 55, "#FEF08A", opacity=1.0)

# Distant Mountain Range
mtn_distant = [
    [240, 270], [290, 230], [350, 255], [420, 195], [490, 260],
    [560, 205], [630, 240], [690, 175], [740, 230], [760, 210]
]
draw_stroke("typography", mtn_distant, color="#93C5FD", size=6, brush="brush", opacity=1.0)
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

# Foreground Pine Hills
draw_rect("typography", 240, 420, 520, 95, "#065F46", opacity=1.0)
hill_pts = [
    [240, 420], [310, 380], [390, 405], [480, 360], [580, 395],
    [660, 350], [720, 375], [760, 360]
]
draw_stroke("typography", hill_pts, color="#047857", size=10, brush="brush", opacity=1.0)
for y in range(390, 430, 10):
    draw_rect("typography", 240, y, 520, 12, "#065F46", opacity=1.0)

# Pine trees
for px in [255, 285, 325, 370, 420, 460, 505, 550, 595, 635, 680, 720, 750]:
    py = 390 if px < 480 else 370
    draw_stroke("typography", [[px, py+28], [px, py]], color="#022C22", size=3, brush="brush")
    draw_stroke("typography", [[px-7, py+16], [px, py+3], [px+7, py+16]], color="#064E3B", size=4, brush="brush")
    draw_stroke("typography", [[px-11, py+26], [px, py+10], [px+11, py+26]], color="#047857", size=4, brush="brush")

# Deep Reflective Lake Water
draw_rect("typography", 240, 510, 520, 190, "#0F172A", opacity=1.0)
for rx, ry, rw in [(270, 530, 110), (460, 540, 150), (340, 560, 120), (560, 575, 140),
                   (290, 595, 90), (480, 610, 160), (380, 635, 130), (540, 655, 120),
                   (310, 675, 140), (500, 685, 100)]:
    draw_rect("typography", rx, ry, rw, 3, "#38BDF8", opacity=0.45)

# Live Brush Stroke (Inking lineart pass)
draw_stroke("typography", [[240, 335], [300, 320], [370, 280], [450, 305], [520, 260], [580, 285]],
            color="#2563EB", size=14, brush="brush", opacity=0.95)
# Crosshair cursor at stroke tip
draw_ellipse("typography", 574, 279, 12, 12, "#FFFFFF", opacity=0.6)
draw_stroke("typography", [[580, 275], [580, 295]], color="#FFFFFF", size=1)
draw_stroke("typography", [[570, 285], [590, 285]], color="#FFFFFF", size=1)


# -------------------------------------------------------------------------
# 2. LEFT SIDEBAR: NATIVE CODESKETCH LAYERS ONLY (NO PAGES, NO ASSETS, NO GROUPS)
# Spans x: 0..240, y: 0..700
# -------------------------------------------------------------------------
# Total clean wipe of left sidebar
draw_rect("typography", 0, 0, 240, 700, "#FFFFFF")
draw_rect("typography", 239, 0, 1, 700, "#E2E8F0")

# Header (y=0..46): App Logo & Title
draw_rounded_rect("typography", 16, 14, 18, 18, 4, "#0D99FF")
draw_stroke("typography", [[20, 23], [25, 18], [30, 23]], color="#FFFFFF", size=2)
draw_text("typography", "CODESKETCH", 40, 17, scale=0.95, color="#0F172A", size=2)
# Toggle sidebar icon [|]
draw_rounded_rect("typography", 206, 12, 22, 22, 4, "#F8FAFC")
draw_rect("typography", 206, 12, 22, 1, "#E2E8F0")
draw_stroke("typography", [[212, 17], [212, 29]], color="#64748B", size=2)
draw_stroke("typography", [[217, 17], [223, 23], [217, 29]], color="#64748B", size=2)
draw_rect("typography", 0, 46, 240, 1, "#E2E8F0")

# Layers Section Bar (y=47..78): Clean title + "+ NEW" button
draw_rect("typography", 0, 47, 240, 31, "#FAFAFA")
draw_text("typography", "LAYERS", 20, 57, scale=0.95, color="#0F172A", size=2)
# "+ NEW LAYER" action
draw_rounded_rect("typography", 172, 53, 56, 20, 3, "#F1F5F9")
draw_rect("typography", 172, 53, 56, 1, "#E2E8F0")
draw_text("typography", "+ NEW", 178, 57, scale=0.8, color="#0D99FF", size=1)
draw_rect("typography", 0, 78, 240, 1, "#E2E8F0")

# Native Flat Layers Stack (Ordered top-to-bottom as rendered)
layers_data = [
    {"num": "05", "name": "HIGHLIGHTS", "op": "100%", "active": False},
    {"num": "04", "name": "BRUSH SHADING", "op": "80%", "active": False},
    {"num": "03", "name": "LINEART", "op": "100%", "active": True},
    {"num": "02", "name": "PENCIL ROUGHS", "op": "60%", "active": False},
    {"num": "01", "name": "BACKDROP WASH", "op": "100%", "active": False},
    {"num": "00", "name": "CANVAS FILL", "op": "100%", "active": False}
]

y_pos = 92
for l in layers_data:
    if l["active"]:
        # Active Target Layer Row Highlight
        draw_rounded_rect("typography", 10, y_pos - 4, 220, 30, 4, "#E0F2FE")
        draw_rect("typography", 10, y_pos - 4, 3, 30, "#0284C7")
        draw_ellipse("typography", 22, y_pos + 6, 8, 8, "#0284C7")
        draw_text("typography", f"{l['num']} {l['name']}", 36, y_pos + 4, scale=0.85, color="#0369A1", size=2)
        # TARGET badge
        draw_rounded_rect("typography", 164, y_pos, 58, 18, 3, "#0D99FF")
        draw_text("typography", "TARGET", 170, y_pos + 4, scale=0.75, color="#FFFFFF", size=1)
    else:
        draw_ellipse("typography", 22, y_pos + 6, 8, 8, "#CBD5E1")
        draw_text("typography", f"{l['num']} {l['name']}", 36, y_pos + 4, scale=0.85, color="#475569", size=1)
        draw_text("typography", l["op"], 194, y_pos + 4, scale=0.8, color="#94A3B8", size=1)
    y_pos += 34

draw_rect("typography", 16, y_pos, 208, 1, "#F1F5F9")

# Native Layer Properties Card
y_pos += 12
draw_rounded_rect("typography", 14, y_pos, 212, 110, 6, "#F8FAFC")
draw_rect("typography", 14, y_pos, 212, 1, "#E2E8F0")
draw_text("typography", "ACTIVE: 03 LINEART", 24, y_pos + 12, scale=0.85, color="#0369A1", size=2)
draw_text("typography", "COMMAND: LAYER UPDATE", 24, y_pos + 36, scale=0.8, color="#475569", size=1)
draw_text("typography", "VISIBILITY: TRUE", 24, y_pos + 56, scale=0.8, color="#475569", size=1)
draw_text("typography", "OPACITY: 1.0 (100%)", 24, y_pos + 76, scale=0.8, color="#475569", size=1)

# Document Size footer
draw_text("typography", "CANVAS: 1000 X 700 PX", 20, 668, scale=0.8, color="#94A3B8", size=1)


# -------------------------------------------------------------------------
# 3. RIGHT SIDEBAR: NATIVE PAINT TOOL & PROJECT ACTIONS ONLY (NO PROTOTYPE, NO AVATARS)
# Spans x: 760..1000, y: 0..700
# -------------------------------------------------------------------------
# Total clean wipe of right sidebar
draw_rect("typography", 760, 0, 240, 700, "#FFFFFF")
draw_rect("typography", 760, 0, 1, 700, "#E2E8F0")

# Header (y=0..46): Real Native Commands: EXPORT PNG & SAVE JSON
draw_rounded_rect("typography", 772, 11, 106, 26, 4, "#F8FAFC")
draw_rect("typography", 772, 11, 106, 1, "#CBD5E1")
draw_text("typography", "EXPORT PNG", 788, 18, scale=0.85, color="#334155", size=1)

draw_rounded_rect("typography", 886, 11, 102, 26, 4, "#0D99FF")
draw_text("typography", "SAVE JSON", 902, 18, scale=0.85, color="#FFFFFF", size=2)
draw_rect("typography", 760, 46, 240, 1, "#E2E8F0")

# Tool Inspector Tab (y=47..78)
draw_rect("typography", 760, 47, 240, 31, "#FAFAFA")
draw_text("typography", "PAINT TOOL", 776, 57, scale=0.95, color="#0F172A", size=2)
draw_rect("typography", 774, 76, 74, 2, "#0D99FF") # active tab underline
draw_text("typography", "100%", 950, 57, scale=0.9, color="#64748B", size=1)
draw_rect("typography", 760, 78, 240, 1, "#E2E8F0")

# Active Tool Card
draw_text("typography", "TOOL", 774, 90, scale=0.85, color="#94A3B8", size=1)
draw_rounded_rect("typography", 772, 102, 216, 28, 4, "#F0F9FF")
draw_rect("typography", 772, 102, 216, 1, "#0284C7")
draw_rect("typography", 772, 102, 3, 28, "#0284C7")
draw_ellipse("typography", 780, 110, 12, 12, "#0D99FF")
draw_text("typography", "PAINTBRUSH: INKER", 800, 110, scale=0.9, color="#0369A1", size=2)

# Tool Mode Switcher (Real brush tools)
draw_rounded_rect("typography", 772, 136, 216, 24, 4, "#F1F5F9")
draw_rounded_rect("typography", 773, 137, 52, 22, 3, "#0D99FF")
draw_text("typography", "INK", 787, 143, scale=0.85, color="#FFFFFF", size=1)
draw_text("typography", "PENCIL", 834, 143, scale=0.85, color="#64748B", size=1)
draw_text("typography", "MARK", 890, 143, scale=0.85, color="#64748B", size=1)
draw_text("typography", "ERASE", 942, 143, scale=0.85, color="#64748B", size=1)
draw_rect("typography", 772, 168, 216, 1, "#F1F5F9")

# Stroke Properties
draw_text("typography", "STROKE PROPERTIES", 774, 178, scale=0.85, color="#94A3B8", size=1)

# Property 1: SIZE
draw_text("typography", "SIZE", 774, 196, scale=0.9, color="#475569", size=1)
draw_rounded_rect("typography", 936, 190, 52, 20, 3, "#F1F5F9")
draw_rect("typography", 936, 190, 52, 1, "#CBD5E1")
draw_text("typography", "14 PX", 944, 196, scale=0.9, color="#0F172A", size=1)
draw_rounded_rect("typography", 774, 214, 150, 6, 3, "#E2E8F0")
draw_rounded_rect("typography", 774, 214, 70, 6, 3, "#0D99FF")
draw_ellipse("typography", 840, 210, 14, 14, "#FFFFFF")
draw_ellipse("typography", 842, 212, 10, 10, "#0D99FF")

# Property 2: OPACITY
draw_text("typography", "OPACITY", 774, 234, scale=0.9, color="#475569", size=1)
draw_rounded_rect("typography", 936, 228, 52, 20, 3, "#F1F5F9")
draw_rect("typography", 936, 228, 52, 1, "#CBD5E1")
draw_text("typography", "100%", 944, 234, scale=0.9, color="#0F172A", size=1)
draw_rounded_rect("typography", 774, 252, 150, 6, 3, "#0D99FF")
draw_ellipse("typography", 918, 248, 14, 14, "#FFFFFF")
draw_ellipse("typography", 920, 250, 10, 10, "#0D99FF")

# Property 3: SMOOTHING
draw_text("typography", "SMOOTHING", 774, 272, scale=0.9, color="#475569", size=1)
draw_rounded_rect("typography", 936, 266, 52, 20, 3, "#F1F5F9")
draw_rect("typography", 936, 266, 52, 1, "#CBD5E1")
draw_text("typography", "75%", 946, 272, scale=0.9, color="#0F172A", size=1)
draw_rounded_rect("typography", 774, 290, 150, 6, 3, "#E2E8F0")
draw_rounded_rect("typography", 774, 290, 112, 6, 3, "#0D99FF")
draw_ellipse("typography", 882, 286, 14, 14, "#FFFFFF")
draw_ellipse("typography", 884, 288, 10, 10, "#0D99FF")
draw_rect("typography", 772, 308, 216, 1, "#F1F5F9")

# Color & Swatches
draw_text("typography", "COLOR", 774, 320, scale=0.85, color="#94A3B8", size=1)
draw_rounded_rect("typography", 774, 334, 30, 30, 4, "#2563EB")
draw_rounded_rect("typography", 814, 334, 104, 30, 4, "#F8FAFC")
draw_rect("typography", 814, 334, 104, 1, "#E2E8F0")
draw_text("typography", "#2563EB", 824, 344, scale=1.0, color="#0F172A", size=1)
draw_rounded_rect("typography", 926, 334, 62, 30, 4, "#F8FAFC")
draw_rect("typography", 926, 334, 62, 1, "#E2E8F0")
draw_text("typography", "100%", 938, 344, scale=1.0, color="#0F172A", size=1)

for i, col in enumerate(["#2563EB", "#EF4444", "#10B981", "#F59E0B", "#0F172A", "#FFFFFF"]):
    cx = 774 + i * 36
    draw_ellipse("typography", cx, 374, 22, 22, col)
    draw_ellipse("typography", cx, 374, 22, 22, "#CBD5E1", opacity=0.4)

draw_rect("typography", 772, 406, 216, 1, "#F1F5F9")

# Target Layer Assignment
draw_rounded_rect("typography", 770, 416, 220, 88, 6, "#F0F9FF")
draw_rect("typography", 770, 416, 220, 1, "#BAE6FD")
draw_rect("typography", 770, 416, 1, 88, "#BAE6FD")
draw_rect("typography", 989, 416, 1, 88, "#BAE6FD")
draw_rect("typography", 770, 503, 220, 1, "#BAE6FD")

draw_text("typography", "TARGET LAYER", 780, 426, scale=0.9, color="#0284C7", size=2)
draw_text("typography", "STROKES COMMIT TO:", 780, 442, scale=0.8, color="#475569", size=1)

# Dropdown Button
draw_rounded_rect("typography", 778, 454, 202, 26, 4, "#FFFFFF")
draw_rect("typography", 778, 454, 202, 1, "#0284C7")
draw_ellipse("typography", 786, 462, 10, 10, "#0284C7")
draw_text("typography", "03 LINEART  V", 804, 461, scale=0.95, color="#0369A1", size=2)

draw_ellipse("typography", 780, 488, 6, 6, "#10B981")
draw_text("typography", "ACTIVE DRAWING TARGET", 792, 486, scale=0.75, color="#0369A1", size=1)

print(f"Total commands generated: {len(commands)}")
with open("/private/tmp/codesketch-designer-20260910-fresh/artifacts/drawing/revisions_pure_codesketch.json", "w") as f:
    json.dump(commands, f, indent=2)
