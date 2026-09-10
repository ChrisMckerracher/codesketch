import json

commands = []

def add_cmd(cmd):
    commands.append(cmd)

# Clean white background inside right sidebar top header on layer typography
add_cmd({
    "type": "rect",
    "layer": "typography",
    "x": 764,
    "y": 57,
    "width": 220,
    "height": 36,
    "color": "#FFFFFF",
    "opacity": 1.0
})

# Avatars ("who's watching") on layer typography
add_cmd({"type": "ellipse", "layer": "typography", "x": 772, "y": 66, "width": 18, "height": 18, "color": "#EA580C", "opacity": 1.0})
add_cmd({"type": "ellipse", "layer": "typography", "x": 788, "y": 66, "width": 18, "height": 18, "color": "#7C3AED", "opacity": 1.0})
add_cmd({"type": "ellipse", "layer": "typography", "x": 804, "y": 66, "width": 18, "height": 18, "color": "#059669", "opacity": 1.0})

# Divider dot or icon
add_cmd({"type": "ellipse", "layer": "typography", "x": 830, "y": 73, "width": 4, "height": 4, "color": "#CBD5E1", "opacity": 1.0})

# Share CTA Button on layer typography
add_cmd({"type": "rect", "layer": "typography", "x": 844, "y": 62, "width": 132, "height": 26, "color": "#0D99FF", "opacity": 1.0})

# Crisp white stroke lettering SHARE on layer typography
add_cmd({"type": "stroke", "layer": "typography", "brush": "pencil", "size": 1, "color": "#FFFFFF", "opacity": 1.0, "points": [[888, 68], [896, 68], [888, 74], [896, 74], [888, 80], [896, 80]]}) # S
add_cmd({"type": "stroke", "layer": "typography", "brush": "pencil", "size": 1, "color": "#FFFFFF", "opacity": 1.0, "points": [[902, 68], [902, 80], [902, 74], [910, 74], [910, 68], [910, 80]]}) # H
add_cmd({"type": "stroke", "layer": "typography", "brush": "pencil", "size": 1, "color": "#FFFFFF", "opacity": 1.0, "points": [[916, 80], [920, 68], [924, 80], [918, 75], [922, 75]]}) # A
add_cmd({"type": "stroke", "layer": "typography", "brush": "pencil", "size": 1, "color": "#FFFFFF", "opacity": 1.0, "points": [[930, 80], [930, 68], [937, 68], [937, 74], [930, 74], [937, 80]]}) # R
add_cmd({"type": "stroke", "layer": "typography", "brush": "pencil", "size": 1, "color": "#FFFFFF", "opacity": 1.0, "points": [[943, 80], [943, 68], [951, 68], [943, 74], [949, 74], [943, 80], [951, 80]]}) # E

rev_path = "/private/tmp/codesketch-designer-20260910-fresh/artifacts/drawing/revisions_header.json"
with open(rev_path, "w") as f:
    json.dump(commands, f, indent=2)

print(f"Generated {len(commands)} commands in {rev_path}")
