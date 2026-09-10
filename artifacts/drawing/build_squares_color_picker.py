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

def draw_stroke(layer, pts, color="#1E293B", size=1, brush="brush", opacity=1.0):
    clamped_pts = []
    for pt in pts:
        cx = max(0, min(1000, int(round(pt[0]))))
        cy = max(0, min(700, int(round(pt[1]))))
        clamped_pts.append([cx, cy])
    if len(clamped_pts) == 1:
        clamped_pts.append([clamped_pts[0][0], clamped_pts[0][1]])
    add_command({
        "type": "stroke",
        "layer": layer,
        "points": clamped_pts,
        "color": color,
        "size": max(1, int(size)),
        "brush": brush,
        "opacity": round(opacity, 2)
    })

GLYPHS = {
    "A": [[[0, 7], [0, 2], [2, 0], [3, 0], [5, 2], [5, 7]], [[0, 4], [5, 4]]],
    "B": [[[0, 7], [0, 0], [4, 0], [5, 1.5], [4, 3.5], [0, 3.5], [4, 3.5], [5, 5], [4, 7], [0, 7]]],
    "C": [[[5, 1], [3, 0], [2, 0], [0, 2], [0, 5], [2, 7], [3, 7], [5, 6]]],
    "D": [[[0, 7], [0, 0], [3, 0], [5, 2], [5, 5], [3, 7], [0, 7]]],
    "E": [[[5, 0], [0, 0], [0, 7], [5, 7]], [[0, 3.5], [4, 3.5]]],
    "F": [[[0, 7], [0, 0], [5, 0]], [[0, 3.5], [3.5, 3.5]]],
    "G": [[[5, 1], [3, 0], [2, 0], [0, 2], [0, 5], [2, 7], [4, 7], [5, 6], [5, 3.5], [3, 3.5]]],
    "H": [[[0, 0], [0, 7]], [[5, 0], [5, 7]], [[0, 3.5], [5, 3.5]]],
    "I": [[[2.5, 0], [2.5, 7]]],
    "J": [[[4, 0], [4, 5], [3, 7], [1, 7], [0, 5]]],
    "K": [[[0, 0], [0, 7]], [[5, 0], [0, 4], [5, 7]]],
    "L": [[[0, 0], [0, 7], [5, 7]]],
    "M": [[[0, 7], [0, 0], [2.5, 4], [5, 0], [5, 7]]],
    "N": [[[0, 7], [0, 0], [5, 7], [5, 0]]],
    "O": [[[2, 0], [3, 0], [5, 2], [5, 5], [3, 7], [2, 7], [0, 5], [0, 2], [2, 0]]],
    "P": [[[0, 7], [0, 0], [4, 0], [5, 1.5], [4, 3.5], [0, 3.5]]],
    "Q": [[[2, 0], [3, 0], [5, 2], [5, 5], [3, 7], [2, 7], [0, 5], [0, 2], [2, 0]], [[3, 5], [5, 7]]],
    "R": [[[0, 7], [0, 0], [4, 0], [5, 1.5], [4, 3.5], [0, 3.5]], [[3, 3.5], [5, 7]]],
    "S": [[[5, 1], [3, 0], [1, 0], [0, 1.5], [1, 3.5], [4, 3.5], [5, 5.5], [4, 7], [2, 7], [0, 6]]],
    "T": [[[0, 0], [5, 0]], [[2.5, 0], [2.5, 7]]],
    "U": [[[0, 0], [0, 5], [2, 7], [3, 7], [5, 5], [5, 0]]],
    "V": [[[0, 0], [2.5, 7], [5, 0]]],
    "W": [[[0, 0], [1.5, 7], [2.5, 3], [3.5, 7], [5, 0]]],
    "X": [[[0, 0], [5, 7]], [[5, 0], [0, 7]]],
    "Y": [[[0, 0], [2.5, 3.5], [5, 0]], [[2.5, 3.5], [2.5, 7]]],
    "Z": [[[0, 0], [5, 0], [0, 7], [5, 7]]],
    "0": [[[2, 0], [3, 0], [5, 2], [5, 5], [3, 7], [2, 7], [0, 5], [0, 2], [2, 0]], [[4, 1], [1, 6]]],
    "1": [[[0.5, 2.5], [2.5, 0], [2.5, 7]], [[1, 7], [4, 7]]],
    "2": [[[0, 2], [1, 0], [4, 0], [5, 2], [0, 7], [5, 7]]],
    "3": [[[0, 1], [1, 0], [4, 0], [5, 2], [3, 3.5], [5, 5], [4, 7], [1, 7], [0, 6]]],
    "4": [[[4, 7], [4, 0], [0, 5], [5, 5]]],
    "5": [[[5, 0], [0, 0], [0, 3.5], [4, 3.5], [5, 5], [4, 7], [1, 7], [0, 6]]],
    "6": [[[4, 0], [2, 0], [0, 3], [0, 5], [2, 7], [4, 7], [5, 5], [4, 3.5], [0, 3.5]]],
    "7": [[[0, 0], [5, 0], [2, 7]]],
    "8": [[[2, 0], [3, 0], [5, 1.5], [3, 3.5], [2, 3.5], [0, 1.5], [2, 0]], [[2, 3.5], [3, 3.5], [5, 5.5], [3, 7], [2, 7], [0, 5.5], [2, 3.5]]],
    "9": [[[5, 3.5], [1, 3.5], [0, 2], [1, 0], [4, 0], [5, 3], [5, 5], [3, 7], [1, 7]]],
    ":": [[[2.5, 2], [2.5, 2.5]], [[2.5, 5], [2.5, 5.5]]],
    "-": [[[0, 3.5], [5, 3.5]]],
    "/": [[[0, 7], [5, 0]]],
    "+": [[[2.5, 1], [2.5, 6]], [[0, 3.5], [5, 3.5]]],
    "#": [[[1.5, 0], [1.5, 7]], [[3.5, 0], [3.5, 7]], [[0, 2.5], [5, 2.5]], [[0, 4.5], [5, 4.5]]],
    "[": [[[3, 0], [1, 0], [1, 7], [3, 7]]],
    "]": [[[1, 0], [3, 0], [3, 7], [1, 7]]],
    "(": [[[3, 0], [1, 2], [1, 5], [3, 7]]],
    ")": [[[1, 0], [3, 2], [3, 5], [1, 7]]],
    "%": [[[0, 1], [1, 1]], [[4, 6], [5, 6]], [[0, 7], [5, 0]]],
    ".": [[[2, 6.5], [3, 6.5]]],
    ",": [[[2, 6], [3, 6], [1, 8]]],
    "=": [[[0, 2.5], [5, 2.5]], [[0, 4.5], [5, 4.5]]],
    ">": [[[0, 1], [4, 3.5], [0, 6]]],
    "<": [[[4, 1], [0, 3.5], [4, 6]]],
    "|": [[[2.5, 0], [2.5, 7]]],
    "&": [[[4, 0], [2, 0], [0, 2], [0, 3.5], [4, 5], [4, 7], [2, 7], [0, 5]], [[2, 3.5], [5, 7]]],
    "!": [[[2.5, 0], [2.5, 4.5]], [[2.5, 6.5], [2.5, 7]]],
    " ": []
}

