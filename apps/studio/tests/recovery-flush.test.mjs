import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, chmod, symlink, readdir, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Session } from '../src/direction/index.mjs';
import { attachPersistence, createStudio } from '../src/transport/index.mjs';

const grant = (session) => ({ expectedDocGeneration: session.controlGrant.docGeneration,
  epoch: session.controlGrant.controlEpoch, grantToken: session.controlGrant.activeGrant?.grantToken });
const context = async (port) => {
  const state = await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
  return { expectedDocGeneration: state.docGeneration, epoch: state.controlEpoch,
    grantToken: state.activeGrant?.grantToken };
};
const project = { format: 'codesketch', version: 2, commands: [], cursor: 0, queue: [], comments: [] };

describe('recovery flush and strict envelope persistence', () => {
  test('restores exact partial preview, history, queue and speed from a strict snapshot', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'codesketch-flush-'));
    const file = join(dir, 'session.json');
    try {
      const donor = new Session();
      donor.submit({ commands: [{ type: 'stroke', points: [[0, 0], [100, 0]] },
        { type: 'fill', color: '#112233' }, { type: 'stroke', points: [[100, 0], [100, 100]] }],
        immediate: true, ...grant(donor) });
      donor.control('undo', undefined, { source: 'human' });
      donor.submit({ commands: [{ type: 'fill', color: '#445566' }, { type: 'stroke', points: [[5, 5], [50, 50]] }],
        replace: false, play: false, source: 'human' });
      donor.control('speed', 2.5, { source: 'human' });
      donor.control('resume', undefined, { source: 'human' });
      assert.equal(donor.status, 'playing');
      donor.tick(1);
      const duration = donor.active.duration;
      donor.tick(Math.floor(duration * 0.4 / 2.5));
      assert.ok(donor.active && donor.active.progress > 0.1 && donor.active.progress < 0.9, 'donor holds partial preview');
      await writeFile(file, JSON.stringify(donor.recovery()), 'utf8');

      const restored = new Session();
      const { flush } = await attachPersistence(restored, file);
      assert.equal(restored.status, 'paused', 'recovery always restores paused');
      assert.equal(restored.speed, 2.5);
      assert.equal(restored.history.commands.length, 3);
      assert.equal(restored.history.cursor, 2, 'history cursor restored exactly');
      assert.deepEqual(restored.active.command, donor.active.command, 'preview command restored exactly');
      assert.equal(restored.active.progress, donor.active.progress, 'partial progress restored exactly');
      assert.equal(restored.active.duration, duration, 'duration derives from the playback formula');
      assert.deepEqual(restored.queue, donor.queue, 'remaining queue drops the consumed head exactly once');
      assert.equal(restored.controlGrant.activeGrant, null, 'execution grants stay revoked');
      assert.equal(restored.snapshot().playback.active.progress, donor.active.progress);
      await flush();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('malformed, foreign-format and stale-version files reject startup and stay preserved', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'codesketch-flush-'));
    const file = join(dir, 'session.json');
    const cases = [
      ['malformed JSON', '{"format": "codesketch-recovery"'],
      ['plain project without a wrapper', JSON.stringify(project)],
      ['stale envelope version', JSON.stringify({ format: 'codesketch-recovery', version: 2, project, active: null, speed: 1 })],
      ['unknown envelope field', JSON.stringify({ format: 'codesketch-recovery', version: 1, project, active: null, speed: 1, extra: true })],
    ];
    try {
      for (const [label, body] of cases) {
        await writeFile(file, body, 'utf8');
        await assert.rejects(createStudio({ persistence: file }), /Recovery failed/, `${label} must fail startup`);
        assert.equal(await readFile(file, 'utf8'), body, `${label} file is preserved`);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('explicit flush failure rejects while the prior recovery file remains', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'codesketch-flush-'));
    const file = join(dir, 'session.json');
    try {
      const session = new Session();
      const { flush } = await attachPersistence(session, file);
      await flush();
      const prior = await readFile(file, 'utf8');
      const revisionBefore = session.revision;
      await chmod(dir, 0o555);
      try {
        await assert.rejects(flush(), /EACCES/, 'explicit flush must reject on write failure');
        assert.match(session.storageError, /Local recovery could not be saved/,
          'an explicit failure also surfaces through storageError');
        assert.equal(session.revision, revisionBefore + 1, 'the failure bumps the visible revision');
        assert.equal(await readFile(file, 'utf8'), prior, 'the prior recovery file is untouched');
      } finally {
        await chmod(dir, 0o700);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('newest snapshot wins when writes queue behind each other', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'codesketch-flush-'));
    const file = join(dir, 'session.json');
    try {
      const session = new Session();
      const { flush } = await attachPersistence(session, file);
      session.control('pause', undefined, { source: 'human' });
      const comment = (requestId, text) => session.addComment({ requestId, text, rect: null,
        expectedDocGeneration: session.controlGrant.docGeneration, expectedArtRevision: session.artRevision,
        expectedControlEpoch: session.controlGrant.controlEpoch });
      comment('req-queued-1', 'oldest');
      const first = flush();
      comment('req-queued-2', 'newest');
      await flush();
      await first;
      const readBack = JSON.parse(await readFile(file, 'utf8'));
      assert.deepEqual(readBack.project.comments.map(item => item.text), ['oldest', 'newest'],
        'the last enqueued snapshot is the one on disk');
      for (let i = 0; i < 5; i++) comment(`req-burst-${i}`, `burst ${i}`);
      await flush();
      const afterBurst = JSON.parse(await readFile(file, 'utf8'));
      assert.equal(afterBurst.project.comments.length, 7, 'a rapid background burst keeps the latest state');
      assert.equal(afterBurst.project.comments.at(-1).text, 'burst 4');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('explicit flush serialization failures reject and surface the storage error', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'codesketch-flush-'));
    const file = join(dir, 'session.json');
    try {
      const session = new Session();
      const { flush } = await attachPersistence(session, file);
      const revisionBefore = session.revision;
      const recovery = session.recovery.bind(session);
      session.recovery = () => { const value = {}; value.self = value; return value; };
      await assert.rejects(flush(), /circular structure/i, 'serialization failure rejects the flush');
      assert.match(session.storageError, /Local recovery could not be saved/,
        'serialization failure surfaces through storageError');
      assert.equal(session.revision, revisionBefore + 1);
      session.recovery = recovery;
      await flush();
      assert.equal(session.storageError, null, 'a healthy later write clears the error');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('a stale temp symlink is never followed while recovery still publishes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'codesketch-flush-'));
    const file = join(dir, 'session.json');
    const victim = join(dir, 'victim.out');
    try {
      await writeFile(victim, 'victim-sentinel', 'utf8');
      await symlink(victim, `${file}.tmp`);
      const session = new Session();
      const { flush } = await attachPersistence(session, file);
      await flush();
      assert.equal(await readFile(victim, 'utf8'), 'victim-sentinel', 'the symlink target is never written through');
      const readBack = JSON.parse(await readFile(file, 'utf8'));
      assert.equal(readBack.format, 'codesketch-recovery', 'recovery still publishes atomically');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('failed write or sync cleans up its owned temp and preserves the prior file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'codesketch-flush-'));
    const file = join(dir, 'session.json');
    const probe = await open(join(dir, 'probe'), 'w');
    const handles = Object.getPrototypeOf(probe);
    await probe.close();
    try {
      const session = new Session();
      const { flush } = await attachPersistence(session, file);
      await flush();
      const prior = await readFile(file, 'utf8');
      const leftovers = async () => (await readdir(dir)).filter(name => name.includes('.tmp'));
      const writeFileFault = handles.writeFile;
      handles.writeFile = async function fault() { throw new Error('injected write fault'); };
      try {
        await assert.rejects(flush(), /injected write fault/);
      } finally {
        handles.writeFile = writeFileFault;
      }
      assert.deepEqual(await leftovers(), [], 'a failed write leaves no owned temp');
      const syncFault = handles.sync;
      handles.sync = async function fault() { throw new Error('injected sync fault'); };
      try {
        await assert.rejects(flush(), /injected sync fault/);
      } finally {
        handles.sync = syncFault;
      }
      assert.deepEqual(await leftovers(), [], 'a failed sync leaves no owned temp');
      assert.equal(await readFile(file, 'utf8'), prior, 'prior recovery bytes are preserved');
      assert.match(session.storageError, /Local recovery could not be saved/);
      await flush();
      assert.equal(session.storageError, null, 'a healthy write recovers persistence');
      assert.match(await readFile(file, 'utf8'), /codesketch-recovery/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('a later successful write clears storageError and recovers persistence', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'codesketch-flush-'));
    const file = join(dir, 'session.json');
    try {
      const seed = new Session();
      const { flush: seedFlush } = await attachPersistence(seed, file);
      await seedFlush();
      const session = new Session();
      const { flush } = await attachPersistence(session, file);
      await flush();
      await chmod(dir, 0o555);
      session.addComment({ requestId: 'req-blocked', text: 'blocked', rect: null,
        expectedDocGeneration: session.controlGrant.docGeneration, expectedArtRevision: session.artRevision,
        expectedControlEpoch: session.controlGrant.controlEpoch });
      await new Promise(resolve => setTimeout(resolve, 50));
      assert.match(session.storageError, /Local recovery could not be saved/);
      await chmod(dir, 0o700);
      await flush();
      assert.equal(session.storageError, null, 'a successful retry clears the storage error');
      const readBack = JSON.parse(await readFile(file, 'utf8'));
      assert.ok(readBack.project.comments.some(item => item.text === 'blocked'), 'the retried write landed');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('failed domain requests never touch the recovery file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'codesketch-flush-'));
    const file = join(dir, 'session.json');
    const { server, flush } = await createStudio({ persistence: file });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    try {
      await flush();
      const prior = await readFile(file, 'utf8');
      const rejected = await fetch(`http://127.0.0.1:${port}/api/commands`, { method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ commands: [{ type: 'smear', layer: 'paint' }], ...(await context(port)) }) });
      assert.equal(rejected.status, 400);
      await new Promise(resolve => setTimeout(resolve, 50));
      assert.equal(await readFile(file, 'utf8'), prior, 'a rejected mutation never writes');
    } finally {
      server.closeAllConnections?.();
      await new Promise(resolve => server.close(resolve));
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('a persistence failure returns 500 while the applied mutation remains in memory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'codesketch-flush-'));
    const file = join(dir, 'session.json');
    const { server, session } = await createStudio({ persistence: file });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    try {
      await chmod(dir, 0o555);
      const rejected = await fetch(`http://127.0.0.1:${port}/api/commands`, { method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ commands: [{ type: 'stroke', points: [[10, 10], [200, 200]] }],
          immediate: true, ...(await context(port)) }) });
      assert.equal(rejected.status, 500, 'persistence failure surfaces as 500');
      assert.match((await rejected.json()).error, /could not be saved|EACCES/);
      const after = await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
      assert.equal(after.document.marks.length, 1, 'the applied mutation stays in memory');
    } finally {
      await chmod(dir, 0o700);
      server.closeAllConnections?.();
      await new Promise(resolve => server.close(resolve));
      await rm(dir, { recursive: true, force: true });
    }
  });
});
