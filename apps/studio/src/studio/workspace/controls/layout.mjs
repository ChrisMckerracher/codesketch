// Textarea geometry consumes the current vector layout directly. The vector
// owner is the only authority for glyph positions and wrapping.

export function layoutText(v, text, maxWidth, scale = 1, singleLine = false) {
  if (typeof v?.layout !== "function") throw new TypeError("controls require vector.layout");
  const result = v.layout(String(text), singleLine ? Infinity : maxWidth, scale);
  if (!validLayout(result)) throw new TypeError("vector.layout returned an invalid layout");
  return result;
}

export function cellWidth(v, cells, index, scale = 1) {
  const cell = cells[index];
  const next = cells[index + 1];
  if (next && sameLine(cell, next) && next.x > cell.x) return next.x - cell.x;
  if (typeof v?.measure !== "function") throw new TypeError("controls require vector.measure");
  const width = v.measure(cell.char, scale);
  if (!Number.isFinite(width) || width <= 0) throw new TypeError("vector.measure returned an invalid width");
  return width;
}

export function caretPosition(v, text, layout, offset, scale = 1) {
  const value = String(text);
  const cells = orderedCells(layout);
  return caretFromCells(v, value, layout, cells, sourceBreaks(value), offset, scale);
}

// Resolves a design-space text point to a native UTF-16 selection offset.
// Empty visual lines are resolved through the same caret boundaries as paint.
export function offsetAtPoint(v, text, layout, x, y, scale = 1) {
  const value = String(text);
  const cells = orderedCells(layout);
  const breaks = sourceBreaks(value);
  const boundaries = [];
  for (let offset = 0; offset <= value.length; offset += 1) {
    boundaries.push({ offset, ...caretFromCells(v, value, layout, cells, breaks, offset, scale) });
  }
  const lineYs = unique([...cells.map((cell) => cell.y), ...boundaries.map((item) => item.y)]);
  const targetY = finite(y, 0);
  const lineY = lineAtPoint(lineYs, targetY, scale);
  const lineCells = cells.filter((cell) => Math.abs(cell.y - lineY) < 0.001);
  const targetX = finite(x, 0);

  if (lineCells.length > 0) {
    for (const cell of lineCells) {
      const index = cells.indexOf(cell);
      const width = cellWidth(v, cells, index, scale);
      if (targetX < cell.x + width / 2) return cell.start;
    }
    return lineCells.at(-1).end;
  }

  const lineBoundaries = boundaries.filter((item) => Math.abs(item.y - lineY) < 0.001);
  return lineBoundaries.reduce((best, candidate) =>
    Math.abs(candidate.x - targetX) < Math.abs(best.x - targetX) ? candidate : best,
  lineBoundaries[0] ?? { offset: 0 }).offset;
}

function lineAtPoint(lineYs, targetY, scale) {
  const glyphHeight = 7 * scale;
  const visible = lineYs.find((lineY) => targetY >= lineY && targetY <= lineY + glyphHeight);
  if (visible != null) return visible;
  return lineYs.reduce((best, candidate) =>
    bandDistance(candidate, targetY, glyphHeight) < bandDistance(best, targetY, glyphHeight)
      ? candidate : best, lineYs[0] ?? 0);
}

function bandDistance(lineY, targetY, glyphHeight) {
  return targetY < lineY ? lineY - targetY : Math.max(targetY - (lineY + glyphHeight), 0);
}

function caretFromCells(v, text, layout, cells, breaks, offset, scale) {
  const at = clamp(Number(offset) || 0, 0, text.length);
  const containing = cells.find((cell) => at >= cell.start && at < cell.end);
  if (containing) return { x: containing.x, y: containing.y };

  const previousIndex = lastIndex(cells, (cell) => cell.end <= at);
  const previous = previousIndex >= 0 ? cells[previousIndex] : null;
  const next = cells.find((cell) => cell.start >= at);
  const gapStart = previous?.end ?? 0;
  const gapEnd = next?.start ?? text.length;
  const gapBreaks = breaks.filter((item) => item.start >= gapStart && item.start < gapEnd);
  const breakAt = gapBreaks.find((item) => item.start === at);
  if (breakAt) return beforeBreak(v, cells, previous, previousIndex, gapBreaks, at, next, layout, scale);

  const crossed = gapBreaks.filter((item) => item.start < at);
  if (crossed.length > 0) {
    const remaining = gapBreaks.filter((item) => item.start >= at).length;
    return { x: 0, y: next ? next.y - remaining * layout.lineHeight : (previous?.y ?? 0) + crossed.length * layout.lineHeight };
  }
  if (next) return { x: next.x, y: next.y };
  if (previous) return afterCell(v, cells, previous, previousIndex, scale);
  return { x: 0, y: 0 };
}

function beforeBreak(v, cells, previous, previousIndex, breaks, at, next, layout, scale) {
  const prior = breaks.filter((item) => item.start < at).length;
  if (prior === 0 && previous) return afterCell(v, cells, previous, previousIndex, scale);
  const remaining = breaks.filter((item) => item.start >= at).length;
  return { x: 0, y: next ? next.y - remaining * layout.lineHeight : (previous?.y ?? 0) + prior * layout.lineHeight };
}

function afterCell(v, cells, cell, index, scale) {
  return { x: cell.x + cellWidth(v, cells, index, scale), y: cell.y };
}

function sourceBreaks(text) {
  const breaks = [];
  for (let index = 0; index < text.length;) {
    const char = text[index];
    if (char === "\r") {
      const end = text[index + 1] === "\n" ? index + 2 : index + 1;
      breaks.push({ start: index, end });
      index = end;
    } else if (char === "\n" || char === "\u2028" || char === "\u2029") {
      breaks.push({ start: index, end: index + 1 });
      index += 1;
    } else {
      index += String.fromCodePoint(text.codePointAt(index)).length;
    }
  }
  return breaks;
}

function orderedCells(layout) {
  return [...layout.cells].sort((first, second) =>
    first.y - second.y || first.x - second.x || first.start - second.start || first.end - second.end);
}

function validLayout(result) {
  return Boolean(result) && Array.isArray(result.cells) && Array.isArray(result.lines) &&
    Number.isFinite(result.width) && Number.isFinite(result.height) && Number.isFinite(result.lineHeight) &&
    result.lineHeight > 0 && result.cells.every(validCell);
}

function validCell(cell) {
  return Boolean(cell) && typeof cell.char === "string" && Number.isFinite(cell.x) && Number.isFinite(cell.y) &&
    Number.isSafeInteger(cell.start) && Number.isSafeInteger(cell.end) && cell.start >= 0 && cell.end >= cell.start;
}

function lastIndex(items, predicate) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return index;
  }
  return -1;
}

function sameLine(first, second) {
  return Math.abs(first.y - second.y) < 0.001;
}

function unique(values) {
  return [...new Set(values.filter(Number.isFinite))].sort((first, second) => first - second);
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
