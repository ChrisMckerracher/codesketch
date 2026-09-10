import json
import math

commands = []

def add_command(cmd):
    commands.append(cmd)

# 1. Fill base background
add_command({"type": "fill", "color": "#EEF2F6"})

# 2. Add Layers
layers = [
    {"id": "base_ui", "name": "01 Workbench & Nav"},
    {"id": "artboard", "name": "02 Canvas Artboard"},
    {"id": "artwork_paint", "name": "03 Artboard Painting"},
    {"id": "left_panel", "name": "04 Left Panel & Layers"},
    {"id": "right_panel", "name": "05 Right Panel & Inspector"},
    {"id": "toolbar", "name": "06 Floating Toolbar"},
    {"id": "journey_focus", "name": "07 Journey & Target Focus"},
    {"id": "typography", "name": "08 Text & Icon Strokes"}
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

# Polyline Font
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
    'P': [[(0,7), (0,0), (3.5,0), (5,1.5), (5,3), (3.5,4), (0,4)]],
    'Q': [[(2,0), (3,0), (5,2), (5,5), (3,7), (2,7), (0,5), (0,2), (2,0)], [(3,5), (5,7)]],
    'R': [[(0,7), (0,0), (3.5,0), (5,1.5), (5,3), (3.5,4), (0,4)], [(2.5,4), (5,7)]],
    'S': [[(5,1), (3.5,0), (1.5,0), (0,1.5), (1,3), (4,4), (5,5.5), (3.5,7), (1,7), (0,6)]],
    'T': [[(0,0), (5,0)], [(2.5,0), (2.5,7)]],
    'U': [[(0,0), (0,5), (2,7), (3,7), (5,5), (5,0)]],
    'V': [[(0,0), (2.5,7), (5,0)]],
    'W': [[(0,0), (1,7), (2.5,3), (4,7), (5,0)]],
    'X': [[(0,0), (5,7)], [(0,7), (5,0)]],
    'Y': [[(0,0), (2.5,3.5), (2.5,7)], [(5,0), (2.5,3.5)]],
    'Z': [[(0,0), (5,0), (0,7), (5,7)]],
    '0': [[(2,0), (3,0), (5,2), (5,5), (3,7), (2,7), (0,5), (0,2), (2,0)], [(1,6), (4,1)]],
    '1': [[(1,2), (2.5,0), (2.5,7)], [(0.5,7), (4.5,7)]],
    '2': [[(0,1.5), (1.5,0), (3.5,0), (5,1.5), (5,3), (0,7), (5,7)]],
    '3': [[(0,1), (2,0), (4,0), (5,1.5), (3.5,3.5), (5,5), (3.5,7), (1.5,7), (0,6)]],
    '4': [[(4,7), (4,0), (0,4.5), (5,4.5)]],
    '5': [[(5,0), (0,0), (0,3), (3.5,3), (5,4.5), (4,7), (1,7), (0,6)]],
    '6': [[(4,0.5), (2,0), (0,2), (0,5.5), (2,7), (3.5,7), (5,5.5), (5,4), (3.5,3), (0,3)]],
    '7': [[(0,0), (5,0), (2,7)]],
    '8': [[(2,0), (3,0), (5,1.5), (3.5,3.5), (5,5), (3.5,7), (1.5,7), (0,5), (1.5,3.5), (0,1.5), (2,0)]],
    '9': [[(5,4), (0,4), (0,1.5), (1.5,0), (3.5,0), (5,1.5), (5,5), (3,7), (1,6.5)]],
    ':': [[(2,2), (2.5,2)], [(2,5), (2.5,5)]],
    '-': [[(1,3.5), (4,3.5)]],
    '+': [[(2.5,1.5), (2.5,5.5)], [(0.5,3.5), (4.5,3.5)]],
    '/': [[(0,7), (5,0)]],
    '.': [[(2,6.5), (2.5,6.5)]],
    ',': [[(2,6), (2.5,6.5), (1.5,8)]],
    '#': [[(1.5,0.5), (1.5,6.5)], [(3.5,0.5), (3.5,6.5)], [(0.5,2.5), (4.5,2.5)], [(0.5,4.5), (4.5,4.5)]],
    '(': [[(3,0), (1.5,2), (1.5,5), (3,7)]],
    ')': [[(1.5,0), (3,2), (3,5), (1.5,7)]],
    '[': [[(3.5,0), (1.5,0), (1.5,7), (3.5,7)]],
    ']': [[(1.5,0), (3.5,0), (3.5,7), (1.5,7)]],
    '%': [[(1,1), (2,2)], [(4,6), (5,7)], [(0,7), (5,0)]],
    '<': [[(4,1), (1,3.5), (4,6)]],
    '>': [[(1,1), (4,3.5), (1,6)]],
    'V': [[(0.5,1), (2.5,6), (4.5,1)]],
    ' ': []
}

