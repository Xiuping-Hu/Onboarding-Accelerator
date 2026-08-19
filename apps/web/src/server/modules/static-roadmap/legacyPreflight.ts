import { randomUUID } from 'node:crypto';
import type { OnboardingTaskStatus } from '@onboarding/shared';
import type { Prisma } from '@/generated/prisma/client';
import type { PrismaTransaction } from '../../infrastructure/prisma/prismaTypes';
import { hashCanonical } from './canonical';

const validTaskStatuses = new Set<OnboardingTaskStatus>([
  'not_started',
  'in_progress',
  'blocked',
  'completed',
  'waived',
]);
const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

type LegacyPlanIdentity = {
  id: string;
  ownerId: string;
  status: string;
};

type LegacyTaskIdentity = {
  id: string;
  planId: string;
  stableKey: string;
  status: string;
  retiredAt: Date | string | null;
};

type ReferencedUser = {
  id: string;
  isActive: boolean;
};

export type LegacyIntegrityAudit = {
  schemaVersion: 'legacy-roadmap-preflight-v1';
  fingerprint: string;
  collectionFingerprints: {
    journeyVersions: string;
    plans: string;
    taskInstances: string;
    taskEvents: string;
    revisionEvents: string;
    proposals: string;
  };
  counts: {
    journeyVersions: number;
    plans: number;
    activePlans: number;
    taskInstances: number;
    taskEvents: number;
    revisionEvents: number;
    proposals: number;
  };
  errors: {
    duplicateActivePlans: Array<{ ownerId: string; planIds: string[] }>;
    duplicateActiveStableKeys: Array<{ planId: string; stableKey: string; taskIds: string[] }>;
    invalidOwners: Array<{
      ownerId: string;
      planIds: string[];
      reason: 'non_uuid' | 'missing_user' | 'inactive_user';
    }>;
    invalidTaskStatuses: Array<{ planId: string; taskId: string; status: string }>;
  };
  quarantinedOwnerIds: string[];
  canonicalV1MayProceed: true;
  passed: boolean;
};

export async function auditLegacyRoadmapIntegrity(
  transaction: PrismaTransaction,
  input: { roadmapId: string; sourceId: string; publicationEventId: string },
): Promise<{ auditEventId: string; fingerprint: string; quarantinedOwnerIds: string[] }> {
  const [journeyVersions, plans, taskInstances, taskEvents, revisionEvents, proposals] =
    await Promise.all([
      transaction.onboardingJourneyVersion.findMany({
        where: { roadmapId: null },
        orderBy: { id: 'asc' },
      }),
      transaction.onboardingPlan.findMany({
        where: { roadmapId: null },
        orderBy: { id: 'asc' },
      }),
      transaction.onboardingTaskInstance.findMany({
        where: { plan: { roadmapId: null } },
        orderBy: { id: 'asc' },
      }),
      transaction.onboardingTaskEvent.findMany({
        where: { plan: { roadmapId: null } },
        orderBy: { id: 'asc' },
      }),
      transaction.onboardingPlanRevisionEvent.findMany({
        where: { plan: { roadmapId: null } },
        orderBy: { id: 'asc' },
      }),
      transaction.onboardingAiProposal.findMany({
        where: { plan: { roadmapId: null } },
        orderBy: { id: 'asc' },
      }),
    ]);
  const activeOwnerIds = [
    ...new Set(
      plans
        .filter((plan) => plan.status === 'active' && isUuid(plan.ownerId))
        .map((plan) => plan.ownerId),
    ),
  ].sort();
  const users = activeOwnerIds.length
    ? await transaction.user.findMany({
        where: { id: { in: activeOwnerIds } },
        select: { id: true, isActive: true },
        orderBy: { id: 'asc' },
      })
    : [];
  const audit = evaluateLegacyIntegrity({
    records: {
      journeyVersions,
      plans,
      taskInstances,
      taskEvents,
      revisionEvents,
      proposals,
    },
    plans,
    taskInstances,
    users,
  });
  const auditEventId = randomUUID();
  const now = new Date();
  await transaction.onboardingRoadmapGovernanceEvent.create({
    data: {
      id: auditEventId,
      roadmapId: input.roadmapId,
      sourceId: input.sourceId,
      eventType: 'legacy_integrity_preflight_completed',
      decisionStatus: 'approved',
      details: toJson({
        publicationEventId: input.publicationEventId,
        ...audit,
      }),
      resolvedAt: now,
      resolvedBy: 'static-roadmap-legacy-preflight',
    },
  });
  if (!audit.passed) {
    await transaction.onboardingRoadmapGovernanceEvent.create({
      data: {
        id: randomUUID(),
        roadmapId: input.roadmapId,
        sourceId: input.sourceId,
        eventType: 'legacy_integrity_owner_quarantine',
        decisionStatus: 'pending',
        details: toJson({
          baselineAuditEventId: auditEventId,
          publicationEventId: input.publicationEventId,
          ...audit,
        }),
      },
    });
  }
  return {
    auditEventId,
    fingerprint: audit.fingerprint,
    quarantinedOwnerIds: audit.quarantinedOwnerIds,
  };
}

