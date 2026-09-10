import json

commands = []

def add_cmd(cmd):
    commands.append(cmd)

# 1. Cleanly wipe the top area across all x: 0..1000, y: 0..54 on TOPMOST layer 'typography'
add_cmd({
    "type": "rect",
    "layer": "typography",
    "x": 0,
    "y": 0,
    "width": 1000,
    "height": 55,
    "color": "#EEF2F6",
    "opacity": 1.0
})
# Also wipe on base_ui
add_cmd({
    "type": "rect",
    "layer": "base_ui",
    "x": 0,
    "y": 0,
    "width": 1000,
    "height": 55,
    "color": "#EEF2F6",
    "opacity": 1.0
})

# 2. Wipe the top region of right_panel on layer typography (where old text DESIGN PROTOTYPE was)
add_cmd({
    "type": "rect",
    "layer": "typography",
    "x": 763,
    "y": 55,
    "width": 222,
    "height": 45,
    "color": "#FFFFFF",
    "opacity": 1.0
})
# Wipe on right_panel
add_cmd({
    "type": "rect",
    "layer": "right_panel",
    "x": 763,
    "y": 55,
    "width": 222,
    "height": 45,
    "color": "#FFFFFF",
    "opacity": 1.0
})
# Separator line at y=98
add_cmd({
    "type": "rect",
    "layer": "right_panel",
    "x": 763,
    "y": 98,
    "width": 222,
    "height": 1,
    "color": "#E2E8F0",
    "opacity": 1.0
})

# 3. Clean Right Sidebar Top Header:
# Collaborator avatars ("who's watching")
add_cmd({"type": "ellipse", "layer": "right_panel", "x": 772, "y": 68, "width": 18, "height": 18, "color": "#EA580C", "opacity": 1.0})
add_cmd({"type": "ellipse", "layer": "right_panel", "x": 788, "y": 68, "width": 18, "height": 18, "color": "#7C3AED", "opacity": 1.0})
add_cmd({"type": "ellipse", "layer": "right_panel", "x": 804, "y": 68, "width": 18, "height": 18, "color": "#059669", "opacity": 1.0})

# Play/View button
add_cmd({"type": "rect", "layer": "right_panel", "x": 834, "y": 66, "width": 22, "height": 22, "color": "#F1F5F9", "opacity": 1.0})
add_cmd({"type": "stroke", "layer": "right_panel", "brush": "brush", "size": 2, "color": "#475569", "opacity": 1.0, "points": [[840, 70], [840, 82], [850, 76], [840, 70]]})

# Share CTA Button
add_cmd({"type": "rect", "layer": "right_panel", "x": 866, "y": 65, "width": 112, "height": 24, "color": "#0D99FF", "opacity": 1.0})
# Lettering SHARE on typography layer
add_cmd({"type": "stroke", "layer": "typography", "brush": "pencil", "size": 1, "color": "#FFFFFF", "opacity": 1.0, "points": [[888, 72], [894, 72], [888, 76], [894, 76], [888, 80]]}) # S
add_cmd({"type": "stroke", "layer": "typography", "brush": "pencil", "size": 1, "color": "#FFFFFF", "opacity": 1.0, "points": [[898, 72], [898, 80], [898, 76], [904, 76], [904, 72], [904, 80]]}) # H
add_cmd({"type": "stroke", "layer": "typography", "brush": "pencil", "size": 1, "color": "#FFFFFF", "opacity": 1.0, "points": [[909, 80], [912, 72], [915, 80], [910, 77], [914, 77]]}) # A
add_cmd({"type": "stroke", "layer": "typography", "brush": "pencil", "size": 1, "color": "#FFFFFF", "opacity": 1.0, "points": [[920, 80], [920, 72], [925, 72], [925, 76], [920, 76], [925, 80]]}) # R
add_cmd({"type": "stroke", "layer": "typography", "brush": "pencil", "size": 1, "color": "#FFFFFF", "opacity": 1.0, "points": [[930, 80], [930, 72], [935, 72], [930, 76], [934, 76], [930, 80], [935, 80]]}) # E

rev_path = "/private/tmp/codesketch-designer-20260910-fresh/artifacts/drawing/revisions_clean_both.json"
with open(rev_path, "w") as f:
    json.dump(commands, f, indent=2)

print(f"Generated {len(commands)} commands in {rev_path}")
