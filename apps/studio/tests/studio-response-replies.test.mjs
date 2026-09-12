import test from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../src/direction/index.mjs';
import { snapshotProblem, projectProblem } from '../src/studio/response.mjs';

function replyEnvelope() {
  const session = new Session();
  const comment = session.addComment({
    requestId: 'comment-request-1',
    text: 'Review this area',
    rect: null,
    continuePlayback: false,
    expectedDocGeneration: session.controlGrant.docGeneration,
    expectedArtRevision: session.artRevision,
    expectedControlEpoch: session.controlGrant.controlEpoch,
  });
  session.replyComment({
    id: comment.id,
    requestId: 'reply-request-1',
    text: 'Agent response',
    source: 'agent',
    expectedDocGeneration: session.controlGrant.docGeneration,
    expectedSeq: comment.seq,
  });
  return {
    snapshot: { ...session.snapshot(), heartbeat: { lastSeenAt: null } },
    project: session.project(),
  };
}

function pairWith(change) {
  const pair = replyEnvelope();
  change(pair.snapshot, pair.project);
  return pair;
}

function assertPairValid(pair, label) {
  assert.equal(snapshotProblem(pair.snapshot), null, `${label} snapshot`);
  assert.equal(projectProblem(pair.project), null, `${label} project`);
}

function assertPairInvalid(pair, label) {
  assert.equal(typeof snapshotProblem(pair.snapshot), 'string', `${label} snapshot`);
  assert.equal(typeof projectProblem(pair.project), 'string', `${label} project`);
}

function changeReply(change) {
  return pairWith((snapshot, project) => {
    snapshot.comments[0].replies = [change(snapshot.comments[0].replies[0])];
    project.comments[0].replies = [change(project.comments[0].replies[0])];
  });
}

function replyList(seed, count) {
  return Array.from({ length: count }, (_, index) => ({
    ...seed,
    id: `reply-${index}`,
    requestId: `request-${index}`,
  }));
}

function twoCommentPair(changeSecond) {
  return pairWith((snapshot, project) => {
    for (const comments of [snapshot.comments, project.comments]) {
      const first = comments[0];
      comments.push({
        ...first,
        id: `${first.id}-second`,
        number: 2,
        seq: 2,
        replies: [changeSecond(first.replies[0])],
      });
    }
  });
}

test('accepts real reply-bearing snapshots and projects with optional replies', () => {
  const base = replyEnvelope();
  assert.equal(base.snapshot.comments[0].replies[0].author, 'agent');
  assertPairValid(base, 'real reply');

  assertPairValid(pairWith((snapshot, project) => {
    delete snapshot.comments[0].replies;
    delete project.comments[0].replies;
  }), 'absent replies');
  assertPairValid(pairWith((snapshot, project) => {
    snapshot.comments[0].replies = [];
    project.comments[0].replies = [];
  }), 'empty replies');
  assertPairValid(changeReply((reply) => ({ ...reply, author: 'human' })), 'human reply');
});

test('enforces the per-comment reply limit', () => {
  for (const count of [32, 33]) {
    const pair = pairWith((snapshot, project) => {
      const seed = snapshot.comments[0].replies[0];
      snapshot.comments[0].replies = replyList(seed, count);
      project.comments[0].replies = replyList(project.comments[0].replies[0], count);
    });
    if (count === 32) assertPairValid(pair, '32 replies');
    else assertPairInvalid(pair, '33 replies');
  }
});

test('rejects malformed reply records and values at both response boundaries', () => {
  const cases = [
    ['null replies', (snapshot, project) => { snapshot.comments[0].replies = null; project.comments[0].replies = null; }],
    ['null entry', () => changeReply(() => null)],
    ['unknown field', () => changeReply((reply) => ({ ...reply, extra: true }))],
    ['missing field', () => changeReply(({ at, ...reply }) => reply)],
    ['null author', () => changeReply((reply) => ({ ...reply, author: null }))],
    ['bad author', () => changeReply((reply) => ({ ...reply, author: 'robot' }))],
    ['blank id', () => changeReply((reply) => ({ ...reply, id: '  ' }))],
    ['long id', () => changeReply((reply) => ({ ...reply, id: 'x'.repeat(81) }))],
    ['blank request ID', () => changeReply((reply) => ({ ...reply, requestId: '\t' }))],
    ['long request ID', () => changeReply((reply) => ({ ...reply, requestId: 'x'.repeat(81) }))],
    ['blank text', () => changeReply((reply) => ({ ...reply, text: ' ' }))],
    ['long text', () => changeReply((reply) => ({ ...reply, text: 'x'.repeat(2001) }))],
    ['blank timestamp', () => changeReply((reply) => ({ ...reply, at: '' }))],
    ['long timestamp', () => changeReply((reply) => ({ ...reply, at: 'x'.repeat(41) }))],
  ];
  for (const [label, make] of cases) {
    const pair = label === 'null replies' ? pairWith(make) : make();
    assertPairInvalid(pair, label);
  }
});

test('rejects reply IDs and request IDs duplicated across comments', () => {
  assertPairInvalid(twoCommentPair((reply) => ({ ...reply })), 'duplicate reply ID');
  assertPairInvalid(twoCommentPair((reply) => ({ ...reply, id: 'reply-second' })), 'duplicate request ID');
});
