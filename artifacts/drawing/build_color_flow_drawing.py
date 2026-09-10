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

def draw_stroke(layer, pts, color="#1E293B", size=1, brush="brush", opacity=1.0):
    clamped_pts = []
    for pt in pts:
        cx = max(0, min(1000, int(round(pt[0]))))
        cy = max(0, min(700, int(round(pt[1]))))
        clamped_pts.append([cx, cy])
    if len(clamped_pts) == 1:
        clamped_pts.append([clamped_pts[0][0], clamped_pts[0][1]])
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
# 1. RIGHT SIDEBAR BASE RE-RENDER
# =========================================================================
draw_rect("typography", 740, 0, 260, 700, "#FFFFFF")

# Header
draw_text("typography", "STUDIO", 756, 20, scale=0.95, color="#0F172A", size=1)
draw_text("typography", "FB", 830, 20, scale=0.85, color="#3B82F6", size=1)
draw_rounded_rect("typography", 872, 11, 62, 24, 3, "#0284C7")
draw_text("typography", "SAVE", 887, 18, scale=0.85, color="#FFFFFF", size=1)
draw_stroke("typography", [[968, 16], [974, 22], [968, 28]], color="#64748B", size=1)
draw_stroke("typography", [[978, 16], [978, 28]], color="#64748B", size=1)

# Tools
draw_text("typography", "TOOL", 756, 56, scale=0.85, color="#64748B", size=1)
draw_text("typography", "INK", 772, 79, scale=0.85, color="#0284C7", size=1)
draw_text("typography", "PENCIL", 824, 79, scale=0.85, color="#94A3B8", size=1)
draw_text("typography", "MARK", 882, 79, scale=0.85, color="#94A3B8", size=1)
draw_text("typography", "ERASE", 936, 79, scale=0.85, color="#94A3B8", size=1)

# Stroke Properties Sliders
draw_text("typography", "STROKE PROPERTIES", 756, 116, scale=0.85, color="#64748B", size=1)

# SIZE (14 PX)
draw_text("typography", "SIZE", 756, 136, scale=0.8, color="#475569", size=1)
draw_text("typography", "14 PX", 942, 136, scale=0.8, color="#0F172A", size=1)
draw_rect("typography", 756, 150, 228, 2, "#E2E8F0")
draw_rect("typography", 756, 150, 32, 2, "#0284C7")
draw_ellipse("typography", 784, 147, 8, 8, "#0284C7")
draw_ellipse("typography", 787, 150, 2, 2, "#FFFFFF")

# OPACITY (100%)
draw_text("typography", "OPACITY", 756, 166, scale=0.8, color="#475569", size=1)
draw_text("typography", "100%", 948, 166, scale=0.8, color="#0F172A", size=1)
draw_rect("typography", 756, 180, 228, 2, "#0284C7")
draw_ellipse("typography", 978, 177, 8, 8, "#0284C7")
draw_ellipse("typography", 981, 180, 2, 2, "#FFFFFF")

# SMOOTHING (75%)
draw_text("typography", "SMOOTHING", 756, 196, scale=0.8, color="#475569", size=1)
draw_text("typography", "75%", 952, 196, scale=0.8, color="#0F172A", size=1)
draw_rect("typography", 756, 210, 228, 2, "#E2E8F0")
draw_rect("typography", 756, 210, 171, 2, "#0284C7")
draw_ellipse("typography", 923, 207, 8, 8, "#0284C7")
draw_ellipse("typography", 926, 210, 2, 2, "#FFFFFF")

# INK PIGMENT (Active state indicator showing it was clicked to open editor)
draw_text("typography", "INK PIGMENT", 756, 230, scale=0.8, color="#0284C7", size=1)
# Active outline pill around hex code to show click focus
draw_rounded_rect("typography", 916, 226, 68, 18, 3, "#E0F2FE")
draw_text("typography", "#2563EB", 924, 230, scale=0.8, color="#0284C7", size=1)

# Palette Chips
pigments = [
    (764, "#0F172A", False),
    (794, "#64748B", False),
    (824, "#2563EB", True),
    (854, "#0EA5E9", False),
    (884, "#10B981", False),
    (914, "#F59E0B", False),
    (944, "#EF4444", False),
    (974, "#FFFFFF", False),
]
for cx, col, is_sel in pigments:
    if is_sel:
        draw_ellipse("typography", cx - 10, 246, 20, 20, "#0284C7")
        draw_ellipse("typography", cx - 8, 248, 16, 16, "#FFFFFF")
        draw_ellipse("typography", cx - 6, 250, 12, 12, col)
    elif col == "#FFFFFF":
        draw_ellipse("typography", cx - 7, 249, 14, 14, "#CBD5E1")
        draw_ellipse("typography", cx - 6, 250, 12, 12, "#FFFFFF")
    else:
        draw_ellipse("typography", cx - 6, 250, 12, 12, col)