def draw_text(layer, text, start_x, start_y, scale=1.0, color="#FFFFFF", size=1, spacing=2):
    char_w = 5 * scale
    cur_x = start_x
    for ch in text:
        if ch == " ":
            cur_x += 4 * scale
            continue
        if ch in GLYPHS:
            paths = GLYPHS[ch]
            for path in paths:
                pts = [[cur_x + p[0] * scale, start_y + p[1] * scale] for p in path]
                draw_stroke(layer, pts, color=color, size=size)
        cur_x += char_w + spacing


# =========================================================================
# 0. NATURAL SEAMLESS RESTORATION OF MOUNTAIN RIDGE BEHIND EYEDROPPER
# Perfectly matches the landscape terrain without harsh rectangular boxes!
# =========================================================================
# Horizon sky yellow band above ridge
draw_rect("typography", 340, 260, 140, 35, "#FEF08A")

# Midground mountain base fill
for my in range(295, 385, 8):
    draw_rect("typography", 340, my, 140, 10, "#2563EB")

# Midground ridge slope line
draw_stroke("typography", [[340, 230], [360, 260], [390, 275], [420, 290], [450, 270], [480, 235]], color="#3B82F6", size=8)

# Crag shadows
draw_stroke("typography", [[340, 230], [365, 325]], color="#1D4ED8", size=4)
draw_stroke("typography", [[420, 290], [440, 340]], color="#1D4ED8", size=4)

