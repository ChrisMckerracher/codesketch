import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ControlGrant, GrantConflictError } from '../src/direction/feedback/grant.mjs';

const conflict = (fn) => {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof GrantConflictError);
    assert.equal(error.statusCode, 409);
    assert.equal(typeof error.reason, 'string');
    assert.ok(error.reason.length > 0);
    return true;
  });
};

const context = (grant, epoch = grant.controlEpoch) => ({
  expectedDocGeneration: grant.docGeneration,
  epoch,
});

describe('ControlGrant', () => {
  test('fresh sessions require matching generation and epoch even without an active grant', () => {
    const grant = new ControlGrant();
    assert.equal(grant.controlEpoch, 0);
    assert.equal(grant.requiresGrant, false);
    assert.equal(grant.activeGrant, null);
    conflict(() => grant.check({}, { execute: true }), 'missing context is a conflict while fresh');
    conflict(() => grant.check({ expectedDocGeneration: grant.docGeneration }, { execute: true }),
      'generation without epoch is a conflict while fresh');
    conflict(() => grant.check({ epoch: 0 }, { execute: true }), 'epoch without generation is a conflict while fresh');
    conflict(() => grant.check({ expectedDocGeneration: 'stale-generation', epoch: 0 }, { execute: true }),
      'stale context is a conflict while fresh');
    const ack = grant.check(context(grant), { execute: true });
    assert.equal(ack.ok, true);
    assert.equal(ack.docGeneration, grant.docGeneration);
    assert.equal(ack.controlEpoch, 0);
  });

  test('snapshot is a detached copy of all fields', () => {
    const grant = new ControlGrant();
    const authorized = grant.authorize();
    const snap = grant.snapshot();
    assert.deepEqual(snap, {
      docGeneration: grant.docGeneration,
      controlEpoch: grant.controlEpoch,
      requiresGrant: true,
      activeGrant: authorized,
    });
    assert.notEqual(snap.activeGrant, grant.activeGrant);
    snap.controlEpoch = 99;
    assert.equal(grant.controlEpoch, 1);
  });

  test('invalidate denies stale generation and epoch, even staging', () => {
    const grant = new ControlGrant();
    const stale = context(grant);
    grant.invalidate();
    conflict(() => grant.check({ ...stale }));
    conflict(() => grant.check({ ...stale }, { execute: true }));
    conflict(() => grant.check({ expectedDocGeneration: grant.docGeneration }));
    conflict(() => grant.check({}));
    conflict(() => grant.check({}, { execute: true }));
    assert.equal(grant.requiresGrant, true);
    assert.equal(grant.activeGrant, null);
  });

  test('paused staging accepts current context without token but denies execute', () => {
    const grant = new ControlGrant();
    grant.reset({ paused: true });
    assert.equal(grant.requiresGrant, true);
    assert.equal(grant.check(context(grant)).ok, true);
    conflict(() => grant.check(context(grant), { execute: true }));
    conflict(() => grant.check({}, { execute: true }));
  });

  test('authorize issues token usable repeatedly across batches while playing', () => {
    const grant = new ControlGrant();
    const issued = grant.authorize();
    assert.equal(grant.requiresGrant, true);
    assert.equal(issued.docGeneration, grant.docGeneration);
    assert.equal(issued.controlEpoch, grant.controlEpoch);
    assert.notEqual(issued.grantToken, grant.activeGrant.grantToken ? undefined : issued.grantToken, 'token exists');
    assert.equal(typeof issued.grantToken, 'string');
    assert.deepEqual(Object.keys(issued).sort(), ['controlEpoch', 'docGeneration', 'grantToken']);
    const frame = { ...context(grant), grantToken: issued.grantToken };
    assert.equal(grant.check(frame, { execute: true }).ok, true);
    assert.equal(grant.check(frame, { execute: true }).ok, true);
    assert.equal(grant.check({ ...frame }, { execute: true }).ok, true);
  });

  test('invalidate revokes an authorized token', () => {
    const grant = new ControlGrant();
    const issued = grant.authorize();
    const frame = { ...context(grant), grantToken: issued.grantToken };
    assert.equal(grant.check(frame, { execute: true }).ok, true);
    grant.invalidate();
    conflict(() => grant.check(frame, { execute: true }));
    conflict(() => grant.check(frame));
    conflict(() => grant.check({ ...frame }, { execute: true }));
    conflict(() => grant.check({ ...context(grant), grantToken: issued.grantToken }, { execute: true }));
    assert.equal(grant.check({ ...context(grant), grantToken: issued.grantToken }).ok, true);
  });

  test('reset rotates docGeneration and honors paused flag', () => {
    const grant = new ControlGrant();
    const before = grant.docGeneration;
    grant.authorize();
    grant.reset();
    assert.notEqual(grant.docGeneration, before);
    assert.equal(grant.controlEpoch, 0);
    assert.equal(grant.requiresGrant, false);
    assert.equal(grant.activeGrant, null);
    conflict(() => grant.check({}, { execute: true }), 'contextless execute is a conflict after reset');
    assert.equal(grant.check(context(grant), { execute: true }).ok, true);
    grant.reset({ paused: true });
    assert.equal(grant.requiresGrant, true);
    conflict(() => grant.check({}, { execute: true }));
    assert.equal(grant.check(context(grant)).ok, true);
  });

  test('malformed source and context are rejected with 409 and no mutation', () => {
    const grant = new ControlGrant();
    grant.authorize();
    const before = grant.snapshot();
    conflict(() => grant.check({ source: 'robot' }));
    conflict(() => grant.check({ source: 'Human' }));
    conflict(() => grant.check({ source: null }));
    conflict(() => grant.check({ source: 'agent', epoch: 1 }));
    conflict(() => grant.check({ source: 'agent', expectedDocGeneration: grant.docGeneration }));
    conflict(() => grant.check({ source: 'agent', ...context(grant), epoch: '1' }));
    conflict(() => grant.check({ source: 'agent', ...context(grant), epoch: -1 }));
    conflict(() => grant.check({ source: 'agent', ...context(grant), epoch: 1.5 }));
    conflict(() => grant.check({ source: 'agent', ...context(grant), epoch: Number.MAX_SAFE_INTEGER + 1 }));
    conflict(() => grant.check({ source: 'agent', ...context(grant), grantToken: 'forged' }, { execute: true }));
    conflict(() => grant.check({ source: 'agent', ...context(grant), grantToken: 'forged' }),
      'a supplied wrong token is rejected even for staging');
    assert.deepEqual(grant.snapshot(), before, 'failed checks never mutate state');
  });

  test('human source is trusted without auth context', () => {
    const grant = new ControlGrant();
    grant.invalidate();
    assert.equal(grant.check({ source: 'human' }, { execute: true }).ok, true);
    assert.equal(grant.check({ source: 'human', epoch: 'bogus' }).ok, true);
  });

  test('snapshot detachment cannot corrupt internal activeGrant', () => {
    const grant = new ControlGrant();
    const issued = grant.authorize();
    const snap = grant.snapshot();
    snap.activeGrant.grantToken = 'tampered';
    snap.activeGrant.controlEpoch = 42;
    snap.activeGrant = null;
    assert.deepEqual(grant.snapshot().activeGrant, issued);
    assert.equal(grant.check({ ...context(grant), grantToken: issued.grantToken }, { execute: true }).ok, true);
    conflict(() => grant.check({ ...context(grant), grantToken: 'tampered' }, { execute: true }));
  });
});
