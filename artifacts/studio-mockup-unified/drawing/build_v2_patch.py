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

# 1. Clean up wonky top-left box by painting over with pristine sky
draw_rect("left_panel", 0, 0, 180, 50, "#DDD6FE", opacity=1.0)
draw_rect("typography", 0, 0, 180, 50, "#DDD6FE", opacity=1.0)

# 2. Draw In-App Feedback Pin & Floating Thread Card
# Canvas Comment Pin at (486, 222) near the active stroke
draw_ellipse("journey_focus", 486, 222, 22, 22, "#0D99FF")
draw_ellipse("journey_focus", 488, 224, 18, 18, "#FFFFFF")
draw_ellipse("journey_focus", 491, 227, 12, 12, "#0D99FF")
draw_stroke("journey_focus", [[486, 238], [476, 248], [492, 242]], color="#0D99FF", size=2)

# Floating In-App Feedback Card: x: 120, y: 38, w: 340, h: 228
draw_rounded_rect("journey_focus", 123, 41, 340, 228, 6, "#000000", opacity=0.25)
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

# Two-way Agent Reply Thread (Addressing paint-c36)
draw_rect("journey_focus", 132, 130, 316, 1, "#F1F5F9")
draw_ellipse("journey_focus", 132, 138, 12, 12, "#10B981") # Artist Agent Avatar
draw_text("typography", "ARTIST AGENT", 150, 140, scale=0.8, color="#047857", size=2)
draw_text("typography", "JUST NOW", 236, 141, scale=0.7, color="#94A3B8", size=1)

draw_text("typography", "APPLIED IN V2: REMOVED CLUTTER,", 132, 160, scale=0.75, color="#065F46", size=1)
draw_text("typography", "EXPANDED WIDESCREEN, AND UNIFIED FLOW.", 132, 174, scale=0.75, color="#065F46", size=1)

# Interactive Reply & Continuation Footer (Addressing paint-sep & paint-m57)
draw_rect("journey_focus", 120, 194, 340, 1, "#E2E8F0")
# Input box: "Write a reply..."
draw_rounded_rect("journey_focus", 130, 202, 184, 24, 3, "#F8FAFC")
draw_rect("journey_focus", 130, 202, 184, 1, "#CBD5E1")
draw_text("typography", "WRITE A REPLY...", 138, 209, scale=0.75, color="#94A3B8", size=1)

# Single-click "Submit & Resume" button
draw_rounded_rect("journey_focus", 322, 202, 128, 24, 3, "#0D99FF")
draw_text("typography", "SUBMIT & RESUME", 330, 209, scale=0.75, color="#FFFFFF", size=1)

# Leader line
draw_stroke("journey_focus", [[450, 230], [476, 248]], color="#0D99FF", size=2, brush="brush", opacity=0.7)


# 3. Clean Right Sidebar completely and redraw with v2 controls
draw_rect("right_panel", 740, 0, 260, 700, "#FFFFFF")
draw_rect("right_panel", 740, 0, 1, 700, "#E2E8F0")
draw_rect("typography", 740, 0, 260, 700, "#FFFFFF", opacity=0.0) # clean layer

# Header (y=0..46): Studio Title + Feedback Toggle + Export CTA + Collapse Toggle
draw_text("typography", "STUDIO", 754, 17, scale=0.95, color="#0F172A", size=2)

# Feedback indicator button with active badge [FB 1]
draw_rounded_rect("right_panel", 826, 11, 48, 26, 4, "#EFF6FF")
draw_rect("right_panel", 826, 11, 48, 1, "#BFDBFE")
draw_text("typography", "FB", 834, 18, scale=0.8, color="#1D4ED8", size=1)
draw_ellipse("right_panel", 858, 15, 10, 10, "#EF4444")
draw_text("typography", "1", 861, 16, scale=0.65, color="#FFFFFF", size=1)

