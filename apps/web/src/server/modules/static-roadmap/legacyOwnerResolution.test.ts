import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaTransaction } from '../../infrastructure/prisma/prismaTypes';
import { resolveLegacyOwnerQuarantine } from './legacyOwnerResolution';

const ownerId = '11111111-1111-4111-8111-111111111111';
const roadmapId = '22222222-2222-4222-8222-222222222222';
const canonicalVersionId = '33333333-3333-4333-8333-333333333333';
const baselineAuditEventId = '44444444-4444-4444-8444-444444444444';
const sourceId = 'authoritative-source';
const baselineFingerprint = 'baseline-fingerprint';

type PlanFixture = {
  id: string;
  ownerId: string;
  status: string;
  definitionVersionId: string;
};

type TaskFixture = {
  id: string;
  planId: string;
  stableKey: string;
  status: string;
  retiredAt: Date | null;
};

type FixtureState = {
  userActive: boolean;
  plans: PlanFixture[];
  tasks: TaskFixture[];
};

type StoredGovernanceEvent = {
  roadmapId: string;
  sourceId: string;
  eventType: string;
  decisionStatus: string;
  details: unknown;
};

void test('inactive quarantined owner resolves idempotently after activation', async () => {
  const state = fixtureState();
  state.userActive = false;
  const harness = transactionHarness(state);

  const inactive = await resolve(harness.transaction);
  assert.equal(inactive.kind, 'blocked');
  assert.equal(
    inactive.kind === 'blocked' ? inactive.audit?.errors.owner[0]?.reason : null,
    'inactive_user',
  );
  assert.equal(harness.resolutionEvents.size, 0);

  state.userActive = true;
  const activated = await resolve(harness.transaction);
  const replay = await resolve(harness.transaction);
  assert.equal(activated.kind, 'resolved');
  assert.equal(replay.kind, 'resolved');
  assert.equal(
    activated.kind === 'resolved' ? activated.governanceEventId : null,
    replay.kind === 'resolved' ? replay.governanceEventId : null,
  );
  assert.equal(harness.resolutionEvents.size, 1);
});

void test('duplicate-plan quarantine resolves only after an unambiguous repair', async () => {
  const state = fixtureState();
  state.plans.push({
    id: '77777777-7777-4777-8777-777777777777',
    ownerId,
    status: 'active',
    definitionVersionId: '88888888-8888-4888-8888-888888888888',
  });
  const harness = transactionHarness(state);

  const corrupt = await resolve(harness.transaction);
  assert.equal(corrupt.kind, 'blocked');
  assert.equal(
    corrupt.kind === 'blocked' ? corrupt.audit?.errors.duplicateActivePlans.length : 0,
    1,
  );
  assert.equal(harness.resolutionEvents.size, 0);

  state.plans[1]!.status = 'cancelled';
  const repaired = await resolve(harness.transaction);
  assert.equal(repaired.kind, 'resolved');
  assert.equal(harness.resolutionEvents.size, 1);
});

void test('duplicate live task keys resolve only after one row is explicitly retired', async () => {
  const state = fixtureState();
  state.tasks.push({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    planId: state.plans[0]!.id,
    stableKey: state.tasks[0]!.stableKey,
    status: 'completed',
    retiredAt: null,
  });
  const harness = transactionHarness(state);

  const ambiguous = await resolve(harness.transaction);
  assert.equal(ambiguous.kind, 'blocked');
  assert.equal(
    ambiguous.kind === 'blocked' ? ambiguous.audit?.errors.duplicateActiveStableKeys.length : 0,
    1,
  );

  state.tasks[1]!.retiredAt = new Date('2026-08-13T00:00:00.000Z');
  const repaired = await resolve(harness.transaction);
  assert.equal(repaired.kind, 'resolved');
  assert.equal(harness.resolutionEvents.size, 1);
});

void test('quarantined owner remains blocked while a task status is invalid', async () => {
  const state = fixtureState();
  state.tasks[0]!.status = 'invented';
  const harness = transactionHarness(state);

  const result = await resolve(harness.transaction);
  assert.equal(result.kind, 'blocked');
  assert.deepEqual(result.kind === 'blocked' ? result.audit?.errors.invalidTaskStatuses : [], [
    {
      planId: state.plans[0]!.id,
      taskId: state.tasks[0]!.id,
      status: 'invented',
    },
  ]);
  assert.equal(harness.resolutionEvents.size, 0);
});

function fixtureState(): FixtureState {
  const planId = '55555555-5555-4555-8555-555555555555';
  return {
    userActive: true,
    plans: [
      {
        id: planId,
        ownerId,
        status: 'active',
        definitionVersionId: '66666666-6666-4666-8666-666666666666',
      },
    ],
    tasks: [
      {
        id: '99999999-9999-4999-8999-999999999999',
        planId,
        stableKey: 'valid-task',
        status: 'not_started',
        retiredAt: null,
      },
    ],
  };
}

function transactionHarness(state: FixtureState): {
  transaction: PrismaTransaction;
  resolutionEvents: Map<string, StoredGovernanceEvent>;
} {
  const resolutionEvents = new Map<string, StoredGovernanceEvent>();
  const transaction = {
    onboardingRoadmapGovernanceEvent: {
      findUnique: async () => ({
        roadmapId,
        sourceId,
        eventType: 'legacy_integrity_preflight_completed',
        decisionStatus: 'approved',
        details: {
          canonicalV1MayProceed: true,
          fingerprint: baselineFingerprint,
          quarantinedOwnerIds: [ownerId],
        },
      }),
      upsert: async (input: {
        where: { id: string };
        create: StoredGovernanceEvent & { id: string };
      }) => {
        const existing = resolutionEvents.get(input.where.id);
        if (existing) return existing;
        const created: StoredGovernanceEvent = {
          roadmapId: input.create.roadmapId,
          sourceId: input.create.sourceId,
          eventType: input.create.eventType,
          decisionStatus: input.create.decisionStatus,
          details: input.create.details,
        };
        resolutionEvents.set(input.where.id, created);
        return created;
      },
    },
    user: {
      findUnique: async () => ({ id: ownerId, isActive: state.userActive }),
    },
    onboardingPlan: {
      findMany: async () => state.plans,
    },
    onboardingJourneyVersion: {
      findMany: async () =>
        state.plans.map((plan) => ({ id: plan.definitionVersionId, stages: [] })),
    },
    onboardingTaskInstance: {
      findMany: async () => state.tasks,
    },
    onboardingTaskEvent: { findMany: async () => [] },
    onboardingPlanRevisionEvent: { findMany: async () => [] },
    onboardingAiProposal: { findMany: async () => [] },
  } as unknown as PrismaTransaction;
  return { transaction, resolutionEvents };
}

function resolve(transaction: PrismaTransaction) {
  return resolveLegacyOwnerQuarantine(transaction, {
    roadmapId,
    sourceId,
    canonicalVersionId,
    ownerId,
    baselineAuditEventId,
    baselineFingerprint,
  });
}
