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
    'I': [[(2.5,0), (2.5,7)]],
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
    '1': [[(0.5,2.5), (2.5,0), (2.5,7)], [(1,7), (4,7)]],
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
    '&': [[(4,0), (2,0), (0,2), (0,3.5), (4,5), (4,7), (2,7), (0,5)], [(2,3.5), (5,7)]],
    '!': [[(2.5,0), (2.5,4.5)], [(2.5,6.5), (2.5,7)]],
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

# Wonky top-left floating box [CODESKETCH 100%] is completely removed!


# =========================================================================
# 2. IN-APP FEEDBACK FLOW CARD (Figma-style non-intrusive comment pin & thread)
# Directly answers: "theres no feedback flow. i dont understand how to leave feedback can we see tht."
# Implements paint-m57 (clean non-modal UX), paint-c36 (two-way agent reply), paint-sep (Submit & Resume)
# =========================================================================

# Canvas Comment Pin at (486, 222) near the active stroke
draw_ellipse("journey_focus", 486, 222, 22, 22, "#0D99FF")
draw_ellipse("journey_focus", 488, 224, 18, 18, "#FFFFFF")
draw_ellipse("journey_focus", 491, 227, 12, 12, "#0D99FF")
# Small speech bubble tail pointing to stroke
draw_stroke("journey_focus", [[486, 238], [476, 248], [492, 242]], color="#0D99FF", size=2)

# Floating In-App Feedback Card: x: 120, y: 38, w: 340, h: 228
# Soft shadow
draw_rounded_rect("journey_focus", 123, 41, 340, 228, 6, "#000000", opacity=0.25)
# Card body
draw_rounded_rect("journey_focus", 120, 38, 340, 228, 6, "#FFFFFF")
draw_rect("journey_focus", 120, 38, 340, 1, "#CBD5E1")
draw_rect("journey_focus", 120, 38, 1, 228, "#CBD5E1")
draw_rect("journey_focus", 459, 38, 1, 228, "#CBD5E1")
draw_rect("journey_focus", 120, 265, 340, 1, "#CBD5E1")

# Feedback Card Header (y: 38..66)
draw_rounded_rect("journey_focus", 121, 39, 338, 28, 5, "#F8FAFC")
draw_rect("journey_focus", 120, 66, 340, 1, "#E2E8F0")
# Comment #1 Pill
draw_rounded_rect("journey_focus", 130, 44, 86, 18, 3, "#E0F2FE")
draw_text("typography", "FEEDBACK #1", 136, 48, scale=0.75, color="#0284C7", size=1)
# Status: Acknowledged pill
draw_rounded_rect("journey_focus", 222, 44, 94, 18, 3, "#DCFCE7")
draw_text("typography", "ACKNOWLEDGED", 228, 48, scale=0.7, color="#15803D", size=1)
# Close [X]
draw_text("typography", "X", 442, 47, scale=0.8, color="#94A3B8", size=1)

# Comment 1 Content (Director's comment)
draw_ellipse("journey_focus", 132, 76, 12, 12, "#3B82F6") # Director Avatar
draw_text("typography", "DIRECTOR", 150, 78, scale=0.8, color="#0F172A", size=2)
draw_text("typography", "2M AGO", 216, 79, scale=0.7, color="#94A3B8", size=1)

draw_text("typography", "CLEAN TOOL BOX, CLARIFY ACTIVE LAYER,", 132, 98, scale=0.75, color="#334155", size=1)
draw_text("typography", "AND SHOW IN-APP FEEDBACK FLOW.", 132, 112, scale=0.75, color="#334155", size=1)

# Two-way Agent Reply Thread (Addressing paint-c36: Let agents reply inside Codesketch!)
draw_rect("journey_focus", 132, 130, 316, 1, "#F1F5F9")
draw_ellipse("journey_focus", 132, 138, 12, 12, "#10B981") # Artist Agent Avatar
draw_text("typography", "ARTIST AGENT", 150, 140, scale=0.8, color="#047857", size=2)
draw_text("typography", "JUST NOW", 236, 141, scale=0.7, color="#94A3B8", size=1)

draw_text("typography", "APPLIED IN V2: REMOVED CLUTTER,", 132, 160, scale=0.75, color="#065F46", size=1)
draw_text("typography", "EXPANDED WIDESCREEN, AND UNIFIED FLOW.", 132, 174, scale=0.75, color="#065F46", size=1)

# Interactive Reply & Continuation Footer (Addressing paint-sep & paint-m57!)
draw_rect("journey_focus", 120, 194, 340, 1, "#E2E8F0")
# Input box: "Write a reply..."
draw_rounded_rect("journey_focus", 130, 202, 184, 24, 3, "#F8FAFC")
draw_rect("journey_focus", 130, 202, 184, 1, "#CBD5E1")
draw_text("typography", "WRITE A REPLY...", 138, 209, scale=0.75, color="#94A3B8", size=1)

