import type { Prisma } from '@/generated/prisma/client';
import type { PrismaTransaction } from '../../infrastructure/prisma/prismaTypes';
import { hashCanonical } from './canonical';
import { evaluateLegacyIntegrity, parseLegacyPreflightContext } from './legacyPreflight';

const uuidPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

type LegacyPlanIdentity = {
  id: string;
  ownerId: string;
  status: string;
  definitionVersionId: string;
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

type OwnerAuditRecords = {
  journeyVersions: unknown[];
  plans: unknown[];
  taskInstances: unknown[];
  taskEvents: unknown[];
  revisionEvents: unknown[];
  proposals: unknown[];
};

export type LegacyOwnerResolutionAudit = {
  schemaVersion: 'legacy-roadmap-owner-resolution-v1';
  ownerId: string;
  baselineAuditEventId: string;
  baselineFingerprint: string;
  canonicalVersionId: string;
  fingerprint: string;
  collectionFingerprints: {
    user: string;
    journeyVersions: string;
    plans: string;
    taskInstances: string;
    taskEvents: string;
    revisionEvents: string;
    proposals: string;
  };
  counts: {
    users: number;
    journeyVersions: number;
    plans: number;
    activePlans: number;
    taskInstances: number;
    taskEvents: number;
    revisionEvents: number;
    proposals: number;
  };
  errors: {
    owner: Array<{ reason: 'non_uuid' | 'missing_user' | 'inactive_user' }>;
    duplicateActivePlans: Array<{ ownerId: string; planIds: string[] }>;
    duplicateActiveStableKeys: Array<{
      planId: string;
      stableKey: string;
      taskIds: string[];
    }>;
    invalidTaskStatuses: Array<{ planId: string; taskId: string; status: string }>;
  };
  passed: boolean;
};

export type LegacyOwnerResolutionResult =
  | { kind: 'blocked'; audit?: LegacyOwnerResolutionAudit; reason: 'baseline' | 'owner' }
  | {
      kind: 'resolved';
      audit: LegacyOwnerResolutionAudit;
      governanceEventId: string;
    };

export async function resolveLegacyOwnerQuarantine(
  transaction: PrismaTransaction,
  input: {
    roadmapId: string;
    sourceId: string;
    canonicalVersionId: string;
    ownerId: string;
    baselineAuditEventId: string;
    baselineFingerprint: string;
  },
): Promise<LegacyOwnerResolutionResult> {
  const baseline = await transaction.onboardingRoadmapGovernanceEvent.findUnique({
    where: { id: input.baselineAuditEventId },
    select: {
      roadmapId: true,
      sourceId: true,
      eventType: true,
      decisionStatus: true,
      details: true,
    },
  });
  const baselineContext = baseline
    ? parseLegacyPreflightContext(input.baselineAuditEventId, baseline.details)
    : null;
  if (
    !baseline ||
    baseline.roadmapId !== input.roadmapId ||
    baseline.sourceId !== input.sourceId ||
    baseline.eventType !== 'legacy_integrity_preflight_completed' ||
    baseline.decisionStatus !== 'approved' ||
    baselineContext?.fingerprint !== input.baselineFingerprint ||
    !baselineContext.quarantinedOwnerIds.includes(input.ownerId)
  ) {
    return { kind: 'blocked', reason: 'baseline' };
  }

  const user = await transaction.user.findUnique({
    where: { id: input.ownerId },
    select: { id: true, isActive: true },
  });
  const plans = await transaction.onboardingPlan.findMany({
    where: { ownerId: input.ownerId, roadmapId: null },
    orderBy: { id: 'asc' },
  });
  const planIds = plans.map((plan) => plan.id);
  const definitionVersionIds = [...new Set(plans.map((plan) => plan.definitionVersionId))].sort();
  const [journeyVersions, taskInstances, taskEvents, revisionEvents, proposals] =
    planIds.length > 0
      ? await Promise.all([
          transaction.onboardingJourneyVersion.findMany({
            where: { id: { in: definitionVersionIds } },
            orderBy: { id: 'asc' },
          }),
          transaction.onboardingTaskInstance.findMany({
            where: { planId: { in: planIds } },
            orderBy: { id: 'asc' },
          }),
          transaction.onboardingTaskEvent.findMany({
            where: { planId: { in: planIds } },
            orderBy: { id: 'asc' },
          }),
          transaction.onboardingPlanRevisionEvent.findMany({
            where: { planId: { in: planIds } },
            orderBy: { id: 'asc' },
          }),
          transaction.onboardingAiProposal.findMany({
            where: { planId: { in: planIds } },
            orderBy: { id: 'asc' },
          }),
        ])
      : [[], [], [], [], []];
  const audit = evaluateLegacyOwnerResolution({
    ownerId: input.ownerId,
    baselineAuditEventId: input.baselineAuditEventId,
    baselineFingerprint: input.baselineFingerprint,
    canonicalVersionId: input.canonicalVersionId,
    user,
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
  });
  if (!audit.passed) return { kind: 'blocked', reason: 'owner', audit };

  const governanceEventId = deterministicResolutionEventId(audit);
  const resolvedAt = new Date();
  const event = await transaction.onboardingRoadmapGovernanceEvent.upsert({
    where: { id: governanceEventId },
    create: {
      id: governanceEventId,
      roadmapId: input.roadmapId,
      sourceId: input.sourceId,
      eventType: 'legacy_integrity_owner_quarantine_resolved',
      decisionStatus: 'approved',
      details: toJson({
        baselineAuditEventId: input.baselineAuditEventId,
        baselineFingerprint: input.baselineFingerprint,
        canonicalVersionId: input.canonicalVersionId,
        ownerId: input.ownerId,
        resolutionAudit: audit,
      }),
      resolvedAt,
      resolvedBy: 'static-roadmap-owner-reaudit',
    },
    update: {},
    select: {
      roadmapId: true,
      sourceId: true,
      eventType: true,
      decisionStatus: true,
      details: true,
    },
  });
  if (!isMatchingResolutionEvent(event, input, audit)) {
    return { kind: 'blocked', reason: 'baseline' };
  }
  return { kind: 'resolved', audit, governanceEventId };
}

export function evaluateLegacyOwnerResolution(input: {
  ownerId: string;
  baselineAuditEventId: string;
  baselineFingerprint: string;
  canonicalVersionId: string;
  user: ReferencedUser | null;
  records: OwnerAuditRecords;
  plans: LegacyPlanIdentity[];
  taskInstances: LegacyTaskIdentity[];
}): LegacyOwnerResolutionAudit {
  const normalizedUser = normalizeForAudit(input.user);
  const integrity = evaluateLegacyIntegrity({
    records: input.records,
    plans: input.plans,
    taskInstances: input.taskInstances,
    users: input.user ? [input.user] : [],
  });
  const ownerReason: 'non_uuid' | 'missing_user' | 'inactive_user' | null = !uuidPattern.test(
    input.ownerId,
  )
    ? 'non_uuid'
    : !input.user
      ? 'missing_user'
      : !input.user.isActive
        ? 'inactive_user'
        : null;
  const errors = {
    owner: ownerReason ? [{ reason: ownerReason }] : [],
    duplicateActivePlans: integrity.errors.duplicateActivePlans,
    duplicateActiveStableKeys: integrity.errors.duplicateActiveStableKeys,
    invalidTaskStatuses: integrity.errors.invalidTaskStatuses,
  };
  const collectionFingerprints = {
    user: hashCanonical(normalizedUser),
    ...integrity.collectionFingerprints,
  };
  return {
    schemaVersion: 'legacy-roadmap-owner-resolution-v1',
    ownerId: input.ownerId,
    baselineAuditEventId: input.baselineAuditEventId,
    baselineFingerprint: input.baselineFingerprint,
    canonicalVersionId: input.canonicalVersionId,
    fingerprint: hashCanonical({
      schemaVersion: 'legacy-roadmap-owner-resolution-v1',
      ownerId: input.ownerId,
      baselineAuditEventId: input.baselineAuditEventId,
      baselineFingerprint: input.baselineFingerprint,
      canonicalVersionId: input.canonicalVersionId,
      user: normalizedUser,
      legacyFingerprint: integrity.fingerprint,
    }),
    collectionFingerprints,
    counts: {
      users: input.user ? 1 : 0,
      ...integrity.counts,
    },
    errors,
    passed: Object.values(errors).every((rows) => rows.length === 0),
  };
}

function deterministicResolutionEventId(audit: LegacyOwnerResolutionAudit): string {
  const hex = hashCanonical({
    purpose: 'legacy-owner-quarantine-resolution-v1',
    baselineAuditEventId: audit.baselineAuditEventId,
    canonicalVersionId: audit.canonicalVersionId,
    ownerId: audit.ownerId,
    resolutionFingerprint: audit.fingerprint,
  })
    .slice(0, 32)
    .split('');
  hex[12] = '5';
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function isMatchingResolutionEvent(
  event: {
    roadmapId: string;
    sourceId: string;
    eventType: string;
    decisionStatus: string;
    details: unknown;
  },
  input: {
    roadmapId: string;
    sourceId: string;
    canonicalVersionId: string;
    ownerId: string;
    baselineAuditEventId: string;
    baselineFingerprint: string;
  },
  audit: LegacyOwnerResolutionAudit,
): boolean {
  if (
    event.roadmapId !== input.roadmapId ||
    event.sourceId !== input.sourceId ||
    event.eventType !== 'legacy_integrity_owner_quarantine_resolved' ||
    event.decisionStatus !== 'approved' ||
    !event.details ||
    typeof event.details !== 'object' ||
    Array.isArray(event.details)
  ) {
    return false;
  }
  const details = event.details as Record<string, unknown>;
  const resolutionAudit = details.resolutionAudit;
  return (
    details.baselineAuditEventId === input.baselineAuditEventId &&
    details.baselineFingerprint === input.baselineFingerprint &&
    details.canonicalVersionId === input.canonicalVersionId &&
    details.ownerId === input.ownerId &&
    Boolean(resolutionAudit) &&
    typeof resolutionAudit === 'object' &&
    !Array.isArray(resolutionAudit) &&
    (resolutionAudit as Record<string, unknown>).fingerprint === audit.fingerprint &&
    (resolutionAudit as Record<string, unknown>).passed === true
  );
}

function normalizeForAudit<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return normalizeForAudit(value) as Prisma.InputJsonValue;
}
