import json

commands = [
    {"type": "rect", "layer": "typography", "x": 761, "y": 79, "width": 238, "height": 34, "color": "#FFFFFF", "opacity": 1.0}
]

# We need the single ACTIVE TOOL text at y=92
GLYPHS = {
    'A': [[(0,7), (0,2), (2,0), (3,0), (5,2), (5,7)], [(0,4), (5,4)]],
    'C': [[(5,1), (3,0), (2,0), (0,2), (0,5), (2,7), (3,7), (5,6)]],
    'T': [[(0,0), (5,0)], [(2.5,0), (2.5,7)]],
    'I': [[(0,0), (4,0)], [(2,0), (2,7)], [(0,7), (4,7)]],
    'V': [[(0,0), (2.5,7), (5,0)]],
    'E': [[(5,0), (0,0), (0,7), (5,7)], [(0,3.5), (4,3.5)]],
    'O': [[(2,0), (3,0), (5,2), (5,5), (3,7), (2,7), (0,5), (0,2), (2,0)]],
    'L': [[(0,0), (0,7), (5,7)]],
    ' ': []
}

def draw_text(layer, text, x, y, scale=0.85, color="#94A3B8", size=1):
    cur_x = x
    char_w = 6 * scale
    spacing = 2 * scale
    for ch in text.upper():
        if ch in GLYPHS:
            for path in GLYPHS[ch]:
                pts = [[int(round(cur_x + px * scale)), int(round(y + py * scale))] for px, py in path]
                if len(pts) == 1:
                    pts.append([pts[0][0] + 1, pts[0][1] + 1])
                commands.append({
                    "type": "stroke",
                    "layer": layer,
                    "brush": "brush",
                    "size": int(size),
                    "color": color,
                    "opacity": 1.0,
                    "points": pts
                })
        cur_x += char_w + spacing

draw_text("typography", "ACTIVE TOOL", 774, 92)

with open("/private/tmp/codesketch-designer-20260910-fresh/artifacts/drawing/fix_active_tool.json", "w") as f:
    json.dump(commands, f, indent=2)
print("Fix commands:", len(commands))
