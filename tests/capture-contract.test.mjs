import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Session } from '../src/direction/index.mjs';

// Go capture reads this same wire data. Compare the complete snapshot so
// changes to Session normalization or playback representation surface here.
const fixture = JSON.parse(await readFile(new URL('./fixtures/capture-contract.json', import.meta.url), 'utf8'));

test('capture contract covers all six drawing command kinds', () => {
  assert.deepEqual(fixture.cases.map(item => item.name).sort(),
    ['ellipse', 'fill', 'layer.add', 'layer.update', 'rect', 'stroke']);
});

for (const item of fixture.cases) {
  test(`capture wire fixture matches an actual paused Session: ${item.name}`, () => {
    const session = new Session();
    session.instanceId = fixture.snapshot.instanceId;
    session.submit({ commands: fixture.setup, immediate: true });
    const committed = structuredClone(session.document);
    session.submit({ commands: [item.active.command] });
    session.control('resume');
    session.tick(fixture.tickMilliseconds);
    session.control('pause');

    const expected = structuredClone(fixture.snapshot);
    expected.playback.active = item.active;
    assert.deepEqual(JSON.parse(JSON.stringify(session.snapshot())), expected);
    assert.deepEqual(session.document, committed, 'active work leaves the committed document intact');

    session.control('step');
    assert.equal(session.active, null);
    assert.deepEqual(session.history.commands.at(-1), item.active.command);
  });
}
