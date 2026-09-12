import test from 'node:test';
import assert from 'node:assert/strict';

import {
  designPoint,
  workspaceWidth,
  clampWorkspacePoint,
  clipRect,
} from '../src/studio/workspace/geometry/index.mjs';
import { createControls } from '../src/studio/workspace/controls/index.mjs';

// Plain-object stand-in for a positioned DOM element in Node tests.
function element(left, top, width, height) {
  return {
    getBoundingClientRect: () => ({ left, top, width, height }),
  };
}

class FakeDocument {
  constructor() {
    this.activeElement = null;
    this.listeners = new Map();
  }

  createElement(tag) {
    return new FakeElement(this, tag);
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  emit(type) {
    this.listeners.get(type)?.({ type });
  }
}

class FakeElement {
  constructor(ownerDocument, tag) {
    this.ownerDocument = ownerDocument;
    this.tagName = tag.toUpperCase();
    this.style = {};
    this.listeners = new Map();
    this.children = [];
    this.attributes = {};
    this.value = '';
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.disabled = false;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  emit(type, init = {}) {
    const event = {
      target: this,
      preventDefault() { this.defaultPrevented = true; },
      ...init,
    };
    this.listeners.get(type)?.(event);
    return event;
  }

  appendChild(child) {
    this.children.push(child);
    child.parentNode = this;
  }

  remove() {
    const index = this.parentNode?.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
  }

  focus() {
    this.ownerDocument.activeElement = this;
    this.emit('focus');
  }

  blur() {
    this.emit('blur');
    this.ownerDocument.activeElement = null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  setPointerCapture(pointerId) {
    this.captured = pointerId;
  }

  releasePointerCapture(pointerId) {
    this.released = pointerId;
  }
}

function descriptor(kind, extra = {}) {
  return {
    id: kind,
    kind,
    x: 10,
    y: 20,
    width: 100,
    height: 40,
    label: kind,
    action: `test.${kind}`,
    payload: { source: 'test' },
    value: kind === 'textarea' ? '' : 0,
    ...extra,
  };
}

function dependencyVector() {
  return {
    layout(text) {
      return { cells: [], lines: [String(text)], width: 0, height: 11, lineHeight: 11 };
    },
    measure() { return 8; },
  };
}

test('workspaceWidth is 740 expanded and 1000 collapsed', () => {
  assert.equal(workspaceWidth(false), 740);
  assert.equal(workspaceWidth(true), 1000);
  assert.equal(workspaceWidth(), 740);
});

test('designPoint maps identity at natural 1000x700 size', () => {
  const natural = element(0, 0, 1000, 700);
  assert.deepEqual(designPoint({ clientX: 0, clientY: 0 }, natural), [0, 0]);
  assert.deepEqual(designPoint({ clientX: 370, clientY: 350 }, natural), [370, 350]);
  assert.deepEqual(designPoint({ clientX: 1000, clientY: 700 }, natural), [1000, 700]);
});

test('designPoint maps uniformly scaled, offset overlays onto design units', () => {
  const doubled = element(120, 80, 2000, 1400);
  assert.deepEqual(designPoint({ clientX: 120, clientY: 80 }, doubled), [0, 0]);
  assert.deepEqual(designPoint({ clientX: 1120, clientY: 780 }, doubled), [500, 350]);
  assert.deepEqual(designPoint({ clientX: 2120, clientY: 1480 }, doubled), [1000, 700]);
});

test('designPoint leaves events outside the overlay unbounded', () => {
  const natural = element(0, 0, 1000, 700);
  assert.deepEqual(designPoint({ clientX: -50, clientY: -1 }, natural), [-50, -1]);
  assert.deepEqual(designPoint({ clientX: 1500, clientY: 900 }, natural), [1500, 900]);
});

test('designPoint accepts touch coordinates without clamping', () => {
  const scaled = element(10, 20, 2000, 1400);
  assert.deepEqual(
    designPoint({ touches: [{ clientX: 2010, clientY: 1420 }] }, scaled),
    [1000, 700],
  );
});

test('clampWorkspacePoint fences points to the expanded 740 canvas', () => {
  assert.deepEqual(clampWorkspacePoint([370, 350], false), [370, 350]);
  assert.deepEqual(clampWorkspacePoint([800, 100], false), [740, 100]);
  assert.deepEqual(clampWorkspacePoint([-5, 750], false), [0, 700]);
  assert.deepEqual(clampWorkspacePoint([800, 100]), [740, 100]);
});

test('clampWorkspacePoint fences points to the full 1000 canvas when collapsed', () => {
  assert.deepEqual(clampWorkspacePoint([999, 699], true), [999, 699]);
  assert.deepEqual(clampWorkspacePoint([1200, 10], true), [1000, 10]);
  assert.deepEqual(clampWorkspacePoint([500, -3], true), [500, 0]);
});

test('clipRect returns the intersection rect with x, y, width, height fields', () => {
  const canvas = { x: 0, y: 0, width: 740, height: 700 };
  assert.deepEqual(
    clipRect({ x: 700, y: 650, width: 100, height: 100 }, canvas),
    { x: 700, y: 650, width: 40, height: 50 },
  );
  assert.deepEqual(
    clipRect({ x: 10, y: 20, width: 30, height: 40 }, { x: 5, y: 10, width: 100, height: 100 }),
    { x: 10, y: 20, width: 30, height: 40 },
  );
});

test('clipRect returns null for disjoint and edge-touching rects', () => {
  const bounds = { x: 0, y: 0, width: 740, height: 700 };
  assert.equal(clipRect({ x: 800, y: 10, width: 50, height: 50 }, bounds), null);
  assert.equal(clipRect({ x: 10, y: 800, width: 50, height: 50 }, bounds), null);
  assert.equal(clipRect({ x: 740, y: 0, width: 50, height: 50 }, bounds), null);
  assert.equal(clipRect({ x: -50, y: 0, width: 50, height: 50 }, bounds), null);
});

test('controls keep semantic nodes stable and route payload values', () => {
  const document = new FakeDocument();
  const root = document.createElement('div');
  const calls = [];
  let changed = 0;
  const controls = createControls({
    root,
    dispatch: (action, value) => calls.push([action, value]),
    changed: () => { changed += 1; },
    point: (event) => event.raw,
    vector: dependencyVector(),
  });
  const descriptors = [
    descriptor('button', { value: 'go' }),
    descriptor('range', { id: 'vertical', axis: 'y', x: 90, y: 120, width: 20, height: 20, track: { y: 100, height: 100 }, min: 0, max: 100, step: 1 }),
    descriptor('textarea', { value: 'initial', placeholder: 'write' }),
    descriptor('plane', { x: 100, y: 100, width: 100, height: 100, value: { x: 0.5, y: 0.5 }, step: 0.1 }),
  ];
  controls.update(descriptors);
  const nodes = [...root.children];
  assert.deepEqual(nodes.map((node) => node.tagName), ['BUTTON', 'INPUT', 'TEXTAREA', 'BUTTON']);
  assert.match(nodes[0].style.cssText, /opacity:0/);
  assert.match(nodes[0].style.cssText, /font:0/);

  nodes[0].emit('click');
  nodes[1].emit('pointerdown', { pointerId: 4, raw: [0, 150] });
  nodes[1].emit('pointerup', { pointerId: 4, raw: [0, 150] });
  assert.deepEqual(calls.slice(0, 2), [
    ['test.button', { source: 'test', value: 'go' }],
    ['test.range', { source: 'test', value: 50 }],
  ]);

  controls.update(descriptors.map((item) => ({ ...item, ...(item.id === 'vertical' ? { value: 50 } : {}) })));
  assert.deepEqual([...root.children], nodes);
  assert.equal(controls.inputState('vertical').value, '50');

  nodes[3].emit('pointerdown', { pointerId: 8, raw: [125, 175] });
  nodes[3].emit('pointerup', { pointerId: 8, raw: [125, 175] });
  nodes[3].emit('keydown', { key: 'ArrowLeft' });
  assert.deepEqual(calls.at(-2), ['test.plane', { source: 'test', value: { x: 0.25, y: 0.75 } }]);
  assert.deepEqual(calls.at(-1), ['test.plane', { source: 'test', value: { x: 0.15, y: 0.75 } }]);

  nodes[2].focus();
  nodes[2].value = 'draft';
  nodes[2].selectionStart = 2;
  nodes[2].selectionEnd = 2;
  controls.update([descriptors[0], descriptors[1], { ...descriptors[2], value: 'server' }, descriptors[3]]);
  assert.equal(nodes[2].value, 'draft');
  assert.deepEqual(controls.inputState('textarea'), {
    descriptor: controls.inputState('textarea').descriptor,
    focused: true,
    value: 'draft',
    selectionStart: 2,
    selectionEnd: 2,
    selectionDirection: 'none',
  });
  nodes[2].emit('input');
  document.emit('selectionchange');
  assert.ok(changed > 0);
  controls.destroy();
  assert.equal(root.children.length, 0);
});

test('textarea drawing consumes vector layout cells and UTF-16 selection offsets', () => {
  const document = new FakeDocument();
  const root = document.createElement('div');
  const controls = createControls({ root, dispatch() {}, changed() {}, point: () => [0, 0], vector: dependencyVector() });
  controls.update([descriptor('textarea', { x: 20, y: 30, width: 40, height: 20, value: 'A😀' })]);
  const area = root.children[0];
  area.focus();
  area.value = 'A😀';
  area.selectionStart = 0;
  area.selectionEnd = 3;
  const calls = [];
  const vector = {
    layout(text, maxWidth, scale) {
      calls.push(['layout', text, maxWidth, scale]);
      return {
        cells: [{ char: 'A', x: 0, y: 0, start: 0, end: 1 }, { char: '😀', x: 8, y: 0, start: 1, end: 3 }],
        lines: ['A😀'], width: 16, height: 11, lineHeight: 11,
      };
    },
    measure() { return 8; },
    text(...args) { calls.push(['text', ...args]); },
    rect(...args) { calls.push(['rect', ...args]); },
    stroke(...args) { calls.push(['stroke', ...args]); },
  };
  const context = { save() {}, beginPath() {}, rect() {}, clip() {}, restore() {} };
  controls.draw(context, vector);
  assert.deepEqual(calls[0], ['layout', 'A😀', 32, 1]);
  assert.equal(calls.filter(([kind]) => kind === 'rect').length, 2);
  assert.equal(calls.filter(([kind]) => kind === 'text').length, 2);
  controls.destroy();
});
