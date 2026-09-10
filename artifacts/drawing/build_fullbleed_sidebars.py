import json
import math

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
# BUILD FULL-BLEED REVISIONS (No padding around sidebars)
# Everything drawn on "typography" to completely cover prior elements cleanly
# =========================================================================

# 1. CLEAN CANVAS TOP STRIP
# Wipes top space above artboard: x=236..764, y=0..52
draw_rect("typography", 236, 0, 528, 52, "#EEF2F6")
# Artboard label centered above artboard
draw_text("typography", "FRAME 1: MOUNTAIN HORIZON (1000 X 700 CANVAS)", 254, 38, scale=0.85, color="#64748B", size=1)

# =========================================================================
# 2. FULL-BLEED LEFT SIDEBAR (x: 0..240, y: 0..700)
# =========================================================================
# Flush background & border
draw_rect("typography", 0, 0, 240, 700, "#FFFFFF")
draw_rect("typography", 239, 0, 1, 700, "#E2E8F0")

# Header (y=0..46): Codesketch brand + collapse icon
draw_rounded_rect("typography", 16, 14, 18, 18, 4, "#0D99FF")
draw_stroke("typography", [[20, 23], [25, 18], [30, 23]], color="#FFFFFF", size=2)
draw_text("typography", "CODESKETCH", 40, 17, scale=0.95, color="#0F172A", size=2)
draw_stroke("typography", [[146, 21], [150, 25], [154, 21]], color="#64748B", size=2) # dropdown arrow
# Toggle sidebar icon
draw_rounded_rect("typography", 206, 12, 22, 22, 4, "#F8FAFC")
draw_rect("typography", 206, 12, 22, 1, "#E2E8F0")
draw_stroke("typography", [[212, 17], [212, 29]], color="#64748B", size=2)
draw_stroke("typography", [[217, 17], [223, 23], [217, 29]], color="#64748B", size=2)
draw_rect("typography", 0, 46, 240, 1, "#E2E8F0")

# Navigation tabs (y=48..78)
draw_rect("typography", 0, 47, 240, 31, "#FAFAFA")
draw_text("typography", "LAYERS", 24, 57, scale=0.95, color="#0F172A", size=2)
draw_rect("typography", 22, 76, 54, 2, "#0D99FF") # active tab underline
draw_text("typography", "ASSETS", 100, 57, scale=0.95, color="#64748B", size=1)
draw_text("typography", "PAGES", 172, 57, scale=0.95, color="#64748B", size=1)
draw_rect("typography", 0, 78, 240, 1, "#E2E8F0")

# PAGES Section (y=86..156)
draw_text("typography", "PAGES", 20, 92, scale=0.85, color="#94A3B8", size=1)
draw_text("typography", "+", 218, 92, scale=1.1, color="#64748B", size=2)
draw_rounded_rect("typography", 16, 108, 208, 22, 4, "#F1F5F9")
draw_ellipse("typography", 24, 115, 8, 8, "#0D99FF")
draw_text("typography", "CANVAS 1 - MAIN", 38, 114, scale=0.9, color="#0F172A", size=1)
draw_ellipse("typography", 24, 137, 8, 8, "#CBD5E1")
draw_text("typography", "REFERENCE STUDY", 38, 136, scale=0.9, color="#64748B", size=1)
draw_rect("typography", 16, 156, 208, 1, "#F1F5F9")

# LAYERS Section (y=164..360)
draw_text("typography", "LAYERS (SCENE HIERARCHY)", 20, 168, scale=0.85, color="#94A3B8", size=1)
# Group folder
draw_stroke("typography", [[22, 192], [27, 197], [32, 192]], color="#64748B", size=2)
draw_rect("typography", 38, 188, 14, 11, "#FDE68A")
draw_text("typography", "ARTWORK [GROUP]", 58, 190, scale=0.95, color="#1E293B", size=2)

# Child 1: Highlights
draw_ellipse("typography", 42, 216, 10, 6, "#CBD5E1")
draw_ellipse("typography", 45, 217, 4, 4, "#475569")
draw_text("typography", "# HIGHLIGHTS", 60, 214, scale=0.9, color="#64748B", size=1)

# Child 2: Brush Shading
draw_ellipse("typography", 42, 240, 10, 6, "#CBD5E1")
draw_ellipse("typography", 45, 241, 4, 4, "#475569")
draw_text("typography", "# BRUSH SHADING", 60, 238, scale=0.9, color="#64748B", size=1)

