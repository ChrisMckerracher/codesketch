import json

commands = []

def add_command(cmd):
    commands.append(cmd)

# 1. Fill base background
add_command({"type": "fill", "color": "#0F172A"})

# 2. Add Layers
layers = [
    {"id": "base_ui", "name": "01 Workbench & Frame"},
    {"id": "artboard", "name": "02 Canvas Surface"},
    {"id": "artwork_paint", "name": "03 Landscape Painting"},
    {"id": "left_panel", "name": "04 Canvas Navigation"},
    {"id": "right_panel", "name": "05 Unified Studio Inspector"},
    {"id": "toolbar", "name": "06 Tool Controls"},
    {"id": "journey_focus", "name": "07 Target Focus"},
    {"id": "typography", "name": "08 Text & UI Strokes"}
]

for l in layers:
    add_command({"type": "layer.add", "id": l["id"], "name": l["name"]})

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
                pts = [[int(round(cur_x + px * scale)), int(round(y + py * scale))] for px, py in path]
                if len(pts) == 1:
                    pts.append([pts[0][0] + 1, pts[0][1] + 1])
                draw_stroke(layer, pts, color=color, size=size, opacity=opacity)
        cur_x += char_w + spacing

# =========================================================================
# 1. WIDESCREEN EXPANSIVE CANVAS: x: 0 .. 740, y: 0 .. 700 (74% VIEWPORT!)
# Zero gutters, full bleed, landscape painting surface
# =========================================================================

# Sky Gradient Bands (x: 0 .. 740)
draw_rect("artwork_paint", 0, 0, 740, 120, "#DDD6FE", opacity=1.0)
draw_rect("artwork_paint", 0, 120, 740, 80, "#FED7AA", opacity=1.0)
draw_rect("artwork_paint", 0, 200, 740, 60, "#FECDD3", opacity=1.0)
draw_rect("artwork_paint", 0, 260, 740, 55, "#FEF08A", opacity=1.0)

# Distant Mountain Range (Soft Blue)
mtn_distant = [
    [0, 260], [60, 220], [130, 250], [210, 180], [300, 255],
    [390, 190], [480, 240], [560, 175], [640, 230], [710, 195], [740, 210]
]
draw_stroke("artwork_paint", mtn_distant, color="#93C5FD", size=6, brush="brush", opacity=1.0)
for y in range(250, 315, 12):
    draw_rect("artwork_paint", 0, y, 740, 14, "#BFDBFE", opacity=0.7)

# Midground Mountain Ridge (Vibrant Blue & Crags)
mtn_mid = [
    [0, 320], [50, 285], [110, 310], [180, 240], [260, 310],
    [340, 230], [420, 290], [500, 220], [580, 280], [660, 240], [740, 270]
]
draw_stroke("artwork_paint", mtn_mid, color="#3B82F6", size=8, brush="brush", opacity=1.0)
for y in range(300, 385, 12):
    draw_rect("artwork_paint", 0, y, 740, 14, "#2563EB", opacity=0.8)

# Crag textures
crags = [
    [[180, 240], [200, 320]],
    [[340, 230], [320, 320]],
    [[340, 230], [365, 325]],
    [[500, 220], [480, 320]],
    [[500, 220], [525, 315]]
]
for c in crags:
    draw_stroke("artwork_paint", c, color="#1D4ED8", size=4, brush="brush", opacity=1.0)

# Foreground Pine Hills (Emerald Green)
draw_rect("artwork_paint", 0, 410, 740, 105, "#065F46", opacity=1.0)
hill_pts = [
    [0, 410], [80, 370], [170, 400], [270, 350], [380, 390],
    [480, 340], [580, 380], [670, 350], [740, 370]
]
draw_stroke("artwork_paint", hill_pts, color="#047857", size=10, brush="brush", opacity=1.0)