def draw_text(layer, text, x, y, scale=1.0, color="#1E293B", size=1, brush="pencil", opacity=1.0):
    cur_x = x
    char_w = 5 * scale
    char_h = 7 * scale
    spacing = 2 * scale
    for ch in text.upper():
        polys = GLYPHS.get(ch, GLYPHS.get(' '))
        for poly in polys:
            stroke_pts = []
            for pt in poly:
                px = cur_x + pt[0] * scale
                py = y + pt[1] * scale
                stroke_pts.append([px, py])
            draw_stroke(layer, stroke_pts, color=color, size=size, brush=brush, opacity=opacity)
        cur_x += char_w + spacing

# ==========================================
# 1. TOP NAVIGATION BAR (Layer: base_ui)
# ==========================================
draw_rect("base_ui", 0, 0, 1000, 46, "#FFFFFF")
draw_rect("base_ui", 0, 46, 1000, 1, "#E2E8F0")

# App Logo: 5 colored geometric shapes (Figma style)
draw_rect("base_ui", 14, 12, 8, 8, "#F24E1E") # Red
draw_rect("base_ui", 22, 12, 8, 8, "#FF7262") # Orange
draw_rect("base_ui", 14, 20, 8, 8, "#A259FF") # Purple
draw_ellipse("base_ui", 22, 20, 8, 8, "#1ABCFE") # Blue
draw_rect("base_ui", 14, 28, 8, 8, "#0ACF83") # Green

# File title & status
draw_text("typography", "CODESKETCH  /  AUTUMN HORIZON", 46, 18, scale=1.3, color="#0F172A", size=2)
# Status Badge
draw_rounded_rect("base_ui", 370, 14, 62, 18, 4, "#F0FDF4")
draw_rect("base_ui", 370, 14, 62, 1, "#BBF7D0")
draw_ellipse("base_ui", 376, 20, 6, 6, "#16A34A")
draw_text("typography", "SAVED", 388, 18, scale=0.9, color="#15803D", size=1)

# Right Collaboration & Header Actions
draw_ellipse("base_ui", 808, 12, 22, 22, "#FED7AA")
draw_ellipse("base_ui", 811, 15, 16, 16, "#EA580C")
draw_text("typography", "A", 817, 19, scale=0.8, color="#FFFFFF", size=1)

draw_ellipse("base_ui", 828, 12, 22, 22, "#DDD6FE")
draw_ellipse("base_ui", 831, 15, 16, 16, "#7C3AED")
draw_text("typography", "C", 837, 19, scale=0.8, color="#FFFFFF", size=1)

draw_ellipse("base_ui", 848, 12, 22, 22, "#BBF7D0")
draw_ellipse("base_ui", 851, 15, 16, 16, "#059669")
draw_text("typography", "J", 857, 19, scale=0.8, color="#FFFFFF", size=1)

# Play/Present Button
draw_rounded_rect("base_ui", 884, 11, 26, 24, 4, "#F8FAFC")
draw_stroke("base_ui", [[893, 17], [893, 29], [903, 23], [893, 17]], color="#475569", size=2)

# Share CTA Button
draw_rounded_rect("base_ui", 920, 10, 68, 26, 6, "#0D99FF")
draw_text("typography", "SHARE", 936, 18, scale=1.0, color="#FFFFFF", size=2)