# Child 3: Lineart (TARGET LAYER!)
draw_rounded_rect("typography", 16, 260, 208, 28, 4, "#E0F2FE")
draw_rect("typography", 16, 260, 3, 28, "#0284C7")
draw_ellipse("typography", 42, 270, 10, 6, "#BAE6FD")
draw_ellipse("typography", 45, 271, 4, 4, "#0369A1")
draw_text("typography", "# LINEART", 60, 268, scale=0.95, color="#0369A1", size=2)
draw_rounded_rect("typography", 148, 265, 68, 18, 3, "#0D99FF")
draw_text("typography", "TARGET", 158, 269, scale=0.85, color="#FFFFFF", size=1)

# Child 4: Pencil Roughs
draw_ellipse("typography", 42, 300, 10, 6, "#E2E8F0")
draw_ellipse("typography", 45, 301, 4, 4, "#94A3B8")
draw_text("typography", "# PENCIL ROUGHS", 60, 298, scale=0.9, color="#94A3B8", size=1)
draw_text("typography", "60%", 184, 298, scale=0.85, color="#94A3B8", size=1)

# Child 5: Backdrop Wash
draw_ellipse("typography", 42, 324, 10, 6, "#CBD5E1")
draw_ellipse("typography", 45, 325, 4, 4, "#475569")
draw_text("typography", "# BACKDROP WASH", 60, 322, scale=0.9, color="#64748B", size=1)
draw_rect("typography", 16, 348, 208, 1, "#F1F5F9")

# Logical grouping info box (y=360..480)
draw_rounded_rect("typography", 16, 360, 208, 114, 6, "#F8FAFC")
draw_rect("typography", 16, 360, 208, 1, "#E2E8F0")
draw_text("typography", "LOGICAL GROUPING", 26, 372, scale=0.85, color="#64748B", size=1)
draw_text("typography", "TREE: 5 LAYERS ACTIVE", 26, 394, scale=0.8, color="#334155", size=1)
draw_text("typography", "ISOLATION: INK PASS", 26, 414, scale=0.8, color="#334155", size=1)
draw_text("typography", "BLENDING: PASSTHROUGH", 26, 434, scale=0.8, color="#334155", size=1)
draw_text("typography", "OPACITY: 100% COMPOSITE", 26, 454, scale=0.8, color="#334155", size=1)

# Bottom stats
draw_text("typography", "MARKS: 142 / 3000", 20, 650, scale=0.85, color="#94A3B8", size=1)
draw_text("typography", "CODESKETCH ENGINE V2", 20, 668, scale=0.8, color="#94A3B8", size=1)


# =========================================================================
# 3. FULL-BLEED RIGHT SIDEBAR (x: 760..1000, y: 0..700)
# =========================================================================
# Flush background & border
draw_rect("typography", 760, 0, 240, 700, "#FFFFFF")
draw_rect("typography", 760, 0, 1, 700, "#E2E8F0")

# Header (y=0..46): Collaborator Avatars & Blue Share CTA Button
# Avatar A (orange)
draw_ellipse("typography", 774, 13, 22, 22, "#EA580C")
draw_text("typography", "A", 781, 19, scale=0.85, color="#FFFFFF", size=1)
# Avatar F (green)
draw_ellipse("typography", 800, 13, 22, 22, "#059669")
draw_text("typography", "F", 807, 19, scale=0.85, color="#FFFFFF", size=1)
# Avatar S (purple)
draw_ellipse("typography", 826, 13, 22, 22, "#7C3AED")
draw_text("typography", "S", 833, 19, scale=0.85, color="#FFFFFF", size=1)
# Play/Present button
draw_stroke("typography", [[858, 18], [858, 28], [866, 23], [858, 18]], color="#475569", size=2)
# Blue Share Button
draw_rounded_rect("typography", 880, 11, 108, 26, 6, "#0D99FF")
draw_text("typography", "SHARE", 912, 18, scale=1.0, color="#FFFFFF", size=2)
draw_rect("typography", 760, 46, 240, 1, "#E2E8F0")