# Pine trees along ridge
for px in [30, 70, 120, 170, 220, 270, 320, 370, 420, 470, 520, 570, 620, 670, 710]:
    py = 380 if px < 400 else 360
    draw_stroke("artwork_paint", [[px, py+28], [px, py]], color="#022C22", size=3, brush="brush")
    draw_stroke("artwork_paint", [[px-7, py+16], [px, py+3], [px+7, py+16]], color="#064E3B", size=4, brush="brush")
    draw_stroke("artwork_paint", [[px-11, py+26], [px, py+10], [px+11, py+26]], color="#047857", size=4, brush="brush")

# Deep Reflective Lake Water
draw_rect("artwork_paint", 0, 510, 740, 190, "#0F172A", opacity=1.0)
for rx, ry, rw in [(40, 530, 140), (220, 545, 180), (450, 535, 160),
                   (90, 570, 150), (310, 580, 200), (560, 565, 140),
                   (50, 615, 170), (270, 630, 190), (510, 620, 180),
                   (120, 665, 160), (380, 675, 210)]:
    draw_rect("artwork_paint", rx, ry, rw, 3, "#38BDF8", opacity=0.45)

# ACTIVE LIVE PAINTBRUSH STROKE (The core journey: Inking Lineart pass)
brush_pts = [
    [60, 330], [160, 310], [280, 260], [380, 290], [480, 240], [570, 275]
]
draw_stroke("artwork_paint", brush_pts, color="#2563EB", size=14, brush="brush", opacity=0.95)
# Subtle cursor crosshair at active brush tip
draw_ellipse("artwork_paint", 564, 269, 12, 12, "#FFFFFF", opacity=0.6)
draw_stroke("artwork_paint", [[570, 265], [570, 285]], color="#FFFFFF", size=1)
draw_stroke("artwork_paint", [[560, 275], [580, 275]], color="#FFFFFF", size=1)

# Subtle overlay on top left of canvas: Brand badge + zoom
draw_rounded_rect("left_panel", 14, 14, 136, 26, 4, "#0F172A", opacity=0.6)
draw_rounded_rect("left_panel", 18, 18, 18, 18, 3, "#0D99FF")
draw_stroke("left_panel", [[22, 27], [27, 22], [32, 27]], color="#FFFFFF", size=2)
draw_text("typography", "CODESKETCH", 42, 21, scale=0.85, color="#FFFFFF", size=1)
draw_text("typography", "100%", 112, 21, scale=0.8, color="#94A3B8", size=1)


# =========================================================================
# 2. UNIFIED STUDIO INSPECTOR (RIGHT SIDEBAR): x: 740 .. 1000, y: 0 .. 700
# Single collapsible panel housing ALL controls, 86ing dual export buttons!
# =========================================================================
draw_rect("right_panel", 740, 0, 260, 700, "#FFFFFF")
draw_rect("right_panel", 740, 0, 1, 700, "#E2E8F0")

# Header (y=0..46): Studio Title + Single Export CTA + Collapse Toggle
draw_text("typography", "STUDIO", 756, 17, scale=1.0, color="#0F172A", size=2)

# Single Rasterize/Export button ("86 the export to png and save to json buttons")
draw_rounded_rect("right_panel", 868, 11, 82, 26, 4, "#0D99FF")
draw_text("typography", "EXPORT", 884, 18, scale=0.85, color="#FFFFFF", size=2)

# Collapse panel toggle icon [|>]
draw_rounded_rect("right_panel", 958, 11, 28, 26, 4, "#F8FAFC")
draw_rect("right_panel", 958, 11, 28, 1, "#E2E8F0")
draw_stroke("typography", [[968, 18], [974, 24], [968, 30]], color="#64748B", size=2)
draw_stroke("typography", [[978, 18], [978, 30]], color="#64748B", size=2)
draw_rect("right_panel", 740, 46, 260, 1, "#E2E8F0")

# Section 1: Tool Selection & Mode (y=50..136)
draw_text("typography", "TOOL", 756, 56, scale=0.85, color="#94A3B8", size=1)

