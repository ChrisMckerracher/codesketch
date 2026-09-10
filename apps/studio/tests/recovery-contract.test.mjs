import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Session, validateRecovery, playbackDuration, validateProject } from '../src/direction/index.mjs';

const stroke = (overrides = {}) => ({ type: 'stroke', layer: 'paint', color: '#253d38',
  points: [[10, 10], [400, 400]], size: 8, brush: 'brush', ...overrides });
const grant = (session) => ({ expectedDocGeneration: session.controlGrant.docGeneration,
  epoch: session.controlGrant.controlEpoch, grantToken: session.controlGrant.activeGrant?.grantToken });
const envelope = (project, active, speed) => ({ format: 'codesketch-recovery', version: 1, project, active, speed });
const buildProject = (commands, cursor, queue) => validateProject({
  format: 'codesketch', version: 2, commands, cursor, queue, comments: [] });

describe('playbackDuration central formula', () => {
  test('applies the 120 ms floor to point-free and tiny commands', () => {
    assert.equal(playbackDuration({ type: 'fill', color: '#ffffff' }), 120);
    assert.equal(playbackDuration(stroke({ points: [[5, 5]] })), 120);
    assert.equal(playbackDuration(stroke({ points: [[0, 0], [3, 4]] })), 120);
  });

  test('derives Math.max(120, distance / 0.55) from point path length', () => {
    const command = stroke({ points: [[0, 0], [300, 400]] });
    assert.equal(playbackDuration(command), 500 / 0.55);
    assert.equal(playbackDuration(stroke({ points: [[0, 0], [300, 400], [300, 900]] })), 1000 / 0.55);
  });

  test('live ticks reuse the same duration', () => {
    const session = new Session();
    const command = stroke({ points: [[0, 0], [1000, 700]] });
    session.submit({ commands: [command], play: true, ...grant(session) });
    session.tick();
    assert.equal(session.active.duration, playbackDuration(command));
  });
});

describe('validateRecovery strict envelope', () => {
  test('accepts a live recovery snapshot and returns a normalized payload', () => {
    const session = new Session();
    session.submit({ commands: [stroke(), stroke({ points: [[20, 20], [30, 30]] })], play: true, ...grant(session) });
    session.tick();
    const recovered = validateRecovery(session.recovery());
    assert.equal(recovered.speed, session.speed);
    assert.deepEqual(recovered.active, { progress: session.active.progress });
    assert.deepEqual(recovered.project.queue[0], session.active.command);
    assert.equal(validateRecovery(envelope(buildProject([], 0, [stroke()]), { progress: 0 }, 0.25)).active.progress, 0);
    assert.equal(validateRecovery(envelope(buildProject([], 0, [stroke()]), null, 8)).active, null);
  });

  test('rejects unknown, missing, or non-object envelope shapes', () => {
    const base = envelope(buildProject([], 0, [stroke()]), null, 1);
    assert.throws(() => validateRecovery({ ...base, extra: 1 }), /exactly format, version, project, active, and speed/);
    for (const key of ['format', 'version', 'project', 'active', 'speed']) {
      const broken = { ...base };
      delete broken[key];
      assert.throws(() => validateRecovery(broken), /Invalid recovery/, `missing ${key}`);
    }
    assert.throws(() => validateRecovery([base]), /expected a recovery envelope object/);
    assert.throws(() => validateRecovery(null), /expected a recovery envelope object/);
    assert.throws(() => validateRecovery('codesketch-recovery'), /expected a recovery envelope object/);
  });

  test('rejects other formats and versions without migration', () => {
    const base = envelope(buildProject([], 0, [stroke()]), null, 1);
    assert.throws(() => validateRecovery({ ...base, format: 'codesketch' }), /unknown recovery format/);
    assert.throws(() => validateRecovery({ ...base, version: 0 }), /unsupported recovery version/);
    assert.throws(() => validateRecovery({ ...base, version: 2 }), /unsupported recovery version/);
  });

  test('active accepts only exactly { progress } finite in [0, 1) with a queued head', () => {
    const queued = buildProject([], 0, [stroke()]);
    assert.throws(() => validateRecovery(envelope(queued, { progress: 0.5, extra: 1 }, 1)), /exactly a progress field/);
    assert.throws(() => validateRecovery(envelope(queued, {}, 1)), /exactly a progress field/);
    assert.throws(() => validateRecovery(envelope(queued, [], 1)), /null or a progress object/);
    for (const progress of [1, 1.5, -0.5, NaN, Infinity, '0.5']) {
      assert.throws(() => validateRecovery(envelope(queued, { progress }, 1)), /finite number in \[0, 1\)/, `progress ${progress}`);
    }
    assert.throws(() => validateRecovery(envelope(buildProject([], 0, []), { progress: 0.5 }, 1)), /requires a queued command/);
  });

  test('speed must be finite within [0.25, 8]', () => {
    const base = envelope(buildProject([], 0, [stroke()]), null, 1);
    for (const speed of [0.2, 8.1, NaN, Infinity, '2']) {
      assert.throws(() => validateRecovery({ ...base, speed }), /speed must be between/, `speed ${speed}`);
    }
  });

  test('bounds the complete envelope to 8 MiB before structural checks', () => {
    const base = envelope(buildProject([], 0, [stroke()]), null, 1);
    const oversize = { ...base, pad: 'x'.repeat(8 * 1024 * 1024) };
    assert.throws(() => validateRecovery(oversize), /Recovery exceeds 8 MiB budget/);
  });

  test('retains nested v2 project validation', () => {
    const base = envelope(buildProject([], 0, [stroke()]), null, 1);
    assert.throws(() => validateRecovery({ ...base, project: { ...base.project, version: 1 } }), /v2 project/);
    assert.throws(() => validateRecovery({ ...base, project: { ...base.project, format: 'codesketch-recovery' } }), /v2 project/);
  });
});
