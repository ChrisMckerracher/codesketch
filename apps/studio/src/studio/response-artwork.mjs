const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 700;
const MAX_POINTS = 2000;
const IDENTIFIER = /^[a-zA-Z][\w-]{0,39}$/;
const HEX_COLOR = /^#[\da-f]{6}$/i;
const BRUSHES = new Set(['brush', 'pencil', 'marker', 'eraser']);
const DRAWING_TYPES = new Set(['stroke', 'rect', 'ellipse']);

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isNonemptyString = (value) => typeof value === 'string' && value.length > 0;
const isUnitFraction = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const inRange = (value, min, max) => isFiniteNumber(value) && value >= min && value <= max;

const expect = (condition, message) => (condition ? null : message);
const firstProblem = (...problems) => problems.find(Boolean) || null;

export function documentProblem(document) {
  if (!isObject(document)) return 'document must be an object';
  const layers = Array.isArray(document.layers)
    ? firstProblem(...document.layers.map((layer, index) => layerProblem(layer, `document.layers[${index}]`)))
    : 'document.layers must be an array';
  const marks = Array.isArray(document.marks) ? marksProblem(document.marks) : 'document.marks must be an array';
  return firstProblem(
    expect(document.version === 1, 'document.version must be 1'),
    expect(document.width === CANVAS_WIDTH && document.height === CANVAS_HEIGHT, 'document dimensions must be 1000x700'),
    expect(typeof document.background === 'string' && HEX_COLOR.test(document.background), 'document.background must be a six-digit hex color'),
    layers,
    marks,
  );
}

export function activeProblem(active) {
  if (active === null) return null;
  if (!isObject(active)) return 'playback.active must be null or an object';
  return firstProblem(
    commandProblem(active.command, 'playback.active.command'),
    expect(isUnitFraction(active.progress), 'playback.active.progress must be a number from 0 to 1'),
  );
}

export function commandsProblem(commands, label) {
  return firstProblem(...commands.map((command, index) => commandProblem(command, `${label}[${index}]`)));
}

function layerProblem(layer, label) {
  if (!isObject(layer)) return `${label} must be an object`;
  return firstProblem(
    expect(isNonemptyString(layer.id), `${label}.id must be a nonempty string`),
    expect(typeof layer.name === 'string', `${label}.name must be a string`),
    expect(typeof layer.visible === 'boolean', `${label}.visible must be a boolean`),
    expect(isUnitFraction(layer.opacity), `${label}.opacity must be a number from 0 to 1`),
  );
}

function colorProblem(value, label) {
  return expect(typeof value === 'string' && HEX_COLOR.test(value), `${label} must be a #rrggbb color`);
}

function nameProblem(value, label) {
  return expect(typeof value === 'string' && value.trim() && value.length <= 80, `${label} must be a nonempty string`);
}

function identifierProblem(value, label) {
  return expect(typeof value === 'string' && IDENTIFIER.test(value), `${label} must be a layer identifier`);
}

function pointsProblem(points, label) {
  if (!Array.isArray(points)) return null;
  return firstProblem(...points.map((point, index) => {
    const name = `${label}.points[${index}]`;
    if (!Array.isArray(point) || point.length !== 2) return `${name} must be an [x,y] pair`;
    return firstProblem(
      expect(inRange(point[0], 0, CANVAS_WIDTH), `${name}.x must be within the canvas`),
      expect(inRange(point[1], 0, CANVAS_HEIGHT), `${name}.y must be within the canvas`),
    );
  }));
}

function strokeProblem(command, label) {
  const points = command.points;
  return firstProblem(
    identifierProblem(command.layer, `${label}.layer`),
    colorProblem(command.color, `${label}.color`),
    expect(isUnitFraction(command.opacity), `${label}.opacity must be a number from 0 to 1`),
    expect(Array.isArray(points) && points.length >= 1 && points.length <= MAX_POINTS, `${label}.points must hold 1-2000 [x,y] pairs`),
    pointsProblem(points, label),
    expect(inRange(command.size, 1, 100), `${label}.size must be a number from 1 to 100`),
    expect(typeof command.brush === 'string' && BRUSHES.has(command.brush), `${label}.brush must be brush, pencil, marker, or eraser`),
  );
}

function shapeProblem(command, label) {
  return firstProblem(
    identifierProblem(command.layer, `${label}.layer`),
    colorProblem(command.color, `${label}.color`),
    expect(isUnitFraction(command.opacity), `${label}.opacity must be a number from 0 to 1`),
    expect(inRange(command.x, 0, CANVAS_WIDTH), `${label}.x must be within the canvas`),
    expect(inRange(command.y, 0, CANVAS_HEIGHT), `${label}.y must be within the canvas`),
    expect(inRange(command.width, 1, CANVAS_WIDTH), `${label}.width must be a positive canvas dimension`),
    expect(inRange(command.height, 1, CANVAS_HEIGHT), `${label}.height must be a positive canvas dimension`),
    expect(isFiniteNumber(command.x) && isFiniteNumber(command.width) && command.x + command.width <= CANVAS_WIDTH, `${label} shape must fit the canvas`),
    expect(isFiniteNumber(command.y) && isFiniteNumber(command.height) && command.y + command.height <= CANVAS_HEIGHT, `${label} shape must fit the canvas`),
  );
}

function commandProblem(command, label) {
  if (!isObject(command)) return `${label} must be an object`;
  if (command.type === 'stroke') return strokeProblem(command, label);
  if (command.type === 'rect' || command.type === 'ellipse') return shapeProblem(command, label);
  if (command.type === 'fill') return colorProblem(command.color, `${label}.color`);
  if (command.type === 'layer.add') {
    return firstProblem(identifierProblem(command.id, `${label}.id`), nameProblem(command.name, `${label}.name`));
  }
  if (command.type === 'layer.update') {
    return firstProblem(
      identifierProblem(command.id, `${label}.id`),
      command.name === undefined ? null : nameProblem(command.name, `${label}.name`),
      command.opacity === undefined ? null : expect(isUnitFraction(command.opacity), `${label}.opacity must be a number from 0 to 1`),
      command.visible === undefined ? null : expect(typeof command.visible === 'boolean', `${label}.visible must be a boolean`),
    );
  }
  return `${label}.type must be a current command type`;
}

function marksProblem(marks) {
  return firstProblem(...marks.map((mark, index) => {
    const name = `document.marks[${index}]`;
    if (!isObject(mark)) return `${name} must be an object`;
    if (!DRAWING_TYPES.has(mark.type)) return `${name}.type must be stroke, rect, or ellipse`;
    return commandProblem(mark, name);
  }));
}