# Active Tool Card: PAINTBRUSH: INKER
draw_rounded_rect("right_panel", 754, 68, 232, 28, 4, "#F0F9FF")
draw_rect("right_panel", 754, 68, 232, 1, "#0284C7")
draw_rect("right_panel", 754, 68, 3, 28, "#0284C7")
draw_ellipse("right_panel", 764, 76, 12, 12, "#0D99FF")
draw_text("typography", "PAINTBRUSH: INKER", 784, 76, scale=0.9, color="#0369A1", size=2)
draw_stroke("typography", [[970, 80], [974, 84], [978, 80]], color="#0369A1", size=1) # chevron

# Mode Switcher (Ink, Pencil, Marker, Eraser)
draw_rounded_rect("right_panel", 754, 102, 232, 24, 4, "#F1F5F9")
draw_rounded_rect("right_panel", 755, 103, 56, 22, 3, "#0D99FF")
draw_text("typography", "INK", 772, 109, scale=0.85, color="#FFFFFF", size=1)
draw_text("typography", "PENCIL", 824, 109, scale=0.85, color="#64748B", size=1)
draw_text("typography", "MARK", 882, 109, scale=0.85, color="#64748B", size=1)
draw_text("typography", "ERASE", 936, 109, scale=0.85, color="#64748B", size=1)
draw_rect("right_panel", 754, 134, 232, 1, "#F1F5F9")

# Section 2: Stroke Properties (y=140..280)
draw_text("typography", "STROKE PROPERTIES", 756, 144, scale=0.85, color="#94A3B8", size=1)

# Property 1: SIZE
draw_text("typography", "SIZE", 756, 162, scale=0.9, color="#475569", size=1)
draw_rounded_rect("right_panel", 934, 156, 52, 20, 3, "#F1F5F9")
draw_rect("right_panel", 934, 156, 52, 1, "#CBD5E1")
draw_text("typography", "14 PX", 942, 162, scale=0.9, color="#0F172A", size=1)
draw_rounded_rect("right_panel", 756, 180, 164, 6, 3, "#E2E8F0")
draw_rounded_rect("right_panel", 756, 180, 78, 6, 3, "#0D99FF")
draw_ellipse("right_panel", 830, 176, 14, 14, "#FFFFFF")
draw_ellipse("right_panel", 832, 178, 10, 10, "#0D99FF")

# Property 2: OPACITY
draw_text("typography", "OPACITY", 756, 198, scale=0.9, color="#475569", size=1)
draw_rounded_rect("right_panel", 934, 192, 52, 20, 3, "#F1F5F9")
draw_rect("right_panel", 934, 192, 52, 1, "#CBD5E1")
draw_text("typography", "100%", 942, 198, scale=0.9, color="#0F172A", size=1)
draw_rounded_rect("right_panel", 756, 216, 164, 6, 3, "#0D99FF")
draw_ellipse("right_panel", 916, 212, 14, 14, "#FFFFFF")
draw_ellipse("right_panel", 918, 214, 10, 10, "#0D99FF")

# Property 3: SMOOTHING
draw_text("typography", "SMOOTHING", 756, 234, scale=0.9, color="#475569", size=1)
draw_rounded_rect("right_panel", 934, 228, 52, 20, 3, "#F1F5F9")
draw_rect("right_panel", 934, 228, 52, 1, "#CBD5E1")
draw_text("typography", "75%", 944, 234, scale=0.9, color="#0F172A", size=1)
draw_rounded_rect("right_panel", 756, 252, 164, 6, 3, "#E2E8F0")
draw_rounded_rect("right_panel", 756, 252, 122, 6, 3, "#0D99FF")
draw_ellipse("right_panel", 874, 248, 14, 14, "#FFFFFF")
draw_ellipse("right_panel", 876, 250, 10, 10, "#0D99FF")