# ==========================================
# 2. LEFT SIDEBAR PANEL (Layer: left_panel)
# ==========================================
draw_rounded_rect("left_panel", 14, 56, 224, 630, 10, "#FFFFFF")
draw_rect("left_panel", 14, 56, 224, 1, "#E2E8F0")
draw_rect("left_panel", 14, 56, 1, 630, "#E2E8F0")
draw_rect("left_panel", 237, 56, 1, 630, "#E2E8F0")
draw_rect("left_panel", 14, 685, 224, 1, "#E2E8F0")

# Navigation tabs
draw_rect("left_panel", 14, 56, 224, 32, "#F8FAFC")
draw_rect("left_panel", 14, 88, 224, 1, "#E2E8F0")
draw_text("typography", "LAYERS", 28, 68, scale=1.0, color="#0F172A", size=2)
draw_rect("left_panel", 26, 86, 52, 2, "#0D99FF")
draw_text("typography", "ASSETS", 100, 68, scale=1.0, color="#64748B", size=1)
draw_text("typography", "PAGES", 170, 68, scale=1.0, color="#64748B", size=1)

# PAGES Section
draw_text("typography", "PAGES", 24, 104, scale=0.9, color="#94A3B8", size=1)
draw_text("typography", "+", 218, 104, scale=1.1, color="#64748B", size=2)
draw_rounded_rect("left_panel", 20, 118, 212, 24, 4, "#F1F5F9")
draw_ellipse("left_panel", 28, 126, 8, 8, "#0D99FF")
draw_text("typography", "CANVAS 1 - MAIN", 42, 124, scale=1.0, color="#0F172A", size=1)
draw_ellipse("left_panel", 28, 150, 8, 8, "#CBD5E1")
draw_text("typography", "REFERENCE STUDY", 42, 148, scale=1.0, color="#64748B", size=1)

draw_rect("left_panel", 20, 172, 212, 1, "#F1F5F9")

# LAYERS Section
draw_text("typography", "LAYERS  (SCENE HIERARCHY)", 24, 184, scale=0.9, color="#94A3B8", size=1)

# Group folder
draw_stroke("left_panel", [[26, 206], [32, 212], [38, 206]], color="#64748B", size=2)
draw_rect("left_panel", 44, 202, 14, 11, "#FDE68A")
draw_text("typography", "ARTWORK [GROUP]", 64, 204, scale=1.0, color="#1E293B", size=2)

# Child 1: Highlights
draw_ellipse("left_panel", 46, 230, 10, 6, "#CBD5E1")
draw_ellipse("left_panel", 49, 231, 4, 4, "#475569")
draw_text("typography", "# HIGHLIGHTS", 66, 228, scale=1.0, color="#64748B", size=1)

# Child 2: Brush Shading
draw_ellipse("left_panel", 46, 258, 10, 6, "#CBD5E1")
draw_ellipse("left_panel", 49, 259, 4, 4, "#475569")
draw_text("typography", "# BRUSH SHADING", 66, 256, scale=1.0, color="#64748B", size=1)

# Child 3: LINEART (ACTIVE TARGET LAYER!)
draw_rounded_rect("left_panel", 20, 276, 212, 34, 4, "#E0F2FE")
draw_rect("left_panel", 20, 276, 4, 34, "#0D99FF")
draw_ellipse("left_panel", 46, 288, 10, 6, "#38BDF8")
draw_ellipse("left_panel", 49, 289, 4, 4, "#0369A1")
draw_text("typography", "# LINEART", 66, 284, scale=1.1, color="#0369A1", size=2)
draw_rounded_rect("left_panel", 154, 284, 68, 16, 3, "#0D99FF")
draw_text("typography", "TARGET", 164, 288, scale=0.85, color="#FFFFFF", size=1)

# Child 4: Pencil Roughs
draw_ellipse("left_panel", 46, 324, 10, 6, "#E2E8F0")
draw_ellipse("left_panel", 49, 325, 4, 4, "#94A3B8")
draw_text("typography", "# PENCIL ROUGHS", 66, 322, scale=1.0, color="#94A3B8", size=1)
draw_text("typography", "60%", 190, 322, scale=0.85, color="#94A3B8", size=1)

# Child 5: Backdrop Wash
draw_ellipse("left_panel", 46, 352, 10, 6, "#CBD5E1")
draw_ellipse("left_panel", 49, 353, 4, 4, "#475569")
draw_text("typography", "# BACKDROP WASH", 66, 350, scale=1.0, color="#64748B", size=1)