# Inking Brush Stroke crossing the mountain
draw_stroke("typography", [[330, 280], [380, 290], [430, 265], [480, 240]], color="#2563EB", size=14)

# Pine hill base (green)
draw_rect("typography", 340, 385, 140, 25, "#065F46")
draw_stroke("typography", [[340, 385], [380, 390], [430, 365], [480, 340]], color="#047857", size=10)

# Pine trees at x=370 and x=420
for px in [370, 420]:
    py = 380 if px < 400 else 360
    draw_stroke("typography", [[px, py+28], [px, py]], color="#022C22", size=3)
    draw_stroke("typography", [[px-7, py+16], [px, py+3], [px+7, py+16]], color="#064E3B", size=4)
    draw_stroke("typography", [[px-11, py+26], [px, py+10], [px+11, py+26]], color="#047857", size=4)


# =========================================================================
# 1. COLOR PICKER POPOVER: NICE SQUARES (x: 476..724, y: 168..425)
# Anchored to the left of the right sidebar with pointer arrow to #2563EB
# =========================================================================
# Popover Drop Shadow
draw_rounded_rect("typography", 479, 171, 248, 258, 6, "#000000", opacity=0.25)
# Card Body
draw_rounded_rect("typography", 476, 168, 248, 258, 6, "#FFFFFF")
draw_rect("typography", 476, 168, 248, 1, "#CBD5E1")
draw_rect("typography", 476, 168, 1, 258, "#CBD5E1")
draw_rect("typography", 723, 168, 1, 258, "#CBD5E1")
draw_rect("typography", 476, 425, 248, 1, "#CBD5E1")

# Pointer arrow pointing to INK PIGMENT (#2563EB at x: 740, y: 235)
draw_stroke("typography", [[724, 230], [736, 235], [724, 240]], color="#CBD5E1", size=1)
draw_stroke("typography", [[724, 231], [734, 235], [724, 239]], color="#FFFFFF", size=2)

# Popover Header
draw_rounded_rect("typography", 477, 169, 246, 26, 5, "#F8FAFC")
draw_rect("typography", 476, 195, 248, 1, "#E2E8F0")
# Pill title: COLOR PALETTE
draw_rounded_rect("typography", 486, 173, 106, 18, 3, "#E0F2FE")
draw_text("typography", "COLOR PALETTE", 492, 177, scale=0.7, color="#0284C7", size=1)
# Close [X]
draw_text("typography", "X", 710, 176, scale=0.75, color="#94A3B8", size=1)

# =========================================================================
# NICE SQUARES MATRIX (8 Columns x 5 Rows = 40 Crisp Square Swatches)
# Width = 8 * 24 + 7 * 4 = 220px. From x=486 to x=706.
# =========================================================================
palette_matrix = [
    # Row 0: Neutrals & Values
    ["#000000", "#1E293B", "#475569", "#64748B", "#94A3B8", "#CBD5E1", "#E2E8F0", "#FFFFFF"],
    # Row 1: Primaries & Vibrant Accents
    ["#EF4444", "#F97316", "#F59E0B", "#10B981", "#06B6D4", "#2563EB", "#6366F1", "#A855F7"],
    # Row 2: Deep / Jewel Shades
    ["#991B1B", "#C2410C", "#B45309", "#065F46", "#0E7490", "#1E3A8A", "#3730A3", "#581C87"],
    # Row 3: Pastel / Tint Tones
    ["#FCA5A5", "#FDBA74", "#FDE047", "#86EFAC", "#67E8F9", "#93C5FD", "#C4B5FD", "#F472B6"],
    # Row 4: Earth & Mineral Pigments
    ["#78350F", "#9A3412", "#713F12", "#365314", "#164E63", "#1E40AF", "#4C1D95", "#831843"]
]

sq_w = 24
sq_h = 18
gap_x = 4
gap_y = 4
start_x = 486
start_y = 204