# Color Swatches
draw_rounded_rect("right_panel", 756, 272, 28, 28, 4, "#2563EB")
draw_rounded_rect("right_panel", 792, 272, 94, 28, 4, "#F8FAFC")
draw_rect("right_panel", 792, 272, 94, 1, "#E2E8F0")
draw_text("typography", "#2563EB", 802, 280, scale=0.95, color="#0F172A", size=1)
draw_rounded_rect("right_panel", 894, 272, 92, 28, 4, "#F8FAFC")
draw_rect("right_panel", 894, 272, 92, 1, "#E2E8F0")
draw_text("typography", "INK PIGMENT", 902, 280, scale=0.75, color="#64748B", size=1)
draw_rect("right_panel", 754, 312, 232, 1, "#F1F5F9")

# Section 3: Native Layers Stack & Active Target (y=320..580)
# Header: LAYERS + "+ NEW" action button
draw_text("typography", "LAYERS", 756, 324, scale=0.95, color="#0F172A", size=2)
draw_rounded_rect("right_panel", 930, 320, 56, 20, 3, "#F1F5F9")
draw_rect("right_panel", 930, 320, 56, 1, "#E2E8F0")
draw_text("typography", "+ NEW", 938, 324, scale=0.8, color="#0D99FF", size=1)

# Flat native layer stack (Highlighting Target Layer!)
layers_stack = [
    ("05", "HIGHLIGHTS", "100%", False),
    ("04", "BRUSH SHADING", "80%", False),
    ("03", "LINEART", "100%", True),
    ("02", "PENCIL ROUGHS", "60%", False),
    ("01", "BACKDROP WASH", "100%", False),
    ("00", "CANVAS FILL", "100%", False)
]

ly = 350
for num, name, op, is_target in layers_stack:
    if is_target:
        # TARGET LAYER ROW
        draw_rounded_rect("right_panel", 752, ly - 4, 236, 28, 4, "#E0F2FE")
        draw_rect("right_panel", 752, ly - 4, 3, 28, "#0284C7")
        draw_ellipse("right_panel", 762, ly + 6, 8, 8, "#0284C7")
        draw_text("typography", f"{num} {name}", 776, ly + 4, scale=0.85, color="#0369A1", size=2)
        # TARGET badge
        draw_rounded_rect("right_panel", 926, ly, 58, 18, 3, "#0D99FF")
        draw_text("typography", "TARGET", 932, ly + 4, scale=0.75, color="#FFFFFF", size=1)
    else:
        draw_ellipse("right_panel", 762, ly + 6, 8, 8, "#CBD5E1")
        draw_text("typography", f"{num} {name}", 776, ly + 4, scale=0.85, color="#475569", size=1)
        draw_text("typography", op, 950, ly + 4, scale=0.8, color="#94A3B8", size=1)
    ly += 32

draw_rect("right_panel", 754, ly + 4, 232, 1, "#F1F5F9")

# Active Target Layer Feedback Card (Unified!)
draw_rounded_rect("right_panel", 752, ly + 14, 236, 68, 6, "#F8FAFC")
draw_rect("right_panel", 752, ly + 14, 236, 1, "#E2E8F0")
draw_text("typography", "TARGET: 03 LINEART", 764, ly + 26, scale=0.85, color="#0369A1", size=2)
draw_ellipse("right_panel", 764, ly + 52, 6, 6, "#10B981")
draw_text("typography", "ACTIVE PASS: COMMITTING INK", 776, ly + 50, scale=0.75, color="#0369A1", size=1)

# Footer
draw_text("typography", "CODESKETCH ENGINE V2", 756, 668, scale=0.8, color="#94A3B8", size=1)

print(f"Total commands generated: {len(commands)}")
with open("/private/tmp/codesketch-designer-20260910-fresh/artifacts/drawing/unified_mockup_commands.json", "w") as f:
    json.dump(commands, f, indent=2)