draw_rect("left_panel", 20, 376, 212, 1, "#F1F5F9")

# Logical grouping info box
draw_rounded_rect("left_panel", 22, 390, 208, 110, 6, "#F8FAFC")
draw_rect("left_panel", 22, 390, 208, 1, "#E2E8F0")
draw_text("typography", "LOGICAL GROUPING", 30, 400, scale=0.9, color="#64748B", size=1)
draw_text("typography", "TREE: 5 LAYERS ACTIVE", 30, 420, scale=0.85, color="#334155", size=1)
draw_text("typography", "ISOLATION: INK PASS", 30, 440, scale=0.85, color="#334155", size=1)
draw_text("typography", "BLENDING: PASSTHROUGH", 30, 460, scale=0.85, color="#334155", size=1)
draw_text("typography", "OPACITY: 100% COMPOSITE", 30, 480, scale=0.85, color="#334155", size=1)

# Bottom stats
draw_text("typography", "MARKS: 142 / 3000", 28, 650, scale=0.9, color="#94A3B8", size=1)
draw_text("typography", "CODESKETCH ENGINE V2", 28, 668, scale=0.85, color="#94A3B8", size=1)

# ==========================================
# 3. CENTER CANVAS & ARTBOARD (Layers: artboard & artwork_paint)
# ==========================================
draw_rounded_rect("artboard", 254, 58, 496, 556, 8, "#D1D5DB")
draw_rounded_rect("artboard", 252, 56, 496, 556, 8, "#FFFFFF")
draw_rect("artboard", 252, 56, 496, 1, "#CBD5E1")
draw_rect("artboard", 252, 56, 1, 556, "#CBD5E1")
draw_rect("artboard", 747, 56, 1, 556, "#CBD5E1")
draw_rect("artboard", 252, 611, 496, 1, "#CBD5E1")

draw_text("typography", "FRAME 1: MOUNTAIN HORIZON (1000 X 700 CANVAS)", 254, 46, scale=0.9, color="#64748B", size=1)

# Sunset bands
draw_rect("artwork_paint", 256, 60, 488, 60, "#DDD6FE", opacity=0.7)
draw_rect("artwork_paint", 256, 120, 488, 70, "#FED7AA", opacity=0.6)
draw_rect("artwork_paint", 256, 190, 488, 70, "#FECDD3", opacity=0.6)
draw_rect("artwork_paint", 256, 260, 488, 60, "#FEF08A", opacity=0.4)

# Distant mountains
mtn_pts_distant = [
    [256, 280], [310, 240], [360, 260], [420, 210], [480, 270],
    [540, 220], [600, 250], [660, 190], [710, 240], [744, 220]
]
draw_stroke("artwork_paint", mtn_pts_distant, color="#93C5FD", size=6, brush="brush", opacity=0.8)
for y in range(250, 320, 10):
    draw_rect("artwork_paint", 256, y, 488, 12, "#BFDBFE", opacity=0.35)

# Midground ridge
mtn_mid = [
    [256, 340], [290, 310], [340, 330], [390, 270], [450, 320],
    [510, 250], [570, 310], [630, 240], [680, 290], [744, 270]
]
draw_stroke("artwork_paint", mtn_mid, color="#3B82F6", size=8, brush="brush", opacity=0.9)
for y in range(300, 380, 12):
    draw_rect("artwork_paint", 256, y, 488, 14, "#2563EB", opacity=0.4)

# Crags
crags = [
    [[390, 270], [410, 340]],
    [[510, 250], [490, 330]],
    [[510, 250], [535, 340]],
    [[630, 240], [615, 330]],
    [[630, 240], [650, 320]]
]
for c in crags:
    draw_stroke("artwork_paint", c, color="#1D4ED8", size=4, brush="brush", opacity=0.8)

# Foreground hills
hill_pts = [
    [256, 430], [320, 400], [390, 420], [470, 380], [560, 410],
    [640, 370], [700, 390], [744, 380]
]
draw_stroke("artwork_paint", hill_pts, color="#047857", size=10, brush="brush", opacity=0.95)
for y in range(410, 520, 15):
    draw_rect("artwork_paint", 256, y, 488, 18, "#065F46", opacity=0.7)

