import json

commands = []

def draw_rect(layer, x, y, w, h, color, opacity=1.0):
    commands.append({
        "type": "rect", "layer": layer,
        "x": int(x), "y": int(y), "width": int(w), "height": int(h),
        "color": color, "opacity": round(opacity, 2)
    })

def draw_stroke(layer, pts, color="#1E293B", size=1, brush="brush", opacity=1.0):
    clamped = [[int(round(pt[0])), int(round(pt[1]))] for pt in pts]
    commands.append({
        "type": "stroke", "layer": layer,
        "points": clamped, "color": color, "size": max(1, int(size)),
        "brush": brush, "opacity": round(opacity, 2)
    })

# 1. Seamless Mountain Ridge behind loupe:
# Yellow horizon above mountain
draw_rect("typography", 340, 260, 136, 35, "#FEF08A")

# Mountain body fill
for my in range(295, 385, 10):
    draw_rect("typography", 340, my, 136, 12, "#2563EB")

# Midground ridge slope line
draw_stroke("typography", [[340, 230], [360, 260], [390, 275], [420, 290], [450, 270], [476, 238]], color="#3B82F6", size=8)

# Crag shadows
draw_stroke("typography", [[340, 230], [365, 325]], color="#1D4ED8", size=4)
draw_stroke("typography", [[420, 290], [440, 340]], color="#1D4ED8", size=4)

# Inking Brush Stroke crossing the mountain
draw_stroke("typography", [[330, 280], [380, 290], [430, 265], [476, 242]], color="#2563EB", size=14)

# Pine hill base (green)
draw_rect("typography", 340, 385, 136, 25, "#065F46")
draw_stroke("typography", [[340, 385], [380, 390], [430, 365], [476, 342]], color="#047857", size=10)

# Pine trees along ridge
for px in [370, 420]:
    py = 380 if px < 400 else 360
    draw_stroke("typography", [[px, py+28], [px, py]], color="#022C22", size=3)
    draw_stroke("typography", [[px-7, py+16], [px, py+3], [px+7, py+16]], color="#064E3B", size=4)
    draw_stroke("typography", [[px-11, py+26], [px, py+10], [px+11, py+26]], color="#047857", size=4)

# 2. Redraw the Eyedropper Loupe ("Pixel Thingy") cleanly on top of the restored mountain!
# Outer shadow & bezel
draw_rect("typography", 356, 306, 48, 48, "#000000", opacity=0.35)
draw_rect("typography", 355, 305, 50, 50, "#0F172A")
draw_rect("typography", 357, 307, 46, 46, "#FFFFFF")
draw_rect("typography", 358, 308, 44, 44, "#0F172A")

# 7x7 discrete pixel square colors
pixel_squares_7x7 = [
    ["#3B82F6", "#3B82F6", "#2563EB", "#2563EB", "#1D4ED8", "#1E3A8A", "#1E3A8A"],
    ["#3B82F6", "#2563EB", "#2563EB", "#1D4ED8", "#1E3A8A", "#1E3A8A", "#172554"],
    ["#60A5FA", "#3B82F6", "#2563EB", "#1E3A8A", "#1E3A8A", "#172554", "#0F172A"],
    ["#60A5FA", "#3B82F6", "#1D4ED8", "#1E3A8A", "#172554", "#0F172A", "#0F172A"],
    ["#93C5FD", "#60A5FA", "#2563EB", "#1E3A8A", "#172554", "#0F172A", "#020617"],
    ["#BFDBFE", "#93C5FD", "#3B82F6", "#1D4ED8", "#1E3A8A", "#172554", "#0F172A"],
    ["#DBEAFE", "#BFDBFE", "#60A5FA", "#2563EB", "#1D4ED8", "#1E3A8A", "#172554"]
]

px_size = 6
grid_start_x = 359
grid_start_y = 309

for py_idx, prow in enumerate(pixel_squares_7x7):
    py_coord = grid_start_y + py_idx * px_size
    for px_idx, pcol in enumerate(prow):
        px_coord = grid_start_x + px_idx * px_size
        draw_rect("typography", px_coord, py_coord, px_size, px_size, pcol)
        draw_rect("typography", px_coord, py_coord, px_size, 1, "#0F172A", opacity=0.45)
        draw_rect("typography", px_coord, py_coord, 1, px_size, "#0F172A", opacity=0.45)

# Highlight center sampled pixel square
center_x = grid_start_x + 3 * px_size
center_y = grid_start_y + 3 * px_size
draw_rect("typography", center_x, center_y, px_size, 1, "#FFFFFF")
draw_rect("typography", center_x, center_y + px_size - 1, px_size, 1, "#FFFFFF")
draw_rect("typography", center_x, center_y, 1, px_size, "#FFFFFF")
draw_rect("typography", center_x + px_size - 1, center_y, 1, px_size, "#FFFFFF")

# Crosshairs
draw_stroke("typography", [[380, 298], [380, 305]], color="#FFFFFF", size=1.5)
draw_stroke("typography", [[380, 355], [380, 362]], color="#FFFFFF", size=1.5)
draw_stroke("typography", [[348, 330], [355, 330]], color="#FFFFFF", size=1.5)
draw_stroke("typography", [[405, 330], [412, 330]], color="#FFFFFF", size=1.5)

# Label badge
draw_rect("typography", 351, 365, 58, 17, "#0F172A")
draw_rect("typography", 351, 365, 58, 1, "#38BDF8", opacity=0.8)

GLYPHS = {
    "#": [[[1.5, 0], [1.5, 7]], [[3.5, 0], [3.5, 7]], [[0, 2.5], [5, 2.5]], [[0, 4.5], [5, 4.5]]],
    "1": [[[0.5, 2.5], [2.5, 0], [2.5, 7]], [[1, 7], [4, 7]]],
    "E": [[[5, 0], [0, 0], [0, 7], [5, 7]], [[0, 3.5], [4, 3.5]]],
    "3": [[[0, 1], [1, 0], [4, 0], [5, 2], [3, 3.5], [5, 5], [4, 7], [1, 7], [0, 6]]],
    "A": [[[0, 7], [0, 2], [2, 0], [3, 0], [5, 2], [5, 7]], [[0, 4], [5, 4]]],
    "8": [[[2, 0], [3, 0], [5, 1.5], [3, 3.5], [2, 3.5], [0, 1.5], [2, 0]], [[2, 3.5], [3, 3.5], [5, 5.5], [3, 7], [2, 7], [0, 5.5], [2, 3.5]]]
}

cur_x = 356
for ch in "#1E3A8A":
    if ch in GLYPHS:
        for path in GLYPHS[ch]:
            pts = [[cur_x + p[0] * 0.7, 369 + p[1] * 0.7] for p in path]
            draw_stroke("typography", pts, color="#38BDF8", size=1)
    cur_x += 5 * 0.7 + 2

# Leader line connecting to PICK
for lx in range(414, 476, 8):
    ly_coord = int(330 + (lx - 414) * (338 - 330) / (476 - 414))
    draw_stroke("typography", [[lx, ly_coord], [lx + 4, ly_coord]], color="#0284C7", size=1, opacity=0.7)

print(f"Total commands in mountain touchup: {len(commands)}")
with open("/private/tmp/codesketch-designer-20260910-fresh/artifacts/drawing/mountain_touchup.json", "w") as f:
    json.dump(commands, f, indent=2)
