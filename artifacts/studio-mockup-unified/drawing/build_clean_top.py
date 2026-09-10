import json

commands = []

def add_cmd(cmd):
    commands.append(cmd)

# 1. Cleanly wipe the entire top area on the TOPMOST layer (typography) to erase all old text/headers above y=54
add_cmd({
    "type": "rect",
    "layer": "typography",
    "x": 0,
    "y": 0,
    "width": 1000,
    "height": 54,
    "color": "#EEF2F6",
    "opacity": 1.0
})

# 2. Also wipe on base_ui just to be completely uniform
add_cmd({
    "type": "rect",
    "layer": "base_ui",
    "x": 0,
    "y": 0,
    "width": 1000,
    "height": 54,
    "color": "#EEF2F6",
    "opacity": 1.0
})

# 3. Clean the top header area of right_panel on BOTH right_panel and typography layers (y=56 to y=96)
add_cmd({
    "type": "rect",
    "layer": "right_panel",
    "x": 763,
    "y": 57,
    "width": 222,
    "height": 38,
    "color": "#F8FAFC",
    "opacity": 1.0
})
add_cmd({
    "type": "rect",
    "layer": "typography",
    "x": 763,
    "y": 57,
    "width": 222,
    "height": 38,
    "color": "#F8FAFC",
    "opacity": 1.0
})
add_cmd({
    "type": "rect",
    "layer": "right_panel",
    "x": 763,
    "y": 94,
    "width": 222,
    "height": 1,
    "color": "#E2E8F0",
    "opacity": 1.0
})

# 4. Now draw the clean right sidebar top header:
# Avatars ("who's watching")
add_cmd({"type": "ellipse", "layer": "right_panel", "x": 772, "y": 66, "width": 18, "height": 18, "color": "#EA580C", "opacity": 1.0})
add_cmd({"type": "ellipse", "layer": "right_panel", "x": 786, "y": 66, "width": 18, "height": 18, "color": "#7C3AED", "opacity": 1.0})
add_cmd({"type": "ellipse", "layer": "right_panel", "x": 800, "y": 66, "width": 18, "height": 18, "color": "#059669", "opacity": 1.0})

# Play/View button
add_cmd({"type": "rect", "layer": "right_panel", "x": 828, "y": 64, "width": 22, "height": 22, "color": "#F1F5F9", "opacity": 1.0})
add_cmd({"type": "stroke", "layer": "right_panel", "brush": "brush", "size": 2, "color": "#475569", "opacity": 1.0, "points": [[834, 68], [834, 80], [844, 74], [834, 68]]})

# Share CTA Button
add_cmd({"type": "rect", "layer": "right_panel", "x": 860, "y": 63, "width": 116, "height": 24, "color": "#0D99FF", "opacity": 1.0})
# Lettering SHARE on typography
add_cmd({"type": "stroke", "layer": "typography", "brush": "pencil", "size": 1, "color": "#FFFFFF", "opacity": 1.0, "points": [[880, 70], [886, 70], [880, 74], [886, 74], [880, 78]]}) # S
add_cmd({"type": "stroke", "layer": "typography", "brush": "pencil", "size": 1, "color": "#FFFFFF", "opacity": 1.0, "points": [[892, 70], [892, 78], [892, 74], [898, 74], [898, 70], [898, 78]]}) # H
add_cmd({"type": "stroke", "layer": "typography", "brush": "pencil", "size": 1, "color": "#FFFFFF", "opacity": 1.0, "points": [[904, 78], [907, 70], [910, 78], [905, 75], [909, 75]]}) # A
add_cmd({"type": "stroke", "layer": "typography", "brush": "pencil", "size": 1, "color": "#FFFFFF", "opacity": 1.0, "points": [[916, 78], [916, 70], [921, 70], [921, 74], [916, 74], [921, 78]]}) # R
add_cmd({"type": "stroke", "layer": "typography", "brush": "pencil", "size": 1, "color": "#FFFFFF", "opacity": 1.0, "points": [[927, 78], [927, 70], [932, 70], [927, 74], [931, 74], [927, 78], [932, 78]]}) # E

# 5. Crisp frame on top of artboard
add_cmd({"type": "stroke", "layer": "artboard", "brush": "pencil", "size": 1, "color": "#CBD5E1", "opacity": 1.0, "points": [[252, 56], [748, 56]]})

rev_path = "/private/tmp/codesketch-designer-20260910-fresh/artifacts/drawing/revisions_clean_top.json"
with open(rev_path, "w") as f:
    json.dump(commands, f, indent=2)

print(f"Generated {len(commands)} commands in {rev_path}")