# Pine trees
pine_positions = [280, 310, 345, 430, 460, 530, 580, 610, 660, 690]
for px in pine_positions:
    py = 390 if px < 470 else 370
    draw_stroke("artwork_paint", [[px, py+30], [px, py]], color="#022C22", size=3, brush="brush")
    draw_stroke("artwork_paint", [[px-8, py+18], [px, py+4], [px+8, py+18]], color="#064E3B", size=4, brush="brush")
    draw_stroke("artwork_paint", [[px-12, py+28], [px, py+12], [px+12, py+28]], color="#047857", size=4, brush="brush")

# Water
draw_rect("artwork_paint", 256, 520, 488, 88, "#0F172A", opacity=0.9)
for rx, ry, rw in [(300, 535, 80), (450, 545, 120), (360, 560, 90), (520, 575, 110), (400, 590, 70)]:
    draw_rect("artwork_paint", rx, ry, rw, 3, "#38BDF8", opacity=0.5)

# ACTIVE LIVE PAINTBRUSH STROKE IN PROGRESS!
active_brush_curve = [
    [360, 330], [390, 320], [425, 305], [460, 290], [500, 280], [540, 285], [575, 300]
]
draw_stroke("artwork_paint", active_brush_curve, color="#2563EB", size=14, brush="brush", opacity=1.0)

# Brush Cursor Reticle
draw_ellipse("journey_focus", 561, 286, 28, 28, "#2563EB", opacity=0.2)
draw_ellipse("journey_focus", 568, 293, 14, 14, "#2563EB", opacity=0.8)
draw_stroke("journey_focus", [[560, 300], [566, 300]], color="#0F172A", size=2)
draw_stroke("journey_focus", [[584, 300], [590, 300]], color="#0F172A", size=2)
draw_stroke("journey_focus", [[575, 285], [575, 291]], color="#0F172A", size=2)
draw_stroke("journey_focus", [[575, 309], [575, 315]], color="#0F172A", size=2)

draw_rounded_rect("journey_focus", 596, 284, 118, 24, 4, "#0F172A")
draw_text("journey_focus", "14PX - 100% FLOW", 602, 292, scale=0.85, color="#FFFFFF", size=1)

# ==========================================
# 4. RIGHT SIDEBAR PANEL (Layer: right_panel)
# ==========================================
draw_rounded_rect("right_panel", 762, 56, 224, 630, 10, "#FFFFFF")
draw_rect("right_panel", 762, 56, 224, 1, "#E2E8F0")
draw_rect("right_panel", 762, 56, 1, 630, "#E2E8F0")
draw_rect("right_panel", 985, 56, 1, 630, "#E2E8F0")
draw_rect("right_panel", 762, 685, 224, 1, "#E2E8F0")

# Header Tabs
draw_rect("right_panel", 762, 56, 224, 32, "#F8FAFC")
draw_rect("right_panel", 762, 88, 224, 1, "#E2E8F0")
draw_text("typography", "DESIGN", 776, 68, scale=1.0, color="#0F172A", size=2)
draw_rect("right_panel", 774, 86, 52, 2, "#0D99FF")
draw_text("typography", "PROTOTYPE", 840, 68, scale=1.0, color="#64748B", size=1)
draw_text("typography", "100%", 942, 68, scale=1.0, color="#0F172A", size=1)

# Section 1: Active Tool Header
draw_text("typography", "ACTIVE TOOL", 774, 100, scale=0.85, color="#94A3B8", size=1)
draw_rounded_rect("right_panel", 772, 114, 204, 28, 4, "#F8FAFC")
draw_rect("right_panel", 772, 114, 204, 1, "#E2E8F0")
draw_ellipse("right_panel", 778, 122, 12, 12, "#0D99FF")
draw_text("typography", "STUDIO INKER  V", 796, 122, scale=1.0, color="#0F172A", size=2)

# Segmented Brush Mode Switcher
draw_rounded_rect("right_panel", 772, 148, 204, 24, 4, "#F1F5F9")
draw_rounded_rect("right_panel", 773, 149, 50, 22, 3, "#0D99FF")
draw_text("typography", "BRUSH", 779, 155, scale=0.85, color="#FFFFFF", size=1)
draw_text("typography", "PENCIL", 830, 155, scale=0.85, color="#64748B", size=1)
draw_text("typography", "MARK", 884, 155, scale=0.85, color="#64748B", size=1)
draw_text("typography", "ERASE", 934, 155, scale=0.85, color="#64748B", size=1)

