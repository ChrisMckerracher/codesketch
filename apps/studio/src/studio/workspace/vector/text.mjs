// Vector text rendering. Text is drawn from native glyph paths only: no
// fonts, fillText, or strokeText. Each rendered glyph occupies a 5x7 cell
// advanced by 8 * scale; lines advance 11 * scale.

import { GLYPHS, REPLACEMENT } from "./glyphs.mjs";
import { drawStroke } from "./primitives.mjs";

export const CHAR_ADVANCE = 8;
export const LINE_HEIGHT = 11;

function glyphFor(char) {
  if (Object.prototype.hasOwnProperty.call(GLYPHS, char)) return GLYPHS[char];
  if (isWhitespace(char)) return [];
  return REPLACEMENT;
}

function isWhitespace(char) {
  return char !== "\n" && char !== "\r" && char !== "\u2028" && char !== "\u2029" &&
    /^\s$/u.test(char);
}

function isLineBreak(char) {
  return char === "\n" || char === "\r" || char === "\u2028" || char === "\u2029";
}

function resolvedScale(scale) {
  const value = Number(scale);
  return Number.isFinite(value) ? value : 1;
}

// Convert source code points to rendered cells without losing their UTF-16
// source range. Uppercase expansions intentionally produce multiple cells
// with the same source range, e.g. the sharp-s becomes two S cells.
function sourceUnits(text) {
  const raw = String(text);
  const units = [];
  let offset = 0;
  while (offset < raw.length) {
    const start = offset;
    const codePoint = raw.codePointAt(offset);
    const sourceChar = String.fromCodePoint(codePoint);
    offset += sourceChar.length;
    if (sourceChar === "\r" && raw[offset] === "\n") offset += 1;
    if (sourceChar === "\r" || isLineBreak(sourceChar)) {
      units.push({ break: true, start, end: offset });
      continue;
    }
    for (const char of sourceChar.toUpperCase()) {
      units.push({ char, whitespace: isWhitespace(char), start, end: offset });
    }
  }
  return units;
}

function cellLimit(maxWidth, advance) {
  const width = Number(maxWidth);
  if (width === Infinity) return Infinity;
  if (!Number.isFinite(width)) return 1;
  if (!(advance > 0)) return Infinity;
  return Math.max(1, Math.floor(Math.max(width, 0) / advance));
}

function appendWord(line, lines, word, maxCells) {
  let index = 0;
  while (index < word.length) {
    const room = maxCells - line.length;
    if (room <= 0) {
      line = [];
      lines.push(line);
    }
    const count = Math.min(maxCells - line.length, word.length - index);
    line.push(...word.slice(index, index + count));
    index += count;
    if (index < word.length) {
      line = [];
      lines.push(line);
    }
  }
  return line;
}

// One layout pass is shared by drawing, measurement, and wrapping. Lines are
// kept as cell arrays until the final projection so spaces and source ranges
// survive wrapping unchanged.
export function layoutText(text, maxWidth = Infinity, scale = 1) {
  const renderedScale = resolvedScale(scale);
  const advance = CHAR_ADVANCE * renderedScale;
  const lineHeight = LINE_HEIGHT * renderedScale;
  const maxCells = cellLimit(maxWidth, advance);
  const lineCells = [[]];
  let line = lineCells[0];
  const units = sourceUnits(text);

  for (let index = 0; index < units.length;) {
    const unit = units[index];
    if (unit.break) {
      line = [];
      lineCells.push(line);
      index += 1;
      continue;
    }
    if (unit.whitespace) {
      if (line.length >= maxCells) {
        line = [];
        lineCells.push(line);
      }
      line.push(unit);
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < units.length && !units[end].break && !units[end].whitespace) end += 1;
    const word = units.slice(index, end);
    if (line.length > 0 && line.length + word.length > maxCells) {
      line = [];
      lineCells.push(line);
    }
    line = appendWord(line, lineCells, word, maxCells);
    index = end;
  }

  const lines = lineCells.map((cells) => cells.map((cell) => cell.char).join(""));
  const cells = [];
  let width = 0;
  for (let row = 0; row < lineCells.length; row += 1) {
    const rowCells = lineCells[row];
    width = Math.max(width, rowCells.length * advance);
    for (let column = 0; column < rowCells.length; column += 1) {
      const cell = rowCells[column];
      cells.push({
        char: cell.char,
        x: column * advance,
        y: row * lineHeight,
        start: cell.start,
        end: cell.end,
      });
    }
  }
  return {
    cells,
    lines,
    width,
    height: lineCells.length * lineHeight,
    lineHeight,
  };
}

function drawPaths(ctx, paths, originX, originY, scale, color, size, opacity) {
  for (const path of paths) {
    const points = path.map(([px, py]) => [originX + px * scale, originY + py * scale]);
    if (points.length === 1) {
      points.push([points[0][0] + 1, points[0][1] + 1]);
    }
    drawStroke(ctx, points, color, size, opacity);
  }
}

export function drawText(ctx, text, x, y, scale = 1, color = "#1E293B", size = 1, opacity = 1) {
  const renderedScale = resolvedScale(scale);
  const layout = layoutText(text, Infinity, renderedScale);
  ctx.save();
  ctx.globalAlpha = opacity;
  for (const cell of layout.cells) {
    drawPaths(ctx, glyphFor(cell.char), x + cell.x, y + cell.y,
      renderedScale, color, size, opacity);
  }
  ctx.restore();
}

export function measureText(text, scale = 1) {
  return layoutText(text, Infinity, scale).width;
}

export function wrapText(text, maxWidth, scale = 1) {
  return layoutText(text, maxWidth, scale).lines;
}