for r_idx, row in enumerate(palette_matrix):
    cur_y = start_y + r_idx * (sq_h + gap_y)
    for c_idx, col in enumerate(row):
        cur_x = start_x + c_idx * (sq_w + gap_x)
        
        # Draw nice square swatch
        draw_rect("typography", cur_x, cur_y, sq_w, sq_h, col)
        
        # Crisp square border
        border_col = "#E2E8F0" if col in ["#000000", "#1E293B"] else ("#CBD5E1" if col == "#FFFFFF" else "#000000")
        border_op = 0.15 if col not in ["#FFFFFF"] else 0.5
        draw_rect("typography", cur_x, cur_y, sq_w, 1, border_col, opacity=border_op)
        draw_rect("typography", cur_x, cur_y, 1, sq_h, border_col, opacity=border_op)
        draw_rect("typography", cur_x + sq_w - 1, cur_y, 1, sq_h, border_col, opacity=border_op)
        draw_rect("typography", cur_x, cur_y + sq_h - 1, sq_w, 1, border_col, opacity=border_op)
        
        # Highlight active square: Cobalt Blue #2563EB (Row 1, Col 5)
        if col == "#2563EB":
            # Distinct active square indicator: outer cyan border + inner white square
            draw_rect("typography", cur_x - 2, cur_y - 2, sq_w + 4, 2, "#0284C7")
            draw_rect("typography", cur_x - 2, cur_y + sq_h, sq_w + 4, 2, "#0284C7")
            draw_rect("typography", cur_x - 2, cur_y - 2, 2, sq_h + 4, "#0284C7")
            draw_rect("typography", cur_x + sq_w, cur_y - 2, 2, sq_h + 4, "#0284C7")
            # Inset target reticle square
            draw_rect("typography", cur_x + 8, cur_y + 5, 8, 8, "#FFFFFF")
            draw_rect("typography", cur_x + 10, cur_y + 7, 4, 4, "#2563EB")

# Divider line
draw_rect("typography", 486, 318, 220, 1, "#F1F5F9")

# =========================================================================
# ACTION ROW: EYEDROPPER + HEX INPUT + PREVIEW SQUARE (y: 326..350)
# =========================================================================
# Eyedropper Button [⌖ PICK]
draw_rounded_rect("typography", 486, 326, 68, 24, 3, "#E0F2FE")
draw_stroke("typography", [[494, 338], [500, 338]], color="#0284C7", size=1)
draw_stroke("typography", [[497, 335], [497, 341]], color="#0284C7", size=1)
draw_text("typography", "PICK", 504, 332, scale=0.75, color="#0284C7", size=1)

# Hex Text Field with active caret
draw_rounded_rect("typography", 560, 326, 92, 24, 3, "#F8FAFC")
draw_rect("typography", 560, 326, 92, 1, "#CBD5E1")
draw_rect("typography", 560, 326, 1, 24, "#CBD5E1")
draw_rect("typography", 651, 326, 1, 24, "#CBD5E1")
draw_rect("typography", 560, 349, 92, 1, "#CBD5E1")
draw_text("typography", "#2563EB", 568, 332, scale=0.8, color="#0F172A", size=1)
# Blinking Caret
draw_stroke("typography", [[632, 330], [632, 344]], color="#0284C7", size=1.5)

# Swatch Preview - Nice Square Swatch!
draw_rect("typography", 658, 326, 48, 24, "#2563EB")
draw_rect("typography", 658, 326, 48, 1, "#CBD5E1")
draw_rect("typography", 658, 326, 1, 24, "#CBD5E1")
draw_rect("typography", 705, 326, 1, 24, "#CBD5E1")
draw_rect("typography", 658, 349, 48, 1, "#CBD5E1")
draw_text("typography", "NEW", 670, 333, scale=0.7, color="#FFFFFF", size=1)

# Primary Button: [ APPLY PIGMENT ]
draw_rounded_rect("typography", 486, 356, 220, 26, 4, "#0284C7")
draw_text("typography", "APPLY PIGMENT", 536, 363, scale=0.85, color="#FFFFFF", size=1)

