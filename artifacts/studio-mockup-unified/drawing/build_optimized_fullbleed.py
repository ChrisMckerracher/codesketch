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
# FULL BLEED DOCKED SIDEBARS - NO PADDING ("FIGMA ISNT SCARED TO NOT HAVE PADDING. BE BRAVE")
# Layer: typography (to cleanly sit above all prior strokes)
# =========================================================================

# --- 1. CLEAN CANVAS TOP STRIP ---
# Canvas between sidebars: x=240..760, y=0..54
draw_rect("typography", 239, 0, 522, 54, "#EEF2F6")
draw_text("typography", "FRAME 1: MOUNTAIN HORIZON (1000 X 700 CANVAS)", 254, 40, scale=0.85, color="#64748B", size=1)

# --- 2. LEFT SIDEBAR: DOCK TO FULL BLEED (x=0..240, y=0..700) ---
# Fill the outer margins with white
draw_rect("typography", 0, 0, 16, 700, "#FFFFFF")         # left margin
draw_rect("typography", 0, 0, 240, 58, "#FFFFFF")         # top margin (header area)
draw_rect("typography", 0, 684, 240, 16, "#FFFFFF")       # bottom margin
draw_rect("typography", 239, 0, 1, 700, "#E2E8F0")        # right divider line

# Left Header (y=0..46): Codesketch Logo, Document Title, Sidebar Toggle
draw_rounded_rect("typography", 16, 14, 18, 18, 4, "#0D99FF")
draw_stroke("typography", [[20, 23], [25, 18], [30, 23]], color="#FFFFFF", size=2)
draw_text("typography", "CODESKETCH", 40, 17, scale=0.95, color="#0F172A", size=2)
draw_stroke("typography", [[148, 21], [152, 25], [156, 21]], color="#64748B", size=2) # chevron
# Sidebar collapse toggle icon [|]
draw_rounded_rect("typography", 206, 12, 22, 22, 4, "#F8FAFC")
draw_rect("typography", 206, 12, 22, 1, "#E2E8F0")
draw_stroke("typography", [[212, 17], [212, 29]], color="#64748B", size=2)
draw_stroke("typography", [[217, 17], [223, 23], [217, 29]], color="#64748B", size=2)
# Divider below header
draw_rect("typography", 0, 46, 240, 1, "#E2E8F0")

# Left Tab bar background fill (y=47..57) to seamlessly connect to existing tabs
draw_rect("typography", 0, 47, 240, 10, "#F8FAFC")


# --- 3. RIGHT SIDEBAR: DOCK TO FULL BLEED (x=760..1000, y=0..700) ---
# Fill the outer margins with white
draw_rect("typography", 984, 0, 16, 700, "#FFFFFF")       # right margin
draw_rect("typography", 760, 0, 240, 58, "#FFFFFF")       # top margin (header area)
draw_rect("typography", 760, 684, 240, 16, "#FFFFFF")     # bottom margin
draw_rect("typography", 760, 0, 1, 700, "#E2E8F0")        # left divider line

# Right Header (y=0..46): Collaborator Avatars & Blue Share CTA Button
# Collaborator Avatars (A, F, S)
draw_ellipse("typography", 772, 13, 22, 22, "#EA580C")
draw_text("typography", "A", 779, 19, scale=0.85, color="#FFFFFF", size=1)

draw_ellipse("typography", 798, 13, 22, 22, "#059669")
draw_text("typography", "F", 805, 19, scale=0.85, color="#FFFFFF", size=1)

draw_ellipse("typography", 824, 13, 22, 22, "#7C3AED")
draw_text("typography", "S", 831, 19, scale=0.85, color="#FFFFFF", size=1)

# Present / Play triangle button
draw_stroke("typography", [[856, 18], [856, 28], [864, 23], [856, 18]], color="#475569", size=2)

# Blue Share CTA Button
draw_rounded_rect("typography", 878, 11, 110, 26, 6, "#0D99FF")
draw_text("typography", "SHARE", 910, 18, scale=1.0, color="#FFFFFF", size=2)

# Divider below header
draw_rect("typography", 760, 46, 240, 1, "#E2E8F0")

# Cover the previous staged avatar/share strip at y=76..102 so it doesn't duplicate
draw_rect("typography", 761, 47, 238, 52, "#FFFFFF")

# Re-draw clean right header tabs: DESIGN | PROTOTYPE  100% v
draw_rect("typography", 760, 47, 240, 31, "#F8FAFC")
draw_text("typography", "DESIGN", 776, 57, scale=0.95, color="#0F172A", size=2)
draw_rect("typography", 774, 76, 52, 2, "#0D99FF") # active tab underline
draw_text("typography", "PROTOTYPE", 840, 57, scale=0.95, color="#64748B", size=1)
draw_text("typography", "100%", 942, 57, scale=0.95, color="#0F172A", size=1)
draw_stroke("typography", [[980, 61], [984, 65], [988, 61]], color="#64748B", size=1) # chevron
draw_rect("typography", 760, 78, 240, 1, "#E2E8F0")

# Active tool label cleanly positioned at y=88
draw_text("typography", "ACTIVE TOOL", 774, 88, scale=0.85, color="#94A3B8", size=1)

print(f"Total commands generated: {len(commands)}")
with open("/private/tmp/codesketch-designer-20260910-fresh/artifacts/drawing/revisions_fullbleed.json", "w") as f:
    json.dump(commands, f, indent=2)