# Divider
draw_rect("typography", 756, 276, 228, 1, "#F1F5F9")

# Layers Stack
draw_text("typography", "LAYERS", 756, 296, scale=0.9, color="#0F172A", size=1)
draw_text("typography", "+ NEW", 938, 296, scale=0.8, color="#0284C7", size=1)

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

ly = 320
for num, name, op, is_active in layers_stack:
    if is_active:
        draw_rect("typography", 740, ly - 2, 3, 44, "#0284C7")
        draw_rect("typography", 743, ly - 2, 257, 44, "#F0F9FF")
        draw_text("typography", f"{num} {name}", 756, ly + 4, scale=0.85, color="#0284C7", size=1)
        draw_text("typography", op, 934, ly + 4, scale=0.8, color="#0284C7", size=1)
        draw_eye_icon("typography", 972, ly + 4, vis=True, color="#0284C7")
        
        # Inline Micro-slider for Layer Opacity
        draw_text("typography", "OPACITY", 756, ly + 24, scale=0.65, color="#0369A1", size=1)
        draw_rect("typography", 810, ly + 26, 124, 2, "#BAE6FD")
        draw_rect("typography", 810, ly + 26, 124, 2, "#0284C7")
        draw_ellipse("typography", 931, ly + 24, 6, 6, "#0284C7")
        draw_ellipse("typography", 933, ly + 26, 2, 2, "#FFFFFF")
        draw_text("typography", "100%", 944, ly + 24, scale=0.65, color="#0284C7", size=1)
        
        ly += 48
    else:
        draw_text("typography", f"{num} {name}", 756, ly + 4, scale=0.85, color="#475569", size=1)
        draw_text("typography", op, 934, ly + 4, scale=0.8, color="#0284C7" if is_active else "#64748B", size=1)
        draw_eye_icon("typography", 972, ly + 4, vis=True, color="#94A3B8")
        ly += 30

draw_text("typography", "CODESKETCH ENGINE V2", 756, 668, scale=0.8, color="#94A3B8", size=1)


# =========================================================================
# 2. COLOR CUSTOMIZATION POPOVER FLYOUT CARD (x: 476..724, y: 168..384)
# Anchored to the left of the right sidebar with pointer arrow to #2563EB
# =========================================================================
# Soft Shadow
draw_rounded_rect("typography", 479, 171, 248, 218, 6, "#000000", opacity=0.22)
# Card Body
draw_rounded_rect("typography", 476, 168, 248, 218, 6, "#FFFFFF")
draw_rect("typography", 476, 168, 248, 1, "#CBD5E1")
draw_rect("typography", 476, 168, 1, 218, "#CBD5E1")
draw_rect("typography", 723, 168, 1, 218, "#CBD5E1")
draw_rect("typography", 476, 385, 248, 1, "#CBD5E1")

# Pointer arrow pointing to INK PIGMENT (#2563EB at x: 740, y: 235)
draw_stroke("typography", [[724, 230], [736, 235], [724, 240]], color="#CBD5E1", size=1)
draw_stroke("typography", [[724, 231], [734, 235], [724, 239]], color="#FFFFFF", size=2)

# Popover Header
draw_rounded_rect("typography", 477, 169, 246, 26, 5, "#F8FAFC")
draw_rect("typography", 476, 195, 248, 1, "#E2E8F0")
# Pill title: COLOR PICKER
draw_rounded_rect("typography", 486, 173, 98, 18, 3, "#E0F2FE")
draw_text("typography", "COLOR PICKER", 492, 177, scale=0.7, color="#0284C7", size=1)
# Close [X]
draw_text("typography", "X", 710, 176, scale=0.75, color="#94A3B8", size=1)

# 2D Saturation / Value Gradient Field (x: 486, y: 202, w: 228, h: 62)
# Gradient bands simulating 2D saturation/brightness space from light cyan to deep blue
sv_bands = [
    ("#93C5FD", "#60A5FA", "#3B82F6", "#2563EB", "#1D4ED8", "#1E3A8A"),
    ("#BFDBFE", "#93C5FD", "#3B82F6", "#2563EB", "#1D4ED8", "#172554"),
    ("#DBEAFE", "#60A5FA", "#2563EB", "#1D4ED8", "#1E3A8A", "#0F172A"),
    ("#EFF6FF", "#3B82F6", "#1D4ED8", "#1E40AF", "#172554", "#020617")
]
by = 202
for row in sv_bands:
    bx = 486
    seg_w = 228 // len(row)
    for col in row:
        draw_rect("typography", bx, by, seg_w + 1, 16, col)
        bx += seg_w
    by += 15

draw_rect("typography", 486, 202, 228, 1, "#94A3B8", opacity=0.5)
draw_rect("typography", 486, 263, 228, 1, "#94A3B8", opacity=0.5)
draw_rect("typography", 486, 202, 1, 62, "#94A3B8", opacity=0.5)
draw_rect("typography", 713, 202, 1, 62, "#94A3B8", opacity=0.5)

