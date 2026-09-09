import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Session, validateProject, PROJECT_BUDGET_BYTES, MAX_IMPORT_BYTES } from '../src/direction/index.mjs';
import { attachPersistence, createStudio } from '../src/transport/index.mjs';

describe('recovery and bounded direction regressions', () => {
  test('raw imported poison is normalized and timer catch pauses/exposes error', async () => {
    const rawPoison = {
      format: 'codesketch',
      version: 1,
      commands: [{ type: 'stroke', points: [[10, 10], [20, 20]] }],
      cursor: 1,
      queue: [{ type: 'fill', color: '#ffffff', points: {} }],
    };
    const cleaned = validateProject(rawPoison);
    assert.equal(cleaned.commands[0].brush, 'brush');
    assert.equal(cleaned.commands[0].layer, 'paint');
    assert.equal(cleaned.queue[0].points, undefined);

    const session = new Session();
    session.load(rawPoison);
    assert.equal(session.queue[0].points, undefined);
    assert.equal(session.status, 'paused');
    session.control('resume');
    assert.equal(session.status, 'playing');
    session.tick(120);
    assert.equal(session.history.commands.length, 2);
    assert.equal(session.history.commands[1].type, 'fill');

    // Timer catch in studio server: tick failure pauses and exposes error as playbackError without crashing process
    const { server, session: studioSession } = await createStudio();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    assert.ok(studioSession.instanceId, 'session has instanceId UUID');
    assert.equal(studioSession.snapshot().instanceId, studioSession.instanceId);
    assert.equal('instanceId' in studioSession.project(), false, 'instanceId is runtime-only, not in project');

    // GET /api/state: unchanged only when both since AND instanceId match
    const matchRes = await fetch(`http://127.0.0.1:${port}/api/state?since=0&instanceId=${studioSession.instanceId}`);
    assert.deepEqual(await matchRes.json(), { unchanged: true });
    const missingInstRes = await fetch(`http://127.0.0.1:${port}/api/state?since=0`);
    assert.equal((await missingInstRes.json()).unchanged, undefined);
    const wrongInstRes = await fetch(`http://127.0.0.1:${port}/api/state?since=0&instanceId=wrong-id`);
    assert.equal((await wrongInstRes.json()).unchanged, undefined);

    studioSession.status = 'playing';
    studioSession.tick = () => { throw new Error('Simulated playback fault'); };
    await new Promise(resolve => setTimeout(resolve, 60));
    assert.equal(studioSession.status, 'paused');
    assert.equal(studioSession.playbackError, 'Simulated playback fault');
    assert.equal(studioSession.snapshot().playbackError, 'Simulated playback fault');
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
  });

  test('byte budget atomic rejection and roundtrip', () => {
    const stroke = {
      type: 'stroke',
      points: Array.from({ length: 2000 }, () => [123.12345678901234, 456.12345678901234]),
    };
    const batch = Array.from({ length: 75 }, () => stroke);
    const session = new Session();
    session.submit({ commands: batch, immediate: true });
    assert.equal(session.history.commands.length, 75);

    // Undo all to cursor 0
    for (let i = 0; i < 75; i++) session.control('undo');
    assert.equal(session.history.cursor, 0);

    // Queueing same batch again would push retained history + queue over 7 MiB
    assert.throws(
      () => session.submit({ commands: batch, replace: false }),
      /exceeds 7 MiB budget/
    );
    // Atomic rejection: queue remains empty, history intact
    assert.equal(session.queue.length, 0);
    assert.equal(session.history.commands.length, 75);

    // Format input > 8 MiB is rejected
    const hugeProject = {
      format: 'codesketch',
      version: 1,
      commands: [],
      cursor: 0,
      queue: [],
      feedback: [{ id: 'f1', text: 'x'.repeat(2000), at: '2026-09-09T00:00:00Z', cursor: 0 }],
      extraPadding: 'a'.repeat(MAX_IMPORT_BYTES + 10),
    };
    assert.throws(() => validateProject(hugeProject), /exceeds 8 MiB/);

    // Valid project under budget roundtrips cleanly
    const exported = session.project();
    const reimported = validateProject(exported);
    assert.equal(reimported.commands.length, 75);
    assert.equal(reimported.cursor, 0);
  });

  test('feedback capacity pause and budget failure pause', () => {
    const session = new Session();
    for (let i = 0; i < 100; i++) {
      session.feedback.push({ id: `id-${i}`, text: `Note ${i}`, at: '2026-09-09T00:00:00Z', cursor: 0 });
    }
    session.status = 'playing';
    let changedNotified = false;
    session.onChange = () => { changedNotified = true; };

    // At capacity (100), adding feedback pauses, notifies, preserves notes, and rejects
    assert.throws(() => session.addFeedback('One too many'), /Feedback limit reached/);
    assert.equal(session.status, 'paused');
    assert.equal(changedNotified, true);
    assert.equal(session.feedback.length, 100);
    assert.equal(session.feedback[0].text, 'Note 0');

    // Budget failure for feedback also pauses and preserves notes
    const nearBudget = new Session();
    const largeStroke = {
      type: 'stroke',
      points: Array.from({ length: 2000 }, () => [123.12345678901234, 456.12345678901234]),
    };
    nearBudget.submit({ commands: Array.from({ length: 75 }, () => largeStroke), immediate: true });
    for (let i = 0; i < 75; i++) nearBudget.control('undo');
    nearBudget.submit({ commands: Array.from({ length: 18 }, () => largeStroke), replace: false });
    const pts = Math.floor((PROJECT_BUDGET_BYTES - Buffer.byteLength(JSON.stringify(nearBudget.project()), 'utf8') - 500) / 39.05);
    nearBudget.submit({
      commands: [{ type: 'stroke', points: Array.from({ length: pts }, () => [123.12345678901234, 456.12345678901234]) }],
      replace: false,
    });
    const noteCount = nearBudget.feedback.length;
    nearBudget.status = 'playing';
    let budgetChanged = false;
    nearBudget.onChange = () => { budgetChanged = true; };

    assert.throws(() => nearBudget.addFeedback('y'.repeat(2000)), /exceeds 7 MiB budget/);
    assert.equal(nearBudget.status, 'paused');
    assert.equal(budgetChanged, true);
    assert.equal(nearBudget.feedback.length, noteCount);
  });

  test('persistence recover paused, size rejection, coalescing, and flush', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'codesketch-test-'));
    const file = join(dir, 'session.json');

    try {
      // 1. Recover paused with queued work
      const saved = {
        format: 'codesketch',
        version: 1,
        commands: [],
        cursor: 0,
        queue: [{ type: 'fill', color: '#112233' }],
        feedback: [],
      };
      await writeFile(file, JSON.stringify(saved), 'utf8');

      const session1 = new Session();
      session1.status = 'playing';
      await attachPersistence(session1, file);
      assert.equal(session1.status, 'paused');
      assert.equal(session1.queue.length, 1);
      assert.equal(session1.storageError, null);

      // 2. Recovery size rejection (> 8 MiB)
      const oversizedFile = join(dir, 'oversized.json');
      const bigBuffer = Buffer.alloc(MAX_IMPORT_BYTES + 1024, 32);
      await writeFile(oversizedFile, bigBuffer);

      const session2 = new Session();
      await attachPersistence(session2, oversizedFile);
      assert.match(session2.storageError, /exceeds 8 MiB limit/);

      // 3. Coalescing and flush without lost writes
      const session3 = new Session();
      const flush = await attachPersistence(session3, file);
      for (let i = 0; i < 20; i++) {
        session3.addFeedback(`Coalesced ${i}`);
      }
      await flush();
      const readBack = JSON.parse(await readFile(file, 'utf8'));
      assert.equal(readBack.feedback.length, 20);
      assert.equal(readBack.feedback[19].text, 'Coalesced 19');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