draw_rect("right_panel", 772, 180, 204, 1, "#F1F5F9")

# Section 2: Stroke Properties (Sliders matching Figma UI3)
draw_text("typography", "STROKE PROPERTIES", 774, 192, scale=0.85, color="#94A3B8", size=1)

# Property 1: SIZE
draw_text("typography", "SIZE", 774, 210, scale=0.9, color="#475569", size=1)
draw_rounded_rect("right_panel", 926, 204, 50, 20, 3, "#F1F5F9")
draw_rect("right_panel", 926, 204, 50, 1, "#CBD5E1")
draw_text("typography", "14 PX", 932, 210, scale=0.9, color="#0F172A", size=1)
draw_rounded_rect("right_panel", 774, 228, 144, 6, 3, "#E2E8F0")
draw_rounded_rect("right_panel", 774, 228, 68, 6, 3, "#0D99FF")
draw_ellipse("right_panel", 838, 224, 14, 14, "#FFFFFF")
draw_ellipse("right_panel", 840, 226, 10, 10, "#0D99FF")

# Property 2: FLOW / OPACITY
draw_text("typography", "FLOW / OPACITY", 774, 248, scale=0.9, color="#475569", size=1)
draw_rounded_rect("right_panel", 926, 242, 50, 20, 3, "#F1F5F9")
draw_rect("right_panel", 926, 242, 50, 1, "#CBD5E1")
draw_text("typography", "100%", 934, 248, scale=0.9, color="#0F172A", size=1)
draw_rounded_rect("right_panel", 774, 266, 144, 6, 3, "#0D99FF")
draw_ellipse("right_panel", 910, 262, 14, 14, "#FFFFFF")
draw_ellipse("right_panel", 912, 264, 10, 10, "#0D99FF")

# Property 3: SMOOTHING
draw_text("typography", "SMOOTHING", 774, 286, scale=0.9, color="#475569", size=1)
draw_rounded_rect("right_panel", 926, 280, 50, 20, 3, "#F1F5F9")
draw_rect("right_panel", 926, 280, 50, 1, "#CBD5E1")
draw_text("typography", "75%", 936, 286, scale=0.9, color="#0F172A", size=1)
draw_rounded_rect("right_panel", 774, 304, 144, 6, 3, "#E2E8F0")
draw_rounded_rect("right_panel", 774, 304, 108, 6, 3, "#0D99FF")
draw_ellipse("right_panel", 876, 300, 14, 14, "#FFFFFF")
draw_ellipse("right_panel", 878, 302, 10, 10, "#0D99FF")

draw_rect("right_panel", 772, 322, 204, 1, "#F1F5F9")

# Section 3: Color & Swatches
draw_text("typography", "COLOR & PIGMENT", 774, 334, scale=0.85, color="#94A3B8", size=1)
draw_rounded_rect("right_panel", 774, 348, 30, 30, 4, "#2563EB")
draw_rounded_rect("right_panel", 812, 348, 98, 30, 4, "#F8FAFC")
draw_rect("right_panel", 812, 348, 98, 1, "#E2E8F0")
draw_text("typography", "#2563EB", 820, 358, scale=1.0, color="#0F172A", size=1)
draw_rounded_rect("right_panel", 916, 348, 60, 30, 4, "#F8FAFC")
draw_rect("right_panel", 916, 348, 60, 1, "#E2E8F0")
draw_text("typography", "100%", 928, 358, scale=1.0, color="#0F172A", size=1)

palette = ["#2563EB", "#EF4444", "#10B981", "#F59E0B", "#0F172A", "#FFFFFF"]
for i, col in enumerate(palette):
    cx = 774 + i * 35
    draw_ellipse("right_panel", cx, 388, 22, 22, col)
    draw_ellipse("right_panel", cx, 388, 22, 22, "#CBD5E1", opacity=0.4)

draw_rect("right_panel", 772, 420, 204, 1, "#F1F5F9")