# Selection crosshair / ring in 2D field at (642, 228)
draw_ellipse("typography", 636, 222, 12, 12, "#FFFFFF")
draw_ellipse("typography", 638, 224, 8, 8, "#2563EB")
draw_stroke("typography", [[642, 219], [642, 237]], color="#FFFFFF", size=1)
draw_stroke("typography", [[633, 228], [651, 228]], color="#FFFFFF", size=1)

# 1D Hue Spectrum Slider Bar (x: 486, y: 270, w: 228, h: 8)
hues = ["#EF4444", "#F97316", "#F59E0B", "#10B981", "#06B6D4", "#3B82F6", "#6366F1", "#A855F7", "#EC4899", "#EF4444"]
hx = 486
hw = 228 // len(hues)
for hc in hues:
    draw_rect("typography", hx, 270, hw + 1, 8, hc)
    hx += hw
# Thumb on Blue hue at x=618
draw_ellipse("typography", 614, 267, 14, 14, "#FFFFFF")
draw_ellipse("typography", 616, 269, 10, 10, "#3B82F6")

# Action Row: Eyedropper + Hex Input + Color Swatch (y: 288..314)
# Eyedropper Button [⌖ CANVAS PICK]
draw_rounded_rect("typography", 486, 288, 72, 24, 3, "#E0F2FE")
draw_stroke("typography", [[495, 300], [501, 300]], color="#0284C7", size=1)
draw_stroke("typography", [[498, 297], [498, 303]], color="#0284C7", size=1)
draw_text("typography", "PICK", 506, 294, scale=0.75, color="#0284C7", size=1)

# Hex Text Field with active caret
draw_rounded_rect("typography", 564, 288, 92, 24, 3, "#F8FAFC")
draw_rect("typography", 564, 288, 92, 1, "#CBD5E1")
draw_text("typography", "#2563EB", 572, 294, scale=0.8, color="#0F172A", size=1)
# Blinking Caret cursor right after B
draw_stroke("typography", [[636, 292], [636, 306]], color="#0284C7", size=1.5)

# Swatch Preview (Comparison Old vs New)
draw_rounded_rect("typography", 662, 288, 52, 24, 3, "#2563EB")
draw_text("typography", "NEW", 674, 295, scale=0.7, color="#FFFFFF", size=1)

# Primary Button: [ APPLY PIGMENT ]
draw_rounded_rect("typography", 486, 320, 228, 26, 4, "#0284C7")
draw_text("typography", "APPLY PIGMENT", 538, 327, scale=0.85, color="#FFFFFF", size=1)

# Secondary row: Quick Swatches Row (Recent mixes)
draw_text("typography", "RECENT", 486, 356, scale=0.65, color="#94A3B8", size=1)
recent_colors = ["#1E40AF", "#3B82F6", "#0284C7", "#0EA5E9", "#38BDF8", "#7DD3FC"]
rx = 540
for rc in recent_colors:
    draw_ellipse("typography", rx, 355, 12, 12, rc)
    rx += 28


# =========================================================================
# 3. CANVAS EYEDROPPER LOUPE / SAMPLING INTERACTION
# Showing the active sampling interaction directly on the landscape artwork!
# =========================================================================
# Sampling at mountain cobalt crag (380, 330) - fully open on canvas
draw_ellipse("typography", 366, 316, 28, 28, "#FFFFFF", opacity=0.95)
draw_ellipse("typography", 368, 318, 24, 24, "#2563EB")
draw_stroke("typography", [[380, 310], [380, 320]], color="#FFFFFF", size=1.5)
draw_stroke("typography", [[380, 340], [380, 350]], color="#FFFFFF", size=1.5)
draw_stroke("typography", [[360, 330], [370, 330]], color="#FFFFFF", size=1.5)
draw_stroke("typography", [[390, 330], [400, 330]], color="#FFFFFF", size=1.5)
# Label tag under loupe: #2563EB
draw_rounded_rect("typography", 356, 348, 48, 14, 2, "#0F172A", opacity=0.85)
draw_text("typography", "#2563EB", 359, 350, scale=0.55, color="#FFFFFF", size=1)

# Subtle dashed leader line connecting sampling loupe to the [PICK] button in popover
for lx in range(406, 486, 8):
    ly_coord = int(330 + (lx - 406) * (300 - 330) / (486 - 406))
    draw_stroke("typography", [[lx, ly_coord], [lx + 4, ly_coord - 1]], color="#0284C7", size=1, opacity=0.7)

print(f"Total commands generated: {len(commands)}")
with open("/private/tmp/codesketch-designer-20260910-fresh/artifacts/drawing/color_flow_patch.json", "w") as f:
    json.dump(commands, f, indent=2)