# Header Tabs: DESIGN | PROTOTYPE  100%
draw_rect("typography", 760, 47, 240, 31, "#FAFAFA")
draw_text("typography", "DESIGN", 776, 57, scale=0.95, color="#0F172A", size=2)
draw_rect("typography", 774, 76, 52, 2, "#0D99FF") # active tab underline
draw_text("typography", "PROTOTYPE", 840, 57, scale=0.95, color="#64748B", size=1)
draw_text("typography", "100%", 942, 57, scale=0.95, color="#0F172A", size=1)
draw_stroke("typography", [[980, 61], [984, 65], [988, 61]], color="#64748B", size=1) # zoom chevron
draw_rect("typography", 760, 78, 240, 1, "#E2E8F0")

# Section 1: Active Tool Header (y=88..166)
draw_text("typography", "ACTIVE TOOL", 774, 92, scale=0.85, color="#94A3B8", size=1)
draw_rounded_rect("typography", 772, 104, 216, 28, 4, "#F8FAFC")
draw_rect("typography", 772, 104, 216, 1, "#E2E8F0")
draw_ellipse("typography", 780, 112, 12, 12, "#0D99FF")
draw_text("typography", "STUDIO INKER  V", 800, 112, scale=0.95, color="#0F172A", size=2)

# Segmented Brush Mode Switcher
draw_rounded_rect("typography", 772, 138, 216, 24, 4, "#F1F5F9")
draw_rounded_rect("typography", 773, 139, 52, 22, 3, "#0D99FF")
draw_text("typography", "BRUSH", 781, 145, scale=0.85, color="#FFFFFF", size=1)
draw_text("typography", "PENCIL", 834, 145, scale=0.85, color="#64748B", size=1)
draw_text("typography", "MARK", 890, 145, scale=0.85, color="#64748B", size=1)
draw_text("typography", "ERASE", 942, 145, scale=0.85, color="#64748B", size=1)
draw_rect("typography", 772, 170, 216, 1, "#F1F5F9")

# Section 2: Stroke Properties (Sliders matching Figma UI3)
draw_text("typography", "STROKE PROPERTIES", 774, 180, scale=0.85, color="#94A3B8", size=1)

# Property 1: SIZE
draw_text("typography", "SIZE", 774, 198, scale=0.9, color="#475569", size=1)
draw_rounded_rect("typography", 936, 192, 52, 20, 3, "#F1F5F9")
draw_rect("typography", 936, 192, 52, 1, "#CBD5E1")
draw_text("typography", "14 PX", 944, 198, scale=0.9, color="#0F172A", size=1)
draw_rounded_rect("typography", 774, 216, 150, 6, 3, "#E2E8F0")
draw_rounded_rect("typography", 774, 216, 70, 6, 3, "#0D99FF")
draw_ellipse("typography", 840, 212, 14, 14, "#FFFFFF")
draw_ellipse("typography", 842, 214, 10, 10, "#0D99FF")

# Property 2: FLOW / OPACITY
draw_text("typography", "FLOW / OPACITY", 774, 236, scale=0.9, color="#475569", size=1)
draw_rounded_rect("typography", 936, 230, 52, 20, 3, "#F1F5F9")
draw_rect("typography", 936, 230, 52, 1, "#CBD5E1")
draw_text("typography", "100%", 944, 236, scale=0.9, color="#0F172A", size=1)
draw_rounded_rect("typography", 774, 254, 150, 6, 3, "#0D99FF")
draw_ellipse("typography", 918, 250, 14, 14, "#FFFFFF")
draw_ellipse("typography", 920, 252, 10, 10, "#0D99FF")

# Property 3: SMOOTHING
draw_text("typography", "SMOOTHING", 774, 274, scale=0.9, color="#475569", size=1)
draw_rounded_rect("typography", 936, 268, 52, 20, 3, "#F1F5F9")
draw_rect("typography", 936, 268, 52, 1, "#CBD5E1")
draw_text("typography", "75%", 946, 274, scale=0.9, color="#0F172A", size=1)
draw_rounded_rect("typography", 774, 292, 150, 6, 3, "#E2E8F0")
draw_rounded_rect("typography", 774, 292, 112, 6, 3, "#0D99FF")
draw_ellipse("typography", 882, 288, 14, 14, "#FFFFFF")
draw_ellipse("typography", 884, 290, 10, 10, "#0D99FF")
draw_rect("typography", 772, 310, 216, 1, "#F1F5F9")

