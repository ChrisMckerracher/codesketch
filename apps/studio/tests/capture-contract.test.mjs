import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Session } from '../src/direction/index.mjs';

// Go capture reads this same wire data. Compare the complete snapshot so
// changes to Session normalization or playback representation surface here.
const fixture = JSON.parse(await readFile(new URL('../../../tests/fixtures/capture-contract.json', import.meta.url), 'utf8'));

// Setup mutations carry the observed control context; agent pause leaves the
// grant invalidated with no active grant.
const context = (session) => ({
  expectedDocGeneration: session.controlGrant.docGeneration,
  epoch: session.controlGrant.controlEpoch,
});

test('capture contract covers all six drawing command kinds', () => {
  assert.deepEqual(fixture.cases.map(item => item.name).sort(),
    ['ellipse', 'fill', 'layer.add', 'layer.update', 'rect', 'stroke']);
});

for (const item of fixture.cases) {
  test(`capture wire fixture matches an actual paused Session: ${item.name}`, () => {
    const session = new Session();
    session.submit({ commands: fixture.setup, immediate: true, ...context(session) });
    const committed = structuredClone(session.document);
    session.submit({ commands: [item.active.command], ...context(session) });
    session.control('resume', undefined, context(session));
    session.tick(fixture.tickMilliseconds);
    session.control('pause');

    const actual = JSON.parse(JSON.stringify(session.snapshot()));
    const expected = structuredClone(fixture.snapshot);
    expected.playback.active = item.active;
    // The control grant context rotates per session; the agent setup above
    // leaves it invalidated with no active grant and no comments recorded.
    assert.match(actual.instanceId, /^[\da-f-]{36}$/);
    expected.instanceId = actual.instanceId;
    assert.match(actual.docGeneration, /^[\da-f-]{36}$/);
    expected.docGeneration = actual.docGeneration;
    assert.ok(Number.isInteger(actual.controlEpoch) && actual.controlEpoch >= 1);
    expected.controlEpoch = actual.controlEpoch;
    expected.requiresGrant = true;
    expected.activeGrant = null;
    expected.comments = [];
    assert.deepEqual(actual, expected);
    assert.deepEqual(session.document, committed, 'active work leaves the committed document intact');

    session.control('step', undefined, { source: 'human' });
    assert.equal(session.active, null);
    assert.deepEqual(session.history.commands.at(-1), item.active.command);
  });
}
