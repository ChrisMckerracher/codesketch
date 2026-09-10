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

# 1. Clear right panel with clean crisp white
draw_rect("typography", 740, 0, 260, 700, "#FFFFFF")

# 2. Header
draw_text("typography", "STUDIO", 756, 20, scale=0.95, color="#0F172A", size=1)
draw_text("typography", "FB", 830, 20, scale=0.85, color="#3B82F6", size=1)

# Primary SAVE button [SAVE]
draw_rounded_rect("typography", 872, 11, 62, 24, 3, "#0284C7")
draw_text("typography", "SAVE", 887, 18, scale=0.85, color="#FFFFFF", size=1)

# Collapse panel toggle icon [>|]
draw_stroke("typography", [[968, 16], [974, 22], [968, 28]], color="#64748B", size=1)
draw_stroke("typography", [[978, 16], [978, 28]], color="#64748B", size=1)

# 3. Tool Section
draw_text("typography", "TOOL", 756, 56, scale=0.85, color="#64748B", size=1)
draw_text("typography", "INK", 772, 79, scale=0.85, color="#0284C7", size=1)
draw_text("typography", "PENCIL", 824, 79, scale=0.85, color="#94A3B8", size=1)
draw_text("typography", "MARK", 882, 79, scale=0.85, color="#94A3B8", size=1)
draw_text("typography", "ERASE", 936, 79, scale=0.85, color="#94A3B8", size=1)

# 4. Stroke Properties Sliders
draw_text("typography", "STROKE PROPERTIES", 756, 116, scale=0.85, color="#64748B", size=1)

# SIZE (14 PX)
draw_text("typography", "SIZE", 756, 136, scale=0.8, color="#475569", size=1)
draw_text("typography", "14 PX", 942, 136, scale=0.8, color="#0F172A", size=1)
draw_rect("typography", 756, 150, 228, 2, "#E2E8F0")   # background track
draw_rect("typography", 756, 150, 32, 2, "#0284C7")    # active progress
draw_ellipse("typography", 784, 147, 8, 8, "#0284C7")  # slider knob (centered at 788)
draw_ellipse("typography", 787, 150, 2, 2, "#FFFFFF")  # white center pip

# OPACITY (100%)
draw_text("typography", "OPACITY", 756, 166, scale=0.8, color="#475569", size=1)
draw_text("typography", "100%", 948, 166, scale=0.8, color="#0F172A", size=1)
draw_rect("typography", 756, 180, 228, 2, "#0284C7")   # 100% full active track
draw_ellipse("typography", 978, 177, 8, 8, "#0284C7")  # slider knob at 100%
draw_ellipse("typography", 981, 180, 2, 2, "#FFFFFF")

# SMOOTHING (75%)
draw_text("typography", "SMOOTHING", 756, 196, scale=0.8, color="#475569", size=1)
draw_text("typography", "75%", 952, 196, scale=0.8, color="#0F172A", size=1)
draw_rect("typography", 756, 210, 228, 2, "#E2E8F0")
draw_rect("typography", 756, 210, 171, 2, "#0284C7")
draw_ellipse("typography", 923, 207, 8, 8, "#0284C7")  # knob centered at 927
draw_ellipse("typography", 926, 210, 2, 2, "#FFFFFF")

# 5. Ink Pigment & Palette Chips
draw_text("typography", "INK PIGMENT", 756, 230, scale=0.8, color="#64748B", size=1)
draw_text("typography", "#2563EB", 924, 230, scale=0.8, color="#0F172A", size=1)

pigments = [
    (764, "#0F172A", False),  # Lamp Black
    (794, "#64748B", False),  # Slate / Graphite
    (824, "#2563EB", True),   # Cobalt Blue (ACTIVE)
    (854, "#0EA5E9", False),  # Cyan
    (884, "#10B981", False),  # Emerald Green
    (914, "#F59E0B", False),  # Amber
    (944, "#EF4444", False),  # Vermilion Red
    (974, "#FFFFFF", False),  # White
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

# Divider line
draw_rect("typography", 756, 276, 228, 1, "#F1F5F9")

# 6. Layers Stack with Active Layer Micro-Slider
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

# 7. Footer
draw_text("typography", "CODESKETCH ENGINE V2", 756, 668, scale=0.8, color="#94A3B8", size=1)

print(f"Total commands generated: {len(commands)}")
with open("/private/tmp/codesketch-designer-20260910-fresh/artifacts/drawing/sidebar_draw_patch.json", "w") as f:
    json.dump(commands, f, indent=2)
