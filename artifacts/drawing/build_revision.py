import json

revisions = []

def add_rev(cmd):
    revisions.append(cmd)

# 1. Erase/cover the unused left/center portions of the top bar with the workbench background (#EEF2F6)
add_rev({
    "type": "rect",
    "layer": "base_ui",
    "x": 0,
    "y": 0,
    "width": 780,
    "height": 48,
    "color": "#EEF2F6",
    "opacity": 1.0
})

# 2. Convert the top-right section into a clean floating island pill (x=780, y=8, w=208, h=36)
# First clear behind it
add_rev({
    "type": "rect",
    "layer": "base_ui",
    "x": 780,
    "y": 0,
    "width": 220,
    "height": 48,
    "color": "#EEF2F6",
    "opacity": 1.0
})

# Draw floating island pill
# Shadow
add_rev({
    "type": "rect",
    "layer": "base_ui",
    "x": 782,
    "y": 10,
    "width": 204,
    "height": 34,
    "color": "#CBD5E1",
    "opacity": 0.4
})
# Body
add_rev({
    "type": "rect",
    "layer": "base_ui",
    "x": 780,
    "y": 8,
    "width": 208,
    "height": 34,
    "color": "#FFFFFF",
    "opacity": 1.0
})
# Border
add_rev({
    "type": "stroke",
    "layer": "base_ui",
    "brush": "pencil",
    "size": 1,
    "color": "#E2E8F0",
    "opacity": 1.0,
    "points": [[780, 8], [988, 8], [988, 42], [780, 42], [780, 8]]
})

# Controls inside the floating island:
# 1. Canvas zoom / view indicator
add_rev({
    "type": "rect",
    "layer": "base_ui",
    "x": 788,
    "y": 14,
    "width": 46,
    "height": 22,
    "color": "#F8FAFC",
    "opacity": 1.0
})
add_rev({
    "type": "stroke",
    "layer": "typography",
    "brush": "pencil",
    "size": 1,
    "color": "#0F172A",
    "opacity": 1.0,
    "points": [[794, 20], [794, 28], [798, 28], [798, 20]] # '1'
})
# '100%' text simplified
add_rev({
    "type": "stroke",
    "layer": "typography",
    "brush": "pencil",
    "size": 1,
    "color": "#0F172A",
    "opacity": 1.0,
    "points": [[804, 20], [810, 20], [810, 28], [804, 28], [804, 20]] # '0'
})
add_rev({
    "type": "stroke",
    "layer": "typography",
    "brush": "pencil",
    "size": 1,
    "color": "#0F172A",
    "opacity": 1.0,
    "points": [[814, 20], [820, 20], [820, 28], [814, 28], [814, 20]] # '0'
})
# Down caret
add_rev({
    "type": "stroke",
    "layer": "typography",
    "brush": "pencil",
    "size": 1,
    "color": "#64748B",
    "opacity": 1.0,
    "points": [[824, 23], [827, 26], [830, 23]]
})

# 2. Present / View toggle icon button
add_rev({
    "type": "rect",
    "layer": "base_ui",
    "x": 842,
    "y": 14,
    "width": 26,
    "height": 22,
    "color": "#F1F5F9",
    "opacity": 1.0
})
add_rev({
    "type": "stroke",
    "layer": "base_ui",
    "brush": "brush",
    "size": 2,
    "color": "#475569",
    "opacity": 1.0,
    "points": [[850, 19], [850, 31], [860, 25], [850, 19]] # Triangle
})

# 3. Share / Export Primary CTA Button
add_rev({
    "type": "rect",
    "layer": "base_ui",
    "x": 876,
    "y": 12,
    "width": 104,
    "height": 26,
    "color": "#0D99FF",
    "opacity": 1.0
})
# White lettering for 'SHARE / EXPORT'
add_rev({
    "type": "stroke",
    "layer": "typography",
    "brush": "pencil",
    "size": 1,
    "color": "#FFFFFF",
    "opacity": 1.0,
    "points": [[888, 20], [894, 20], [888, 24], [894, 24], [888, 28]] # 'S'
})
add_rev({
    "type": "stroke",
    "layer": "typography",
    "brush": "pencil",
    "size": 1,
    "color": "#FFFFFF",
    "opacity": 1.0,
    "points": [[898, 20], [898, 28], [898, 24], [904, 24], [904, 20], [904, 28]] # 'H'
})
add_rev({
    "type": "stroke",
    "layer": "typography",
    "brush": "pencil",
    "size": 1,
    "color": "#FFFFFF",
    "opacity": 1.0,
    "points": [[908, 28], [911, 20], [914, 28], [909, 25], [913, 25]] # 'A'
})
add_rev({
    "type": "stroke",
    "layer": "typography",
    "brush": "pencil",
    "size": 1,
    "color": "#FFFFFF",
    "opacity": 1.0,
    "points": [[918, 28], [918, 20], [923, 20], [923, 24], [918, 24], [923, 28]] # 'R'
})
add_rev({
    "type": "stroke",
    "layer": "typography",
    "brush": "pencil",
    "size": 1,
    "color": "#FFFFFF",
    "opacity": 1.0,
    "points": [[927, 28], [927, 20], [932, 20], [927, 24], [931, 24], [927, 28], [932, 28]] # 'E'
})

rev_path = "/private/tmp/codesketch-designer-20260910-fresh/artifacts/drawing/revisions.json"
with open(rev_path, "w") as f:
    json.dump(revisions, f, indent=2)

print(f"Generated {len(revisions)} revision commands in {rev_path}")
