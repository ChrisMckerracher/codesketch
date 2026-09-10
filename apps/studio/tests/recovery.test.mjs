import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Session, validateProject, PROJECT_BUDGET_BYTES, MAX_IMPORT_BYTES } from '../src/direction/index.mjs';
import { normalizeComments } from '../src/direction/feedback/index.mjs';
import { attachPersistence, createStudio } from '../src/transport/index.mjs';

const conflict = (fn, message) => assert.throws(fn, (error) => {
  assert.equal(error.statusCode, 409, message);
  return true;
});
const grant = (session) => ({ expectedDocGeneration: session.controlGrant.docGeneration,
  epoch: session.controlGrant.controlEpoch, grantToken: session.controlGrant.activeGrant?.grantToken });

describe('recovery and bounded direction regressions', () => {
  test('raw imported poison is normalized and timer catch pauses/exposes error', async () => {
    const rawPoison = {
      format: 'codesketch',
      version: 2,
      commands: [{ type: 'stroke', points: [[10, 10], [20, 20]] }],
      cursor: 1,
      queue: [{ type: 'fill', color: '#ffffff', points: {} }],
      comments: [],
    };
    const cleaned = validateProject(rawPoison);
    assert.equal(cleaned.commands[0].brush, 'brush');
    assert.equal(cleaned.commands[0].layer, 'paint');
    assert.equal(cleaned.queue[0].points, undefined);

    const session = new Session();
    session.load(rawPoison, { source: 'human' });
    assert.equal(session.queue[0].points, undefined);
    assert.equal(session.status, 'paused');
    session.control('resume', 1, { source: 'human' });
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
    assert.deepEqual(await matchRes.json(), { unchanged: true, heartbeat: { lastSeenAt: null } });
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
    session.submit({ commands: batch, immediate: true, ...grant(session) });
    assert.equal(session.history.commands.length, 75);

    // Undo all to cursor 0
    for (let i = 0; i < 75; i++) session.control('undo', 1, { source: 'human' });
    assert.equal(session.history.cursor, 0);

    // Queueing same batch again would push retained history + queue over 7 MiB
    assert.throws(
      () => session.submit({ commands: batch, replace: false, source: 'human' }),
      /exceeds 7 MiB budget/
    );
    // Atomic rejection: queue remains empty, history intact
    assert.equal(session.queue.length, 0);
    assert.equal(session.history.commands.length, 75);

    // Format input > 8 MiB is rejected
    const hugeProject = {
      format: 'codesketch',
      version: 2,
      commands: [],
      cursor: 0,
      queue: [],
      comments: [],
      extraPadding: 'a'.repeat(MAX_IMPORT_BYTES + 10),
    };
    assert.throws(() => validateProject(hugeProject), /exceeds 8 MiB/);

    // Valid project under budget roundtrips cleanly
    const exported = session.project();
    const reimported = validateProject(exported);
    assert.equal(reimported.commands.length, 75);
    assert.equal(reimported.cursor, 0);
  });

  test('comment capacity and budget failures stay atomic on paused sessions', () => {
    const session = new Session();
    session.comments = normalizeComments(
      Array.from({ length: 100 }, (_, i) => ({ id: `id-${i}`, number: i + 1, seq: i + 1,
        text: `Note ${i}`, rect: null, status: 'open', cursor: 0, artRevision: 0,
        at: '2026-09-09T00:00:00Z', acknowledgedAt: null, addressedAt: null, resolvedAt: null,
        visibleLayers: [], request: null })));
    session.control('pause', 1, { source: 'human' });
    const before = structuredClone(session.snapshot());
    let changedNotified = false;
    session.onChange = () => { changedNotified = true; };

    assert.throws(() => session.addComment({ requestId: 'req-over-1', text: 'One too many', rect: null,
      expectedDocGeneration: session.controlGrant.docGeneration,
      expectedArtRevision: session.artRevision }), /At most 100/);
    assert.equal(session.status, 'paused');
    assert.equal(changedNotified, false, 'a failed comment never notifies');
    assert.deepEqual(session.snapshot(), before, 'a failed capacity add preserves the entire state');
    assert.equal(session.comments.length, 100);
    assert.equal(session.comments[0].text, 'Note 0');

    // Budget failure for a comment on a paused session is atomic: nothing moves
    const nearBudget = new Session();
    const largeStroke = {
      type: 'stroke',
      points: Array.from({ length: 2000 }, () => [123.12345678901234, 456.12345678901234]),
    };
    nearBudget.submit({ commands: Array.from({ length: 75 }, () => largeStroke),
      immediate: true, ...grant(nearBudget) });
    for (let i = 0; i < 75; i++) nearBudget.control('undo', 1, { source: 'human' });
    nearBudget.submit({ commands: Array.from({ length: 18 }, () => largeStroke), replace: false, source: 'human' });
    const room = PROJECT_BUDGET_BYTES -
      Buffer.byteLength(JSON.stringify(nearBudget.project()), 'utf8') - 500;
    nearBudget.submit({
      commands: [{ type: 'stroke',
        points: Array.from({ length: Math.floor(room / 39.05) }, () => [123.12345678901234, 456.12345678901234]) }],
      replace: false,
      source: 'human',
    });
    const budgetBefore = structuredClone(nearBudget.snapshot());
    let budgetNotified = false;
    nearBudget.onChange = () => { budgetNotified = true; };

    assert.throws(() => nearBudget.addComment({ requestId: 'req-big-1', text: 'y'.repeat(2000), rect: null,
      expectedDocGeneration: nearBudget.controlGrant.docGeneration,
      expectedArtRevision: nearBudget.artRevision }), /exceeds 7 MiB budget/);
    assert.equal(nearBudget.status, 'paused');
    assert.equal(budgetNotified, false, 'a budget failure never notifies');
    assert.deepEqual(nearBudget.snapshot(), budgetBefore, 'a budget failure preserves the entire state');
    assert.equal(nearBudget.comments.length, 0);

    // A comment cannot be added at all while the painter is playing
    const playing = new Session();
    playing.submit({ commands: [largeStroke], play: true, ...grant(playing) });
    assert.equal(playing.status, 'playing');
    const playingBefore = structuredClone(playing.snapshot());
    conflict(() => playing.addComment({ requestId: 'req-playing-1', text: 'too soon', rect: null,
      expectedDocGeneration: playing.controlGrant.docGeneration,
      expectedArtRevision: playing.artRevision }), 'comments cannot be added while playing');
    assert.deepEqual(playing.snapshot(), playingBefore, 'a rejected comment on a playing session mutates nothing');
  });

  test('persistence recover paused, size rejection, coalescing, and flush', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'codesketch-test-'));
    const file = join(dir, 'session.json');

    try {
      // 1. Recover paused with queued work from the strict recovery envelope
      const saved = {
        format: 'codesketch-recovery',
        version: 1,
        project: {
          format: 'codesketch',
          version: 2,
          commands: [],
          cursor: 0,
          queue: [{ type: 'fill', color: '#112233' }],
          comments: [],
        },
        active: null,
        speed: 1,
      };
      await writeFile(file, JSON.stringify(saved), 'utf8');

      const session1 = new Session();
      session1.status = 'playing';
      const { flush: restoreFlush } = await attachPersistence(session1, file);
      assert.equal(session1.status, 'paused');
      assert.equal(session1.queue.length, 1);
      assert.equal(session1.storageError, null);
      await restoreFlush();

      // 2. Oversized recovery rejects startup; the original file stays intact
      const oversizedFile = join(dir, 'oversized.json');
      const bigBuffer = Buffer.alloc(MAX_IMPORT_BYTES + 1024, 32);
      await writeFile(oversizedFile, bigBuffer);

      const session2 = new Session();
      await assert.rejects(attachPersistence(session2, oversizedFile), /exceeds 8 MiB limit/);
      assert.equal((await readFile(oversizedFile)).length, bigBuffer.length, 'oversized file is preserved');

      // 3. Coalescing and flush without lost writes
      const session3 = new Session();
      const { flush } = await attachPersistence(session3, file);
      for (let i = 0; i < 20; i++) {
        session3.addComment({ requestId: `req-coalesce-${i}`, text: `Coalesced ${i}`, rect: null,
          expectedDocGeneration: session3.controlGrant.docGeneration,
          expectedArtRevision: session3.artRevision });
      }
      await flush();
      const readBack = JSON.parse(await readFile(file, 'utf8'));
      assert.equal(readBack.format, 'codesketch-recovery', 'persisted snapshots use the recovery envelope');
      assert.equal(readBack.version, 1);
      assert.equal(readBack.project.version, 2, 'the nested project stays v2');
      assert.equal(readBack.project.comments.length, 20);
      assert.equal(readBack.project.comments[19].text, 'Coalesced 19');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