export function evaluateLegacyIntegrity(input: {
  records: {
    journeyVersions: unknown[];
    plans: unknown[];
    taskInstances: unknown[];
    taskEvents: unknown[];
    revisionEvents: unknown[];
    proposals: unknown[];
  };
  plans: LegacyPlanIdentity[];
  taskInstances: LegacyTaskIdentity[];
  users: ReferencedUser[];
}): LegacyIntegrityAudit {
  const normalizedRecords = normalizeForAudit(input.records);
  const collectionFingerprints = {
    journeyVersions: hashCanonical(normalizedRecords.journeyVersions),
    plans: hashCanonical(normalizedRecords.plans),
    taskInstances: hashCanonical(normalizedRecords.taskInstances),
    taskEvents: hashCanonical(normalizedRecords.taskEvents),
    revisionEvents: hashCanonical(normalizedRecords.revisionEvents),
    proposals: hashCanonical(normalizedRecords.proposals),
  };
  const activePlans = input.plans.filter((plan) => plan.status === 'active');
  const activePlanIds = new Set(activePlans.map((plan) => plan.id));
  const plansByOwner = groupBy(activePlans, (plan) => plan.ownerId);
  const duplicateActivePlans = [...plansByOwner.entries()]
    .filter(([, plans]) => plans.length > 1)
    .map(([ownerId, plans]) => ({
      ownerId,
      planIds: plans.map((plan) => plan.id).sort(),
    }))
    .sort(compareOwner);
  const currentTasks = input.taskInstances.filter(
    (task) => activePlanIds.has(task.planId) && task.retiredAt === null,
  );
  const tasksByPlanAndKey = groupBy(
    currentTasks,
    (task) => `${task.planId}\u0000${task.stableKey}`,
  );
  const duplicateActiveStableKeys = [...tasksByPlanAndKey.values()]
    .filter((tasks) => tasks.length > 1)
    .map((tasks) => ({
      planId: tasks[0]!.planId,
      stableKey: tasks[0]!.stableKey,
      taskIds: tasks.map((task) => task.id).sort(),
    }))
    .sort(
      (left, right) =>
        left.planId.localeCompare(right.planId) || left.stableKey.localeCompare(right.stableKey),
    );
  const usersById = new Map(input.users.map((user) => [user.id, user] as const));
  const invalidOwners = [...plansByOwner.entries()]
    .flatMap(([ownerId, plans]) => {
      const reason: 'non_uuid' | 'missing_user' | 'inactive_user' | null = !isUuid(ownerId)
        ? 'non_uuid'
        : !usersById.has(ownerId)
          ? 'missing_user'
          : !usersById.get(ownerId)!.isActive
            ? 'inactive_user'
            : null;
      return reason ? [{ ownerId, planIds: plans.map((plan) => plan.id).sort(), reason }] : [];
    })
    .sort(compareOwner);
  const invalidTaskStatuses = input.taskInstances
    .filter((task) => activePlanIds.has(task.planId) && !isValidRoadmapTaskStatus(task.status))
    .map((task) => ({ planId: task.planId, taskId: task.id, status: task.status }))
    .sort(
      (left, right) =>
        left.planId.localeCompare(right.planId) || left.taskId.localeCompare(right.taskId),
    );
  const errors = {
    duplicateActivePlans,
    duplicateActiveStableKeys,
    invalidOwners,
    invalidTaskStatuses,
  };
  const ownerByPlanId = new Map(activePlans.map((plan) => [plan.id, plan.ownerId] as const));
  const quarantinedOwnerIds = [
    ...new Set([
      ...duplicateActivePlans.map((row) => row.ownerId),
      ...invalidOwners.map((row) => row.ownerId),
      ...duplicateActiveStableKeys
        .map((row) => ownerByPlanId.get(row.planId))
        .filter((ownerId): ownerId is string => Boolean(ownerId)),
      ...invalidTaskStatuses
        .map((row) => ownerByPlanId.get(row.planId))
        .filter((ownerId): ownerId is string => Boolean(ownerId)),
    ]),
  ].sort();
  const counts = {
    journeyVersions: input.records.journeyVersions.length,
    plans: input.records.plans.length,
    activePlans: activePlans.length,
    taskInstances: input.records.taskInstances.length,
    taskEvents: input.records.taskEvents.length,
    revisionEvents: input.records.revisionEvents.length,
    proposals: input.records.proposals.length,
  };
  return {
    schemaVersion: 'legacy-roadmap-preflight-v1',
    fingerprint: hashCanonical({
      schemaVersion: 'legacy-roadmap-preflight-v1',
      collections: normalizedRecords,
    }),
    collectionFingerprints,
    counts,
    errors,
    quarantinedOwnerIds,
    canonicalV1MayProceed: true,
    passed: Object.values(errors).every((rows) => rows.length === 0),
  };
}

export function isValidRoadmapTaskStatus(status: string): status is OnboardingTaskStatus {
  return validTaskStatuses.has(status as OnboardingTaskStatus);
}

export function parseLegacyPreflightContext(
  auditEventId: string,
  details: unknown,
): { auditEventId: string; fingerprint: string; quarantinedOwnerIds: string[] } | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  const record = details as Record<string, unknown>;
  if (
    record.canonicalV1MayProceed !== true ||
    typeof record.fingerprint !== 'string' ||
    !Array.isArray(record.quarantinedOwnerIds) ||
    record.quarantinedOwnerIds.some((ownerId) => typeof ownerId !== 'string')
  ) {
    return null;
  }
  return {
    auditEventId,
    fingerprint: record.fingerprint,
    quarantinedOwnerIds: [...new Set(record.quarantinedOwnerIds as string[])].sort(),
  };
}

function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}

function groupBy<T>(values: T[], keyFor: (value: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    const rows = grouped.get(key) ?? [];
    rows.push(value);
    grouped.set(key, rows);
  }
  return grouped;
}

function compareOwner(left: { ownerId: string }, right: { ownerId: string }): number {
  return left.ownerId.localeCompare(right.ownerId);
}

function normalizeForAudit<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return normalizeForAudit(value) as Prisma.InputJsonValue;
}