# Secondary Row: Recent Mixes as Nice Squares! (y: 390..414)
draw_text("typography", "RECENT", 486, 396, scale=0.65, color="#94A3B8", size=1)
recent_colors = ["#1E40AF", "#3B82F6", "#0284C7", "#0EA5E9", "#38BDF8", "#7DD3FC"]
rx = 540
for rc in recent_colors:
    draw_rect("typography", rx, 392, 16, 16, rc)
    draw_rect("typography", rx, 392, 16, 1, "#CBD5E1", opacity=0.6)
    draw_rect("typography", rx, 392, 1, 16, "#CBD5E1", opacity=0.6)
    draw_rect("typography", rx + 15, 392, 1, 16, "#CBD5E1", opacity=0.6)
    draw_rect("typography", rx, 407, 16, 1, "#CBD5E1", opacity=0.6)
    rx += 26


# =========================================================================
# 2. CANVAS EYEDROPPER LOUPE ("PIXEL THINGY"): CLEAR SQUARES, NOT GRADIENT!
# Showing discrete magnified pixel squares in a 7x7 grid over (380, 330)
# =========================================================================
# Outer shadow & bezel
draw_rect("typography", 356, 306, 48, 48, "#000000", opacity=0.35)
draw_rect("typography", 355, 305, 50, 50, "#0F172A")
draw_rect("typography", 357, 307, 46, 46, "#FFFFFF")
draw_rect("typography", 358, 308, 44, 44, "#0F172A")

# 7x7 discrete pixel square colors sampled across the mountain crag & ridge
# NO GRADIENT! Clear individual square pixels!
pixel_squares_7x7 = [
    ["#3B82F6", "#3B82F6", "#2563EB", "#2563EB", "#1D4ED8", "#1E3A8A", "#1E3A8A"],
    ["#3B82F6", "#2563EB", "#2563EB", "#1D4ED8", "#1E3A8A", "#1E3A8A", "#172554"],
    ["#60A5FA", "#3B82F6", "#2563EB", "#1E3A8A", "#1E3A8A", "#172554", "#0F172A"],
    ["#60A5FA", "#3B82F6", "#1D4ED8", "#1E3A8A", "#172554", "#0F172A", "#0F172A"], # center (3,3) = #1E3A8A
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
        
        # Draw clear square pixel!
        draw_rect("typography", px_coord, py_coord, px_size, px_size, pcol)
        
        # 1px crisp grid separator between pixel squares
        draw_rect("typography", px_coord, py_coord, px_size, 1, "#0F172A", opacity=0.45)
        draw_rect("typography", px_coord, py_coord, 1, px_size, "#0F172A", opacity=0.45)

# Highlight center sampled pixel square (index 3, 3) with crisp white reticle frame!
center_x = grid_start_x + 3 * px_size # 359 + 18 = 377
center_y = grid_start_y + 3 * px_size # 309 + 18 = 327

# Inset target reticle around center square
draw_rect("typography", center_x, center_y, px_size, 1, "#FFFFFF")
draw_rect("typography", center_x, center_y + px_size - 1, px_size, 1, "#FFFFFF")
draw_rect("typography", center_x, center_y, 1, px_size, "#FFFFFF")
draw_rect("typography", center_x + px_size - 1, center_y, 1, px_size, "#FFFFFF")

# Crosshairs pointing to the center square from outside
draw_stroke("typography", [[380, 298], [380, 305]], color="#FFFFFF", size=1.5)
draw_stroke("typography", [[380, 355], [380, 362]], color="#FFFFFF", size=1.5)
draw_stroke("typography", [[348, 330], [355, 330]], color="#FFFFFF", size=1.5)
draw_stroke("typography", [[405, 330], [412, 330]], color="#FFFFFF", size=1.5)

# Label badge under the pixel thingy showing sampled hex: #1E3A8A
draw_rounded_rect("typography", 351, 365, 58, 17, 3, "#0F172A")
draw_rect("typography", 351, 365, 58, 1, "#38BDF8", opacity=0.8)
draw_text("typography", "#1E3A8A", 355, 369, scale=0.65, color="#38BDF8", size=1)

# Subtle dashed leader line connecting sampling loupe to the [PICK] button in popover
for lx in range(414, 486, 8):
    ly_coord = int(330 + (lx - 414) * (338 - 330) / (486 - 414))
    draw_stroke("typography", [[lx, ly_coord], [lx + 4, ly_coord]], color="#0284C7", size=1, opacity=0.7)

print(f"Total commands generated: {len(commands)}")
with open("/private/tmp/codesketch-designer-20260910-fresh/artifacts/drawing/squares_picker_patch.json", "w") as f:
    json.dump(commands, f, indent=2)