# Single-click "Submit & Resume" button (paint-sep: Streamline feedback continuation!)
draw_rounded_rect("journey_focus", 322, 202, 128, 24, 3, "#0D99FF")
draw_text("typography", "SUBMIT & RESUME", 330, 209, scale=0.75, color="#FFFFFF", size=1)

# Subtle connecting leader line from card to pin
draw_stroke("journey_focus", [[450, 230], [476, 248]], color="#0D99FF", size=2, brush="brush", opacity=0.7)


# =========================================================================
# 3. UNIFIED STUDIO INSPECTOR (RIGHT SIDEBAR): x: 740 .. 1000, y: 0 .. 700
# Single collapsible panel housing ALL controls, clean tool hierarchy!
# =========================================================================
# Right Panel Base
draw_rect("right_panel", 740, 0, 260, 700, "#FFFFFF")

# 1. Header
draw_text("typography", "STUDIO", 756, 20, scale=0.95, color="#0F172A", size=1)

# Feedback Toggle [FB]
draw_text("typography", "FB", 830, 20, scale=0.85, color="#3B82F6", size=1)

# Primary SAVE button [SAVE]
draw_rounded_rect("right_panel", 872, 11, 62, 24, 3, "#0284C7")
draw_text("typography", "SAVE", 887, 18, scale=0.85, color="#FFFFFF", size=1)

# Collapse panel toggle icon [>|]
draw_stroke("typography", [[968, 16], [974, 22], [968, 28]], color="#64748B", size=1)
draw_stroke("typography", [[978, 16], [978, 28]], color="#64748B", size=1)

# 2. Tool Section
draw_text("typography", "TOOL", 756, 56, scale=0.85, color="#64748B", size=1)
draw_text("typography", "INK", 772, 79, scale=0.85, color="#0D99FF", size=1)
draw_text("typography", "PENCIL", 824, 79, scale=0.85, color="#94A3B8", size=1)
draw_text("typography", "MARK", 882, 79, scale=0.85, color="#94A3B8", size=1)
draw_text("typography", "ERASE", 936, 79, scale=0.85, color="#94A3B8", size=1)

# 3. Stroke Properties
draw_text("typography", "STROKE PROPERTIES", 756, 120, scale=0.85, color="#64748B", size=1)
draw_text("typography", "SIZE", 756, 140, scale=0.85, color="#475569", size=1)
draw_text("typography", "14 PX", 942, 140, scale=0.85, color="#0F172A", size=1)

draw_text("typography", "OPACITY", 756, 174, scale=0.85, color="#475569", size=1)
draw_text("typography", "100%", 942, 174, scale=0.85, color="#0F172A", size=1)

draw_text("typography", "SMOOTHING", 756, 210, scale=0.85, color="#475569", size=1)
draw_text("typography", "75%", 944, 210, scale=0.85, color="#0F172A", size=1)

draw_text("typography", "#2563EB", 802, 256, scale=0.85, color="#475569", size=1)
draw_text("typography", "INK PIGMENT", 896, 256, scale=0.75, color="#64748B", size=1)

# 4. Layers Stack with Inline Eye Icons
draw_text("typography", "LAYERS", 756, 302, scale=0.95, color="#0F172A", size=1)
draw_text("typography", "+ NEW", 938, 302, scale=0.8, color="#0284C7", size=1)

def draw_eye_icon(layer, x, y, vis=True, color="#94A3B8"):
    draw_stroke(layer, [[x, y+2], [x+3, y], [x+7, y], [x+10, y+2]], color=color, size=1)
    draw_stroke(layer, [[x, y+2], [x+3, y+4], [x+7, y+4], [x+10, y+2]], color=color, size=1)
    if vis:
        draw_stroke(layer, [[x+5, y+2], [x+5, y+2]], color=color, size=1)
    else:
        draw_stroke(layer, [[x+1, y-1], [x+9, y+5]], color="#94A3B8", size=1)

layers_stack = [
    ("05", "HIGHLIGHTS", "100%", False),
    ("04", "BRUSH SHADING", "80%", False),
    ("03", "LINEART", "100%", True),
    ("02", "PENCIL ROUGHS", "60%", False),
    ("01", "BACKDROP WASH", "100%", False),
    ("00", "CANVAS FILL", "100%", False)
]

ly = 328
for num, name, op, is_active in layers_stack:
    row_color = "#0284C7" if is_active else "#475569"
    eye_color = "#0284C7" if is_active else "#94A3B8"
    draw_text("typography", f"{num} {name}", 756, ly + 4, scale=0.85, color=row_color, size=1)
    draw_text("typography", op, 934, ly + 4, scale=0.8, color="#0284C7" if is_active else "#64748B", size=1)
    draw_eye_icon("typography", 972, ly + 4, vis=True, color=eye_color)
    ly += 32

# 5. Footer
draw_text("typography", "CODESKETCH ENGINE V2", 756, 668, scale=0.8, color="#94A3B8", size=1)

print(f"Total commands generated: {len(commands)}")
with open("/private/tmp/codesketch-designer-20260910-fresh/artifacts/drawing/unified_mockup_v2_commands.json", "w") as f:
    json.dump(commands, f, indent=2)