# Section 3: Color & Swatches
draw_text("typography", "COLOR & PIGMENT", 774, 322, scale=0.85, color="#94A3B8", size=1)
draw_rounded_rect("typography", 774, 336, 30, 30, 4, "#2563EB")
draw_rounded_rect("typography", 814, 336, 104, 30, 4, "#F8FAFC")
draw_rect("typography", 814, 336, 104, 1, "#E2E8F0")
draw_text("typography", "#2563EB", 824, 346, scale=1.0, color="#0F172A", size=1)
draw_rounded_rect("typography", 926, 336, 62, 30, 4, "#F8FAFC")
draw_rect("typography", 926, 336, 62, 1, "#E2E8F0")
draw_text("typography", "100%", 938, 346, scale=1.0, color="#0F172A", size=1)

palette = ["#2563EB", "#EF4444", "#10B981", "#F59E0B", "#0F172A", "#FFFFFF"]
for i, col in enumerate(palette):
    cx = 774 + i * 36
    draw_ellipse("typography", cx, 376, 22, 22, col)
    draw_ellipse("typography", cx, 376, 22, 22, "#CBD5E1", opacity=0.4)

draw_rect("typography", 772, 408, 216, 1, "#F1F5F9")

# Section 4: TARGET LAYER (CORE USER JOURNEY)
draw_rounded_rect("typography", 770, 418, 220, 92, 6, "#F0F9FF")
draw_rect("typography", 770, 418, 220, 1, "#BAE6FD")
draw_rect("typography", 770, 418, 1, 92, "#BAE6FD")
draw_rect("typography", 989, 418, 1, 92, "#BAE6FD")
draw_rect("typography", 770, 509, 220, 1, "#BAE6FD")

draw_text("typography", "TARGET LAYER (ACTIVE)", 780, 428, scale=0.9, color="#0284C7", size=2)
draw_text("typography", "STROKES COMMIT TO:", 780, 444, scale=0.8, color="#475569", size=1)

# Target Layer Dropdown Button
draw_rounded_rect("typography", 778, 456, 202, 28, 4, "#FFFFFF")
draw_rect("typography", 778, 456, 202, 1, "#0284C7")
draw_ellipse("typography", 786, 464, 12, 12, "#0284C7")
draw_text("typography", "# LINEART  (PASS 03)  V", 804, 464, scale=0.95, color="#0369A1", size=2)

draw_ellipse("typography", 780, 494, 6, 6, "#10B981")
draw_text("typography", "LINKED TO LEFT HIERARCHY", 792, 492, scale=0.8, color="#0369A1", size=1)

# Section 5: Document Controls & Export
draw_rect("typography", 772, 520, 216, 1, "#F1F5F9")
draw_text("typography", "EXPORT & FORMAT", 774, 532, scale=0.85, color="#94A3B8", size=1)

draw_rounded_rect("typography", 774, 548, 212, 26, 4, "#F8FAFC")
draw_rect("typography", 774, 548, 212, 1, "#CBD5E1")
draw_text("typography", "EXPORT PNG (1000X700)", 794, 556, scale=0.9, color="#334155", size=1)

draw_rounded_rect("typography", 774, 582, 212, 26, 4, "#F8FAFC")
draw_rect("typography", 774, 582, 212, 1, "#CBD5E1")
draw_text("typography", "SAVE PROJECT JSON V2", 796, 590, scale=0.9, color="#334155", size=1)

# Journey callout badges:
# Badge 2: Tool Properties
draw_rounded_rect("typography", 628, 212, 126, 22, 4, "#0F172A")
draw_text("typography", "2. TOOL PROPERTIES", 634, 218, scale=0.85, color="#FFFFFF", size=1)
draw_stroke("typography", [[754, 223], [760, 223]], color="#0F172A", size=2)

# Badge 3: Target Layer
draw_rounded_rect("typography", 628, 436, 126, 22, 4, "#0F172A")
draw_text("typography", "3. TARGET LAYER SET", 634, 442, scale=0.85, color="#FFFFFF", size=1)
draw_stroke("typography", [[754, 447], [760, 447]], color="#0F172A", size=2)

print(f"Total commands generated: {len(commands)}")
with open("/private/tmp/codesketch-designer-20260910-fresh/artifacts/drawing/revisions_fullbleed.json", "w") as f:
    json.dump(commands, f, indent=2)
