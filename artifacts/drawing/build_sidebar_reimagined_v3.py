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

def draw_stroke(layer, pts, color="#1E293B", size=1, brush="brush", opacity=1.0):
    clamped_pts = []
    for pt in pts:
        cx = max(0, min(1000, int(round(pt[0]))))
        cy = max(0, min(700, int(round(pt[1]))))
        clamped_pts.append([cx, cy])
    if len(clamped_pts) == 1:
        # 1-pixel dot
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

# Refined sans-serif GLYPHS with distinct I and 1
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
            for path in GLYPHS[ch]:
                pts = [[cur_x + p[0] * scale, y + p[1] * scale] for p in path]
                draw_stroke(layer, pts, color=color, size=size, opacity=opacity)
        cur_x += char_w + spacing

def draw_eye_icon(layer, x, y, vis=True, color="#94A3B8"):
    draw_stroke(layer, [[x, y+2], [x+3, y], [x+7, y], [x+10, y+2]], color=color, size=1)
    draw_stroke(layer, [[x, y+2], [x+3, y+4], [x+7, y+4], [x+10, y+2]], color=color, size=1)
    if vis:
        draw_stroke(layer, [[x+5, y+2], [x+5, y+2]], color=color, size=1)
    else:
        draw_stroke(layer, [[x+1, y-1], [x+9, y+5]], color="#94A3B8", size=1)

# Clear right panel on typography layer with clean white background
draw_rect("typography", 740, 0, 260, 700, "#FFFFFF")

# 1. Header
draw_text("typography", "STUDIO", 756, 20, scale=0.95, color="#0F172A", size=1)
draw_text("typography", "FB", 840, 20, scale=0.85, color="#3B82F6", size=1)
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

layers = [
    ("05", "HIGHLIGHTS", "100%", False),
    ("04", "BRUSH SHADING", "80%", False),
    ("03", "LINEART", "100%", True),
    ("02", "PENCIL ROUGHS", "60%", False),
    ("01", "BACKDROP WASH", "100%", False),
    ("00", "CANVAS FILL", "100%", False)
]

ly = 328
for num, name, op, is_active in layers:
    row_color = "#0284C7" if is_active else "#475569"
    eye_color = "#0284C7" if is_active else "#94A3B8"
    draw_text("typography", f"{num} {name}", 756, ly + 4, scale=0.85, color=row_color, size=1)
    draw_text("typography", op, 934, ly + 4, scale=0.8, color="#0284C7" if is_active else "#64748B", size=1)
    draw_eye_icon("typography", 972, ly + 4, vis=True, color=eye_color)
    ly += 32

# 5. Footer
draw_text("typography", "CODESKETCH ENGINE V2", 756, 668, scale=0.8, color="#94A3B8", size=1)

print(f"Total commands generated: {len(commands)}")
with open("artifacts/drawing/reimagined_sidebar_v3.json", "w") as f:
    json.dump(commands, f, indent=2)