# ==========================================
# Section 4: TARGET LAYER (CORE JOURNEY!)
# ==========================================
draw_rounded_rect("right_panel", 770, 432, 208, 90, 6, "#F0F9FF")
draw_rect("right_panel", 770, 432, 208, 1, "#BAE6FD")
draw_rect("right_panel", 770, 432, 1, 90, "#BAE6FD")
draw_rect("right_panel", 977, 432, 1, 90, "#BAE6FD")
draw_rect("right_panel", 770, 521, 208, 1, "#BAE6FD")

draw_text("typography", "TARGET LAYER (ACTIVE)", 780, 442, scale=0.9, color="#0284C7", size=2)
draw_text("typography", "STROKES COMMIT TO:", 780, 458, scale=0.8, color="#475569", size=1)

# Target Layer Dropdown Button
draw_rounded_rect("right_panel", 778, 470, 192, 28, 4, "#FFFFFF")
draw_rect("right_panel", 778, 470, 192, 1, "#0284C7")
draw_ellipse("right_panel", 786, 478, 12, 12, "#0284C7")
draw_text("typography", "# LINEART  (PASS 03)  V", 804, 478, scale=0.95, color="#0369A1", size=2)

draw_ellipse("right_panel", 780, 508, 6, 6, "#10B981")
draw_text("typography", "LINKED TO LEFT HIERARCHY", 792, 506, scale=0.8, color="#0369A1", size=1)

# Section 5: Document Controls & Export
draw_rect("right_panel", 772, 532, 204, 1, "#F1F5F9")
draw_text("typography", "EXPORT & FORMAT", 774, 544, scale=0.85, color="#94A3B8", size=1)

draw_rounded_rect("right_panel", 774, 560, 204, 26, 4, "#F8FAFC")
draw_rect("right_panel", 774, 560, 204, 1, "#CBD5E1")
draw_text("typography", "EXPORT PNG (1000X700)", 788, 568, scale=0.9, color="#334155", size=1)

draw_rounded_rect("right_panel", 774, 594, 204, 26, 4, "#F8FAFC")
draw_rect("right_panel", 774, 594, 204, 1, "#CBD5E1")
draw_text("typography", "SAVE PROJECT JSON V2", 790, 602, scale=0.9, color="#334155", size=1)

# ==========================================
# 5. BOTTOM FLOATING TOOLBAR (Layer: toolbar)
# ==========================================
# Soft shadow
draw_rounded_rect("toolbar", 332, 630, 340, 52, 26, "#94A3B8", opacity=0.35)
# White pill body
draw_rounded_rect("toolbar", 330, 628, 340, 52, 26, "#FFFFFF")
draw_stroke("toolbar", [[356, 628], [644, 628]], color="#CBD5E1", size=1)
draw_stroke("toolbar", [[356, 680], [644, 680]], color="#CBD5E1", size=1)

# Tools:
# 1. Pointer (Select)
draw_stroke("toolbar", [[348, 644], [348, 664], [354, 658], [362, 666], [365, 663], [357, 655], [364, 655], [348, 644]], color="#475569", size=2)

# 2. Frame (#)
draw_stroke("toolbar", [[388, 644], [388, 664]], color="#475569", size=2)
draw_stroke("toolbar", [[398, 644], [398, 664]], color="#475569", size=2)
draw_stroke("toolbar", [[384, 649], [402, 649]], color="#475569", size=2)
draw_stroke("toolbar", [[384, 659], [402, 659]], color="#475569", size=2)

# 3. Shape (Rectangle)
draw_stroke("toolbar", [[422, 646], [440, 646], [440, 662], [422, 662], [422, 646]], color="#475569", size=2)

# 4. PAINTBRUSH (THE ACTIVE TOOL!)
draw_rounded_rect("toolbar", 460, 632, 44, 44, 10, "#0D99FF")
draw_stroke("toolbar", [[474, 662], [484, 650]], color="#FFFFFF", size=3)
draw_stroke("toolbar", [[484, 650], [488, 645]], color="#E0F2FE", size=4)
draw_stroke("toolbar", [[488, 645], [493, 639], [490, 644]], color="#FFFFFF", size=3)
draw_ellipse("toolbar", 480, 672, 4, 4, "#0D99FF")

