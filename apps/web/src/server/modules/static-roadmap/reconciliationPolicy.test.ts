import assert from 'node:assert/strict';
import test from 'node:test';
import {
  capturedUserSyncDisposition,
  eligibleInitialBackfillUsers,
  shouldCreateRoadmapUpdateNotice,
} from './reconciliationPolicy';

const changedRollout = {
  hadCanonicalApplied: true,
  recipientIsActive: true,
  initialAccount: false,
  initialBootstrap: false,
  hasRollout: true,
};

void test('changed rollouts reconcile inactive captured users without notifying them', () => {
  assert.equal(
    capturedUserSyncDisposition({
      roadmapExists: true,
      roadmapSuspended: false,
      targetIsCurrent: true,
      recipientExists: true,
      recipientIsActive: false,
    }),
    'reconcile',
  );
  assert.equal(shouldCreateRoadmapUpdateNotice(changedRollout), true);
  assert.equal(
    shouldCreateRoadmapUpdateNotice({ ...changedRollout, recipientIsActive: false }),
    false,
  );
});

void test('initial application paths never create update notices', () => {
  assert.equal(shouldCreateRoadmapUpdateNotice({ ...changedRollout, initialAccount: true }), false);
  assert.equal(
    shouldCreateRoadmapUpdateNotice({ ...changedRollout, initialBootstrap: true }),
    false,
  );
});

void test('canonical v1 excludes quarantined owners while retaining valid active users', () => {
  const validOwner = { id: 'valid-owner', isActive: true };
  const invalidOwner = { id: 'invalid-owner', isActive: true };

  assert.deepEqual(eligibleInitialBackfillUsers([invalidOwner, validOwner], [invalidOwner.id]), [
    validOwner,
  ]);
});
