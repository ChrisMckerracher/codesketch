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
    'C': [[(5,1), (3,0), (2,0), (0,2), (0,5), (2,7), (3,7), (5,6)]],
    'D': [[(0,7), (0,0), (3,0), (5,2), (5,5), (3,7), (0,7)]],
    'E': [[(5,0), (0,0), (0,7), (5,7)], [(0,3.5), (4,3.5)]],
    'G': [[(5,1), (3,0), (2,0), (0,2), (0,5), (2,7), (4,7), (5,6), (5,3.5), (3,3.5)]],
    'I': [[(0,0), (4,0)], [(2,0), (2,7)], [(0,7), (4,7)]],
    'L': [[(0,0), (0,7), (5,7)]],
    'M': [[(0,7), (0,0), (2.5,4), (5,0), (5,7)]],
    'N': [[(0,7), (0,0), (5,7), (5,0)]],
    'O': [[(2,0), (3,0), (5,2), (5,5), (3,7), (2,7), (0,5), (0,2), (2,0)]],
    'R': [[(0,7), (0,0), (4,0), (5,1.5), (4,3.5), (0,3.5)], [(3,3.5), (5,7)]],
    'S': [[(5,1), (3,0), (1,0), (0,1.5), (1,3.5), (4,3.5), (5,5.5), (4,7), (2,7), (0,6)]],
    'T': [[(0,0), (5,0)], [(2.5,0), (2.5,7)]],
    'V': [[(0,0), (2.5,7), (5,0)]],
    'W': [[(0,0), (1.5,7), (2.5,3), (3.5,7), (5,0)]],
    'Y': [[(0,0), (2.5,3.5), (5,0)], [(2.5,3.5), (2.5,7)]],
    '0': [[(2,0), (3,0), (5,2), (5,5), (3,7), (2,7), (0,5), (0,2), (2,0)], [(4,1), (1,6)]],
    '3': [[(0,1), (1,0), (4,0), (5,2), (3,3.5), (5,5), (4,7), (1,7), (0,6)]],
    ':': [[(2.5,2), (2.5,2.5)], [(2.5,5), (2.5,5.5)]],
    ' ': []
}

def draw_text(layer, text, x, y, scale=1.0, color="#1E293B", size=1):
    cur_x = x
    char_w = 6 * scale
    spacing = 2 * scale
    for ch in text.upper():
        if ch in GLYPHS:
            for path in GLYPHS[ch]:
                pts = [[int(round(cur_x + px * scale)), int(round(y + py * scale))] for px, py in path]
                if len(pts) == 1:
                    pts.append([pts[0][0] + 1, pts[0][1] + 1])
                draw_stroke(layer, pts, color=color, size=size, opacity=1.0)
        cur_x += char_w + spacing

# 1. Clean the divider border between canvas and right sidebar
draw_rect("typography", 758, 80, 4, 620, "#FFFFFF")
draw_rect("typography", 760, 80, 1, 620, "#E2E8F0")

# 2. Clean the target layer area and bottom of right sidebar
draw_rect("typography", 761, 412, 238, 288, "#FFFFFF")

# Target Layer Card
draw_rounded_rect("typography", 770, 418, 220, 90, 6, "#F0F9FF")
draw_rect("typography", 770, 418, 220, 1, "#BAE6FD")
draw_rect("typography", 770, 418, 1, 90, "#BAE6FD")
draw_rect("typography", 989, 418, 1, 90, "#BAE6FD")
draw_rect("typography", 770, 507, 220, 1, "#BAE6FD")

draw_text("typography", "TARGET LAYER", 780, 428, scale=0.9, color="#0284C7", size=2)
draw_text("typography", "STROKES COMMIT TO:", 780, 446, scale=0.75, color="#475569", size=1)

# Dropdown Button
draw_rounded_rect("typography", 778, 458, 202, 26, 4, "#FFFFFF")
draw_rect("typography", 778, 458, 202, 1, "#0284C7")
draw_ellipse("typography", 786, 466, 10, 10, "#0284C7")
draw_text("typography", "03 LINEART  V", 804, 465, scale=0.9, color="#0369A1", size=2)

draw_ellipse("typography", 780, 492, 6, 6, "#10B981")
draw_text("typography", "ACTIVE DRAWING TARGET", 792, 490, scale=0.75, color="#0369A1", size=1)

print("Touchup commands:", len(commands))
with open("/private/tmp/codesketch-designer-20260910-fresh/artifacts/drawing/revisions_touchup.json", "w") as f:
    json.dump(commands, f, indent=2)
