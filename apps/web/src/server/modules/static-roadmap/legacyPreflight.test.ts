import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateLegacyIntegrity, isValidRoadmapTaskStatus } from './legacyPreflight';

const activeOwner = '11111111-1111-4111-8111-111111111111';
const inactiveOwner = '22222222-2222-4222-8222-222222222222';
const missingOwner = '33333333-3333-4333-8333-333333333333';
const validOwner = '44444444-4444-4444-8444-444444444444';

void test('legacy preflight produces a deterministic passing preservation fingerprint', () => {
  const records = {
    journeyVersions: [{ id: 'version-1', createdAt: new Date('2026-01-01T00:00:00.000Z') }],
    plans: [{ id: 'plan-1', ownerId: activeOwner, status: 'active' }],
    taskInstances: [
      {
        id: 'task-1',
        planId: 'plan-1',
        stableKey: 'first-task',
        status: 'completed',
        retiredAt: null,
      },
    ],
    taskEvents: [{ id: 'event-1' }],
    revisionEvents: [{ id: 'revision-1' }],
    proposals: [{ id: 'proposal-1' }],
  };
  const input = {
    records,
    plans: records.plans,
    taskInstances: records.taskInstances,
    users: [{ id: activeOwner, isActive: true }],
  };

  const first = evaluateLegacyIntegrity(input);
  const second = evaluateLegacyIntegrity(input);

  assert.equal(first.passed, true);
  assert.equal(first.canonicalV1MayProceed, true);
  assert.deepEqual(first.quarantinedOwnerIds, []);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.deepEqual(first.counts, {
    journeyVersions: 1,
    plans: 1,
    activePlans: 1,
    taskInstances: 1,
    taskEvents: 1,
    revisionEvents: 1,
    proposals: 1,
  });
});

void test('legacy preflight quarantines only affected owners and permits canonical v1', () => {
  const plans = [
    { id: 'plan-1', ownerId: activeOwner, status: 'active' },
    { id: 'plan-2', ownerId: activeOwner, status: 'active' },
    { id: 'plan-3', ownerId: 'not-a-uuid', status: 'active' },
    { id: 'plan-4', ownerId: missingOwner, status: 'active' },
    { id: 'plan-5', ownerId: inactiveOwner, status: 'active' },
    { id: 'plan-6', ownerId: validOwner, status: 'active' },
  ];
  const taskInstances = [
    {
      id: 'task-1',
      planId: 'plan-1',
      stableKey: 'duplicate',
      status: 'completed',
      retiredAt: null,
    },
    {
      id: 'task-2',
      planId: 'plan-1',
      stableKey: 'duplicate',
      status: 'not_started',
      retiredAt: null,
    },
    {
      id: 'task-3',
      planId: 'plan-2',
      stableKey: 'bad-status',
      status: 'invented',
      retiredAt: null,
    },
    {
      id: 'task-4',
      planId: 'plan-6',
      stableKey: 'valid-task',
      status: 'in_progress',
      retiredAt: null,
    },
  ];
  const audit = evaluateLegacyIntegrity({
    records: {
      journeyVersions: [],
      plans,
      taskInstances,
      taskEvents: [],
      revisionEvents: [],
      proposals: [],
    },
    plans,
    taskInstances,
    users: [
      { id: activeOwner, isActive: true },
      { id: inactiveOwner, isActive: false },
      { id: validOwner, isActive: true },
    ],
  });

  assert.equal(audit.passed, false);
  assert.equal(audit.canonicalV1MayProceed, true);
  assert.deepEqual(audit.quarantinedOwnerIds, [
    activeOwner,
    inactiveOwner,
    missingOwner,
    'not-a-uuid',
  ]);
  assert.equal(audit.quarantinedOwnerIds.includes(validOwner), false);
  assert.deepEqual(audit.errors.duplicateActivePlans[0]?.planIds, ['plan-1', 'plan-2']);
  assert.deepEqual(audit.errors.duplicateActiveStableKeys[0]?.taskIds, ['task-1', 'task-2']);
  assert.deepEqual(audit.errors.invalidOwners.map((row) => row.reason).sort(), [
    'inactive_user',
    'missing_user',
    'non_uuid',
  ]);
  assert.deepEqual(audit.errors.invalidTaskStatuses, [
    { planId: 'plan-2', taskId: 'task-3', status: 'invented' },
  ]);
  assert.equal(isValidRoadmapTaskStatus('waived'), true);
  assert.equal(isValidRoadmapTaskStatus('invented'), false);
});