# 5. Pen / Vector
draw_stroke("toolbar", [[524, 644], [534, 654], [528, 664], [518, 654], [524, 644]], color="#475569", size=2)
draw_stroke("toolbar", [[526, 656], [526, 664]], color="#475569", size=2)

# 6. Text (T)
draw_stroke("toolbar", [[554, 646], [568, 646]], color="#475569", size=2)
draw_stroke("toolbar", [[561, 646], [561, 664]], color="#475569", size=2)

# 7. Comment (Speech bubble)
draw_stroke("toolbar", [[592, 646], [610, 646], [610, 658], [602, 658], [596, 664], [596, 658], [592, 658], [592, 646]], color="#475569", size=2)

# Mode Divider
draw_rect("toolbar", 626, 638, 1, 32, "#E2E8F0")

# 8. Dev Mode Toggle (</>)
draw_stroke("toolbar", [[640, 651], [636, 654], [640, 657]], color="#64748B", size=2)
draw_stroke("toolbar", [[644, 651], [648, 654], [644, 657]], color="#64748B", size=2)

# ==========================================
# 6. USER JOURNEY CALLOUTS (Layer: journey_focus)
# ==========================================
draw_rounded_rect("journey_focus", 440, 606, 120, 18, 4, "#0F172A")
draw_text("journey_focus", "1. CLICK PAINTBRUSH", 446, 612, scale=0.8, color="#FFFFFF", size=1)
draw_stroke("journey_focus", [[482, 624], [482, 630]], color="#0F172A", size=2)

draw_rounded_rect("journey_focus", 630, 206, 124, 18, 4, "#0F172A")
draw_text("journey_focus", "2. TOOL PROPERTIES", 636, 212, scale=0.8, color="#FFFFFF", size=1)
draw_stroke("journey_focus", [[754, 215], [764, 215]], color="#0F172A", size=2)

draw_rounded_rect("journey_focus", 630, 442, 124, 18, 4, "#0F172A")
draw_text("journey_focus", "3. TARGET LAYER SET", 636, 448, scale=0.8, color="#FFFFFF", size=1)
draw_stroke("journey_focus", [[754, 451], [764, 451]], color="#0F172A", size=2)

for dx in range(234, 762, 16):
    draw_stroke("journey_focus", [[dx, 470], [dx+8, 470]], color="#0284C7", size=1, opacity=0.6)

print(f"Total commands generated: {len(commands)}")

# Validate all commands
valid_types = {"fill", "layer.add", "rect", "ellipse", "stroke"}
for i, cmd in enumerate(commands):
    ctype = cmd.get("type")
    assert ctype in valid_types, f"Command {i} invalid type: {ctype}"
    if ctype in ("rect", "ellipse"):
        assert 0 <= cmd["x"] <= 1000, f"Cmd {i} x out of bounds: {cmd['x']}"
        assert 0 <= cmd["y"] <= 700, f"Cmd {i} y out of bounds: {cmd['y']}"
        assert cmd["x"] + cmd["width"] <= 1000, f"Cmd {i} x+w out of bounds: {cmd['x'] + cmd['width']}"
        assert cmd["y"] + cmd["height"] <= 700, f"Cmd {i} y+h out of bounds: {cmd['y'] + cmd['height']}"
    elif ctype == "stroke":
        for pt in cmd["points"]:
            assert 0 <= pt[0] <= 1000, f"Cmd {i} pt x out of bounds: {pt[0]}"
            assert 0 <= pt[1] <= 700, f"Cmd {i} pt y out of bounds: {pt[1]}"

# Write commands JSON
output_path = "/private/tmp/codesketch-designer-20260910-fresh/artifacts/drawing/mockup_commands.json"
with open(output_path, "w") as f:
    json.dump(commands, f, indent=2)

# Write project v2 JSON
project_path = "/private/tmp/codesketch-designer-20260910-fresh/artifacts/drawing/mockup_project.json"
project_data = {
    "format": "codesketch",
    "version": 2,
    "commands": commands,
    "cursor": len(commands),
    "queue": [],
    "comments": []
}
with open(project_path, "w") as f:
    json.dump(project_data, f, indent=2)

print(f"Successfully wrote {output_path} and {project_path}")