# Single Rasterize/Export button
draw_rounded_rect("right_panel", 880, 11, 72, 26, 4, "#0D99FF")
draw_text("typography", "EXPORT", 894, 18, scale=0.85, color="#FFFFFF", size=2)

# Collapse panel toggle icon [|>]
draw_rounded_rect("right_panel", 958, 11, 28, 26, 4, "#F8FAFC")
draw_rect("right_panel", 958, 11, 28, 1, "#E2E8F0")
draw_stroke("typography", [[968, 18], [974, 24], [968, 30]], color="#64748B", size=2)
draw_stroke("typography", [[978, 18], [978, 30]], color="#64748B", size=2)
draw_rect("right_panel", 740, 46, 260, 1, "#E2E8F0")

# Section 1: Tool Selection & Mode (Clean! Redundant box removed!)
draw_text("typography", "TOOL", 756, 56, scale=0.85, color="#94A3B8", size=1)

draw_rounded_rect("right_panel", 754, 70, 232, 28, 4, "#F1F5F9")
draw_rect("right_panel", 754, 70, 232, 1, "#E2E8F0")
# Active tool: INK
draw_rounded_rect("right_panel", 756, 72, 56, 24, 3, "#0D99FF")
draw_text("typography", "INK", 772, 79, scale=0.85, color="#FFFFFF", size=2)
draw_text("typography", "PENCIL", 824, 79, scale=0.85, color="#64748B", size=1)
draw_text("typography", "MARK", 882, 79, scale=0.85, color="#64748B", size=1)
draw_text("typography", "ERASE", 936, 79, scale=0.85, color="#64748B", size=1)
draw_rect("right_panel", 754, 108, 232, 1, "#F1F5F9")

# Section 2: Stroke Properties (y=118..270)
draw_text("typography", "STROKE PROPERTIES", 756, 120, scale=0.85, color="#94A3B8", size=1)

# Property 1: SIZE
draw_text("typography", "SIZE", 756, 138, scale=0.9, color="#475569", size=1)
draw_rounded_rect("right_panel", 934, 132, 52, 20, 3, "#F1F5F9")
draw_rect("right_panel", 934, 132, 52, 1, "#CBD5E1")
draw_text("typography", "14 PX", 942, 138, scale=0.9, color="#0F172A", size=1)
draw_rounded_rect("right_panel", 756, 156, 164, 6, 3, "#E2E8F0")
draw_rounded_rect("right_panel", 756, 156, 78, 6, 3, "#0D99FF")
draw_ellipse("right_panel", 830, 152, 14, 14, "#FFFFFF")
draw_ellipse("right_panel", 832, 154, 10, 10, "#0D99FF")

# Property 2: OPACITY
draw_text("typography", "OPACITY", 756, 174, scale=0.9, color="#475569", size=1)
draw_rounded_rect("right_panel", 934, 168, 52, 20, 3, "#F1F5F9")
draw_rect("right_panel", 934, 168, 52, 1, "#CBD5E1")
draw_text("typography", "100%", 942, 174, scale=0.9, color="#0F172A", size=1)
draw_rounded_rect("right_panel", 756, 192, 164, 6, 3, "#0D99FF")
draw_ellipse("right_panel", 916, 188, 14, 14, "#FFFFFF")
draw_ellipse("right_panel", 918, 190, 10, 10, "#0D99FF")

# Property 3: SMOOTHING
draw_text("typography", "SMOOTHING", 756, 210, scale=0.9, color="#475569", size=1)
draw_rounded_rect("right_panel", 934, 204, 52, 20, 3, "#F1F5F9")
draw_rect("right_panel", 934, 204, 52, 1, "#CBD5E1")
draw_text("typography", "75%", 944, 210, scale=0.9, color="#0F172A", size=1)
draw_rounded_rect("right_panel", 756, 228, 164, 6, 3, "#E2E8F0")
draw_rounded_rect("right_panel", 756, 228, 122, 6, 3, "#0D99FF")
draw_ellipse("right_panel", 874, 224, 14, 14, "#FFFFFF")
draw_ellipse("right_panel", 876, 226, 10, 10, "#0D99FF")

