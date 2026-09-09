import test from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/direction/index.mjs';

const stroke = (overrides = {}) => ({ type: 'stroke', layer: 'paint', color: '#253d38',
  points: [[10, 10], [400, 400]], size: 8, brush: 'brush', ...overrides });
const longStroke = () => stroke({ points: [[0, 0], [1000, 700]] });

test('progressive tick animates an active command partially, then commits it', () => {
  const session = new Session();
  session.submit({ commands: [longStroke()], play: true });
  assert.equal(session.status, 'playing');
  session.tick();
  assert.ok(session.active, 'first tick claims the command');
  assert.ok(session.active.progress > 0 && session.active.progress < 1, 'progress is partial');
  assert.equal(session.document.marks.length, 0, 'nothing committed while animating');
  session.tick(5000);
  assert.equal(session.active, null, 'active command completed');
  assert.equal(session.document.marks.length, 1, 'command committed on completion');
  assert.equal(session.status, 'idle', 'queue drained back to idle');
});

test('pause is sticky: a later submit with play:true stays paused', () => {
  const session = new Session();
  session.control('pause');
  session.submit({ commands: [stroke()], play: true });
  assert.equal(session.status, 'paused', 'explicit pause survives a play:true submit');
  assert.equal(session.pending().length, 1, 'commands still queue while paused');
});

test('feedback pauses playback and records the note with its cursor', () => {
  const session = new Session();
  session.submit({ commands: [stroke()], play: true });
  session.addFeedback('slow down here');
  assert.equal(session.status, 'paused', 'feedback interrupts the painter');
  assert.equal(session.feedback.length, 1);
  assert.equal(session.feedback[0].text, 'slow down here');
  assert.equal(session.feedback[0].cursor, 0);
});

test('step commits exactly one pending command and stays paused', () => {
  const session = new Session();
  session.submit({ commands: [stroke(), stroke({ points: [[100, 100], [200, 200]] })], play: false });
  session.control('step');
  assert.equal(session.document.marks.length, 1, 'exactly one command committed');
  assert.equal(session.pending().length, 1, 'one command remains queued');
  assert.equal(session.status, 'paused');
});

test('replace cancels old pending work but keeps already completed marks', () => {
  const session = new Session();
  session.submit({ commands: [stroke()], play: false });
  session.control('step');
  session.submit({ commands: [stroke(), stroke()], play: true });
  session.control('resume');
  session.tick();
  assert.ok(session.active, 'painter is mid-stroke');
  session.submit({ commands: [stroke({ points: [[500, 500], [900, 100]] })], replace: true });
  assert.equal(session.active, null, 'partial stroke canceled');
  assert.equal(session.pending().length, 1, 'queue holds only the replacement');
  assert.deepEqual(session.pending()[0].points, [[500, 500], [900, 100]]);
  assert.equal(session.document.marks.length, 1, 'earlier completed mark retained');
});

test('invalid submit rejects the whole batch atomically', () => {
  const session = new Session();
  session.submit({ commands: [stroke()], immediate: true });
  const before = session.snapshot();
  assert.throws(() => session.submit({ commands: [stroke(), { type: 'stroke', points: [] }] }),
    /Stroke needs 1–2000 points/);
  const after = session.snapshot();
  assert.deepEqual(after.playback, before.playback, 'queue and playback untouched');
  assert.equal(after.history.cursor, before.history.cursor, 'history untouched');
  assert.equal(after.document.marks.length, 1);
});

test('immediate submit commits everything at once and pauses', () => {
  const session = new Session();
  session.submit({ commands: [stroke(), stroke()], immediate: true });
  assert.equal(session.document.marks.length, 2, 'all commands committed instantly');
  assert.equal(session.pending().length, 0, 'nothing left queued');
  assert.equal(session.status, 'paused');
  assert.equal(session.active, null);
});

test('undo/redo moves the cursor and a saved project roundtrips into a new session', () => {
  const source = new Session();
  source.submit({ commands: [stroke(), stroke()], immediate: true });
  source.control('undo');
  assert.equal(source.document.marks.length, 1, 'undo reverts one mark');
  source.control('redo');
  assert.equal(source.document.marks.length, 2, 'redo restores the mark');
  source.addFeedback('ship it');
  const restored = new Session();
  restored.load(source.project());
  assert.deepEqual(restored.document, source.document);
  assert.equal(restored.history.cursor, 2);
  assert.deepEqual(restored.feedback.map(item => item.text), ['ship it']);
  assert.equal(restored.status, 'paused', 'loaded projects wait for the human');
});
