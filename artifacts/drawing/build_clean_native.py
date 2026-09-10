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
# 1. 100% OPAQUE SKY TO WIPE GHOST MARKS ON CANVAS (x: 240..760, y: 0..310)
# =========================================================================
draw_rect("typography", 240, 0, 520, 120, "#DDD6FE", opacity=1.0)
draw_rect("typography", 240, 120, 520, 80, "#FED7AA", opacity=1.0)
draw_rect("typography", 240, 200, 520, 60, "#FECDD3", opacity=1.0)
draw_rect("typography", 240, 260, 520, 55, "#FEF08A", opacity=1.0)

# Redraw clean distant mountain peaks on top of opaque sky
mtn_distant = [
    [240, 270], [290, 230], [350, 255], [420, 195], [490, 260],
    [560, 205], [630, 240], [690, 175], [740, 230], [760, 210]
]
draw_stroke("typography", mtn_distant, color="#93C5FD", size=6, brush="brush", opacity=1.0)
for y in range(250, 315, 12):
    draw_rect("typography", 240, y, 520, 14, "#BFDBFE", opacity=0.6)

# Redraw clean active brush stroke
draw_stroke("typography", [[240, 335], [300, 320], [370, 280], [450, 305], [520, 260], [580, 285]],
            color="#2563EB", size=14, brush="brush", opacity=0.95)
draw_ellipse("typography", 574, 279, 12, 12, "#FFFFFF", opacity=0.6)
draw_stroke("typography", [[580, 275], [580, 295]], color="#FFFFFF", size=1)
draw_stroke("typography", [[570, 285], [590, 285]], color="#FFFFFF", size=1)


# =========================================================================
# 2. LEFT SIDEBAR: NATIVE CODESKETCH LAYERS ONLY
# Wipe all pages, assets, groups, meta text (x: 0..240, y: 47..700)
# =========================================================================
draw_rect("typography", 0, 47, 240, 653, "#FFFFFF")
draw_rect("typography", 239, 47, 1, 653, "#E2E8F0")

# Section header: LAYERS + NEW button
draw_rect("typography", 0, 47, 240, 32, "#FAFAFA")
draw_text("typography", "LAYERS", 20, 58, scale=0.95, color="#0F172A", size=2)
draw_rounded_rect("typography", 172, 53, 56, 20, 3, "#F1F5F9")
draw_rect("typography", 172, 53, 56, 1, "#E2E8F0")
draw_text("typography", "+ NEW", 178, 57, scale=0.8, color="#0D99FF", size=1)
draw_rect("typography", 0, 79, 240, 1, "#E2E8F0")

# Flat native layers stack
layers = [
    ("05", "HIGHLIGHTS", "100%", False),
    ("04", "BRUSH SHADING", "80%", False),
    ("03", "LINEART", "100%", True),
    ("02", "PENCIL ROUGHS", "60%", False),
    ("01", "BACKDROP WASH", "100%", False),
    ("00", "CANVAS FILL", "100%", False)
]

y_pos = 92
for num, name, op, is_target in layers:
    if is_target:
        draw_rounded_rect("typography", 10, y_pos - 4, 220, 30, 4, "#E0F2FE")
        draw_rect("typography", 10, y_pos - 4, 3, 30, "#0284C7")
        draw_ellipse("typography", 22, y_pos + 6, 8, 8, "#0284C7")
        draw_text("typography", f"{num} {name}", 36, y_pos + 4, scale=0.85, color="#0369A1", size=2)
        draw_rounded_rect("typography", 164, y_pos, 58, 18, 3, "#0D99FF")
        draw_text("typography", "TARGET", 170, y_pos + 4, scale=0.75, color="#FFFFFF", size=1)
    else:
        draw_ellipse("typography", 22, y_pos + 6, 8, 8, "#CBD5E1")
        draw_text("typography", f"{num} {name}", 36, y_pos + 4, scale=0.85, color="#475569", size=1)
        draw_text("typography", op, 194, y_pos + 4, scale=0.8, color="#94A3B8", size=1)
    y_pos += 34

draw_rect("typography", 16, y_pos, 208, 1, "#F1F5F9")

# Native Layer Settings Card (Layer update inspector)
y_pos += 14
draw_rounded_rect("typography", 14, y_pos, 212, 100, 6, "#F8FAFC")
draw_rect("typography", 14, y_pos, 212, 1, "#E2E8F0")
draw_text("typography", "LAYER: 03 LINEART", 24, y_pos + 12, scale=0.85, color="#0369A1", size=2)
draw_text("typography", "VISIBILITY: VISIBLE", 24, y_pos + 38, scale=0.8, color="#475569", size=1)
draw_text("typography", "OPACITY: 100%", 24, y_pos + 58, scale=0.8, color="#475569", size=1)
draw_text("typography", "TARGET: ACTIVE PASS", 24, y_pos + 78, scale=0.8, color="#0D99FF", size=1)

# Document footer
draw_text("typography", "CANVAS: 1000 X 700 PX", 20, 668, scale=0.8, color="#94A3B8", size=1)


# =========================================================================
# 3. RIGHT SIDEBAR: NATIVE PAINT TOOL & ACTIONS (NO AVATARS, NO PROTOTYPE)
# Wipe header & tabs (x: 760..1000, y: 0..80)
# =========================================================================
draw_rect("typography", 760, 0, 240, 80, "#FFFFFF")
draw_rect("typography", 760, 0, 1, 80, "#E2E8F0")

# Native Document Actions: EXPORT PNG & SAVE JSON
draw_rounded_rect("typography", 772, 11, 106, 26, 4, "#F8FAFC")
draw_rect("typography", 772, 11, 106, 1, "#CBD5E1")
draw_text("typography", "EXPORT PNG", 788, 18, scale=0.85, color="#334155", size=1)

draw_rounded_rect("typography", 886, 11, 102, 26, 4, "#0D99FF")
draw_text("typography", "SAVE JSON", 902, 18, scale=0.85, color="#FFFFFF", size=2)
draw_rect("typography", 760, 46, 240, 1, "#E2E8F0")

# Header tab: PAINT TOOL (no Prototype tab!)
draw_rect("typography", 760, 47, 240, 32, "#FAFAFA")
draw_text("typography", "PAINT TOOL", 776, 58, scale=0.95, color="#0F172A", size=2)
draw_rect("typography", 774, 77, 74, 2, "#0D99FF")
draw_text("typography", "100%", 950, 58, scale=0.9, color="#64748B", size=1)
draw_rect("typography", 760, 79, 240, 1, "#E2E8F0")

# Clean target layer label in right sidebar (remove any (ACTIVE))
draw_rect("typography", 778, 420, 200, 20, "#F0F9FF")
draw_text("typography", "TARGET LAYER", 780, 426, scale=0.9, color="#0284C7", size=2)

print(f"Total commands generated: {len(commands)}")
with open("/private/tmp/codesketch-designer-20260910-fresh/artifacts/drawing/revisions_clean_native.json", "w") as f:
    json.dump(commands, f, indent=2)