# Color Swatches
draw_rounded_rect("right_panel", 756, 248, 28, 28, 4, "#2563EB")
draw_rounded_rect("right_panel", 792, 248, 94, 28, 4, "#F8FAFC")
draw_rect("right_panel", 792, 248, 94, 1, "#E2E8F0")
draw_text("typography", "#2563EB", 802, 256, scale=0.95, color="#0F172A", size=1)
draw_rounded_rect("right_panel", 894, 248, 92, 28, 4, "#F8FAFC")
draw_rect("right_panel", 894, 248, 92, 1, "#E2E8F0")
draw_text("typography", "INK PIGMENT", 902, 256, scale=0.75, color="#64748B", size=1)
draw_rect("right_panel", 754, 288, 232, 1, "#F1F5F9")

# Section 3: Clean Native Layers Stack (NO confusing "TARGET" jargon!)
draw_text("typography", "LAYERS", 756, 302, scale=0.95, color="#0F172A", size=2)
draw_rounded_rect("right_panel", 930, 298, 56, 20, 3, "#F1F5F9")
draw_rect("right_panel", 930, 298, 56, 1, "#E2E8F0")
draw_text("typography", "+ NEW", 938, 302, scale=0.8, color="#0D99FF", size=1)

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
    if is_active:
        draw_rounded_rect("right_panel", 752, ly - 4, 236, 28, 4, "#EFF6FF")
        draw_rect("right_panel", 752, ly - 4, 3, 28, "#0284C7")
        draw_ellipse("right_panel", 762, ly + 6, 8, 8, "#0284C7")
        draw_text("typography", f"{num} {name}", 776, ly + 4, scale=0.85, color="#0369A1", size=2)
        draw_text("typography", op, 950, ly + 4, scale=0.8, color="#0369A1", size=1)
    else:
        draw_ellipse("right_panel", 762, ly + 6, 8, 8, "#CBD5E1")
        draw_text("typography", f"{num} {name}", 776, ly + 4, scale=0.85, color="#475569", size=1)
        draw_text("typography", op, 950, ly + 4, scale=0.8, color="#94A3B8", size=1)
    ly += 32

draw_rect("right_panel", 754, ly + 4, 232, 1, "#F1F5F9")

# Section 4: Active Layer Properties
draw_text("typography", "LAYER SETTINGS", 756, ly + 14, scale=0.85, color="#94A3B8", size=1)

draw_text("typography", "BLEND MODE", 756, ly + 32, scale=0.85, color="#475569", size=1)
draw_rounded_rect("right_panel", 874, ly + 26, 112, 22, 3, "#F8FAFC")
draw_rect("right_panel", 874, ly + 26, 112, 1, "#CBD5E1")
draw_text("typography", "NORMAL", 884, ly + 32, scale=0.8, color="#0F172A", size=1)
draw_stroke("typography", [[972, ly + 34], [976, ly + 38], [980, ly + 34]], color="#64748B", size=1)

draw_text("typography", "VISIBILITY", 756, ly + 56, scale=0.85, color="#475569", size=1)
draw_rounded_rect("right_panel", 914, ly + 52, 72, 20, 3, "#ECFDF5")
draw_rect("right_panel", 914, ly + 52, 72, 1, "#A7F3D0")
draw_text("typography", "VISIBLE", 926, ly + 56, scale=0.75, color="#047857", size=1)

# Footer
draw_text("typography", "CODESKETCH ENGINE V2", 756, 668, scale=0.8, color="#94A3B8", size=1)

print(f"Total patch commands: {len(commands)}")
with open("/private/tmp/codesketch-designer-20260910-fresh/artifacts/drawing/patch_v2_commands.json", "w") as f:
    json.dump(commands, f, indent=2)
