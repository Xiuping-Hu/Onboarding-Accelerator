import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { OnboardingTaskStatus } from '@onboarding/shared';
import {
  ActiveOnboardingPlanError,
  type CancelOnboardingPlanInput,
  type CancelOnboardingPlanResult,
  type CreateOnboardingPlanInput,
  type MutateOnboardingPlanInput,
  type MutateOnboardingPlanResult,
  type OnboardingPlanAggregate,
  type OnboardingRepository,
  type StoredJourneyDefinitionVersion,
  type StoredOnboardingPlan,
  type StoredPlanRevisionEvent,
  type StoredRoadmapProposal,
  type StoredStageDefinition,
  type StoredTaskInstance,
  type TransitionTaskInput,
  type TransitionTaskResult,
} from './onboarding.repository';

type Database = PrismaClient | Prisma.TransactionClient;

export class PrismaOnboardingRepository implements OnboardingRepository {
  constructor(private readonly db: PrismaClient) {}

  async getActive(_sessionId: string, ownerId: string): Promise<OnboardingPlanAggregate | null> {
    const plan = await this.db.onboardingPlan.findFirst({
      where: { ownerId, status: 'active' },
      select: { id: true },
    });
    return plan ? loadAggregate(this.db, plan.id) : null;
  }

  async createPlan(
    input: CreateOnboardingPlanInput,
  ): Promise<{ aggregate: OnboardingPlanAggregate; idempotentReplay: boolean }> {
    const duplicate = await this.db.onboardingPlan.findFirst({
      where: {
        ownerId: input.plan.ownerId,
        creationRequestId: input.plan.creationRequestId,
      },
      select: { id: true },
    });
    if (duplicate) {
      return { aggregate: await loadAggregate(this.db, duplicate.id), idempotentReplay: true };
    }

    const active = await this.db.onboardingPlan.findFirst({
      where: {
        ownerId: input.plan.ownerId,
        status: 'active',
      },
      select: { id: true },
    });
    if (active) throw new ActiveOnboardingPlanError();

    try {
      const planId = await this.db.$transaction(async (transaction) => {
        await transaction.onboardingJourneyVersion.create({
          data: {
            id: input.definition.id,
            ownerId: input.definition.ownerId,
            title: input.definition.title,
            stages: toJson(input.definition.stages),
            sourceReferences: toJson(input.definition.sourceReferences),
            supersedesVersionId: input.definition.supersedesVersionId,
            changeSource: input.definition.changeSource ?? 'created',
            createdBy: input.definition.createdBy,
            createdAt: new Date(input.definition.createdAt),
          },
        });
        await transaction.onboardingPlan.create({
          data: {
            id: input.plan.id,
            sessionId: input.plan.sessionId,
            ownerId: input.plan.ownerId,
            definitionVersionId: input.plan.definitionVersionId,
            creationRequestId: input.plan.creationRequestId,
            title: input.plan.title,
            status: input.plan.status,
            startAt: new Date(input.plan.startAt),
            targetAt: input.plan.targetAt ? new Date(input.plan.targetAt) : undefined,
            revision: input.plan.revision,
            createdAt: new Date(input.plan.createdAt),
            startedAt: new Date(input.plan.startedAt),
            taskInstances: {
              create: input.tasks.map((task) => ({
                id: task.id,
                definitionId: task.definitionId,
                stableKey: task.stableKey,
                stageId: task.stageId,
                status: task.status,
                dueAt: task.dueAt ? new Date(task.dueAt) : undefined,
                revision: task.revision,
              })),
            },
          },
        });
        await transaction.onboardingPlanRevisionEvent.create({
          data: toRevisionEventCreate(input.creationEvent),
        });
        return input.plan.id;
      });
      return { aggregate: await loadAggregate(this.db, planId), idempotentReplay: false };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const replay = await this.db.onboardingPlan.findFirst({
        where: {
          ownerId: input.plan.ownerId,
          creationRequestId: input.plan.creationRequestId,
        },
        select: { id: true },
      });
      if (replay) {
        return { aggregate: await loadAggregate(this.db, replay.id), idempotentReplay: true };
      }
      throw new ActiveOnboardingPlanError();
    }
  }

  async transitionTask(input: TransitionTaskInput): Promise<TransitionTaskResult> {
    try {
      return await this.db.$transaction(async (transaction) => {
        const plan = await transaction.onboardingPlan.findFirst({
          where: {
            ownerId: input.ownerId,
            status: 'active',
          },
          include: { taskInstances: true },
        });
        if (!plan) return { kind: 'not_found' } as const;

        const duplicate = await transaction.onboardingTaskEvent.findFirst({
          where: { planId: plan.id, idempotencyKey: input.idempotencyKey },
          select: { taskId: true, toStatus: true, source: true },
        });
        if (duplicate) {
          return duplicate.taskId === input.taskId &&
            duplicate.toStatus === input.status &&
            duplicate.source === input.source
            ? ({
                kind: 'duplicate',
                aggregate: await loadAggregate(transaction, plan.id),
              } as const)
            : ({ kind: 'idempotency_conflict' } as const);
        }

        const task = plan.taskInstances.find((candidate) => candidate.id === input.taskId);
        if (!task) return { kind: 'not_found' } as const;
        if (task.revision !== input.expectedRevision) {
          return { kind: 'revision_conflict', actualRevision: task.revision } as const;
        }
        if (task.status === input.status) return { kind: 'no_change' } as const;

        const updated = await transaction.onboardingTaskInstance.updateMany({
          where: { id: task.id, planId: plan.id, revision: input.expectedRevision },
          data: {
            status: input.status,
            revision: { increment: 1 },
            completedAt: input.status === 'completed' ? new Date(input.changedAt) : null,
            completedBy: input.status === 'completed' ? input.actorId : null,
          },
        });
        if (updated.count !== 1) {
          const latest = await transaction.onboardingTaskInstance.findUnique({
            where: { id: task.id },
            select: { revision: true },
          });
          return {
            kind: 'revision_conflict',
            actualRevision: latest?.revision ?? task.revision,
          } as const;
        }

        await transaction.onboardingPlan.update({
          where: { id: plan.id },
          data: { revision: { increment: 1 } },
        });
        await transaction.onboardingTaskEvent.create({
          data: {
            id: randomUUID(),
            planId: plan.id,
            taskId: task.id,
            actorId: input.actorId,
            fromStatus: task.status,
            toStatus: input.status,
            source: input.source,
            idempotencyKey: input.idempotencyKey,
            taskRevision: task.revision + 1,
            planRevision: plan.revision + 1,
            createdAt: new Date(input.changedAt),
          },
        });
        return { kind: 'updated', aggregate: await loadAggregate(transaction, plan.id) } as const;
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const aggregate = await this.getActive(input.sessionId, input.ownerId);
      if (!aggregate) return { kind: 'not_found' };
      const duplicate = await this.db.onboardingTaskEvent.findFirst({
        where: { planId: aggregate.plan.id, idempotencyKey: input.idempotencyKey },
        select: { taskId: true, toStatus: true, source: true },
      });
      return duplicate &&
        duplicate.taskId === input.taskId &&
        duplicate.toStatus === input.status &&
        duplicate.source === input.source
        ? { kind: 'duplicate', aggregate }
        : duplicate
          ? { kind: 'idempotency_conflict' }
          : { kind: 'revision_conflict', actualRevision: input.expectedRevision };
    }
  }

  async mutatePlan(input: MutateOnboardingPlanInput): Promise<MutateOnboardingPlanResult> {
    try {
      return await this.db.$transaction(async (transaction) => {
        const plan = await transaction.onboardingPlan.findFirst({
          where: { ownerId: input.ownerId, status: 'active' },
          select: { id: true, revision: true },
        });
        if (!plan) return { kind: 'not_found' } as const;
        const duplicate = await transaction.onboardingPlanRevisionEvent.findFirst({
          where: { planId: plan.id, idempotencyKey: input.idempotencyKey },
        });
        if (duplicate) {
          return duplicate.commandType === input.commandType
            ? ({
                kind: 'duplicate',
                aggregate: await loadAggregate(transaction, plan.id),
                event: toStoredRevisionEvent(duplicate),
              } as const)
            : ({ kind: 'idempotency_conflict' } as const);
        }
        if (plan.revision !== input.expectedPlanRevision) {
          return { kind: 'revision_conflict', actualRevision: plan.revision } as const;
        }
        if (input.proposalId) {
          const proposal = await transaction.onboardingAiProposal.updateMany({
            where: {
              id: input.proposalId,
              planId: plan.id,
              ownerId: input.ownerId,
              status: 'pending',
            },
            data: { status: 'applied', appliedAt: new Date(input.changedAt) },
          });
          if (proposal.count !== 1) return { kind: 'proposal_conflict' } as const;
        }

        await transaction.onboardingJourneyVersion.create({
          data: {
            id: input.aggregate.definition.id,
            ownerId: input.aggregate.definition.ownerId,
            title: input.aggregate.definition.title,
            stages: toJson(input.aggregate.definition.stages),
            sourceReferences: toJson(input.aggregate.definition.sourceReferences),
            supersedesVersionId: input.aggregate.definition.supersedesVersionId,
            changeSource: input.aggregate.definition.changeSource ?? input.commandType,
            createdBy: input.actorId,
            createdAt: new Date(input.changedAt),
          },
        });
        const updated = await transaction.onboardingPlan.updateMany({
          where: { id: plan.id, ownerId: input.ownerId, revision: input.expectedPlanRevision },
          data: {
            definitionVersionId: input.aggregate.definition.id,
            title: input.aggregate.plan.title,
            startAt: new Date(input.aggregate.plan.startAt),
            targetAt: input.aggregate.plan.targetAt
              ? new Date(input.aggregate.plan.targetAt)
              : null,
            revision: input.aggregate.plan.revision,
          },
        });
        if (updated.count !== 1) {
          const latest = await transaction.onboardingPlan.findUnique({
            where: { id: plan.id },
            select: { revision: true },
          });
          return {
            kind: 'revision_conflict',
            actualRevision: latest?.revision ?? plan.revision,
          } as const;
        }

        if (input.retiredTaskIds.length) {
          await transaction.onboardingTaskInstance.updateMany({
            where: { planId: plan.id, id: { in: input.retiredTaskIds }, retiredAt: null },
            data: { retiredAt: new Date(input.changedAt), retiredReason: input.commandType },
          });
        }
        for (const task of input.aggregate.tasks) {
          await transaction.onboardingTaskInstance.upsert({
            where: { id: task.id },
            create: {
              id: task.id,
              planId: plan.id,
              definitionId: task.definitionId,
              stableKey: task.stableKey,
              stageId: task.stageId,
              status: task.status,
              dueAt: task.dueAt ? new Date(task.dueAt) : undefined,
              completedAt: task.completedAt ? new Date(task.completedAt) : undefined,
              completedBy: task.completedBy,
              revision: task.revision,
            },
            update: {
              definitionId: task.definitionId,
              stageId: task.stageId,
              status: task.status,
              dueAt: task.dueAt ? new Date(task.dueAt) : null,
              completedAt: task.completedAt ? new Date(task.completedAt) : null,
              completedBy: task.completedBy ?? null,
              revision: task.revision,
              retiredAt: null,
              retiredReason: null,
            },
          });
        }
        for (const event of input.resetEvents) {
          await transaction.onboardingTaskEvent.create({
            data: {
              id: event.id,
              planId: event.planId,
              taskId: event.taskId,
              actorId: event.actorId,
              fromStatus: event.fromStatus,
              toStatus: event.toStatus,
              source: event.source,
              idempotencyKey: event.idempotencyKey,
              taskRevision: event.taskRevision,
              planRevision: event.planRevision,
              createdAt: new Date(event.createdAt),
            },
          });
        }
        const event = await transaction.onboardingPlanRevisionEvent.create({
          data: {
            id: randomUUID(),
            planId: plan.id,
            ownerId: input.ownerId,
            actorId: input.actorId,
            fromDefinitionVersionId: input.aggregate.definition.supersedesVersionId,
            toDefinitionVersionId: input.aggregate.definition.id,
            planRevision: input.aggregate.plan.revision,
            commandType: input.commandType,
            idempotencyKey: input.idempotencyKey,
            contentHash: input.contentHash,
            impact: toJson(input.impact),
            createdAt: new Date(input.changedAt),
          },
        });
        return {
          kind: 'updated',
          aggregate: await loadAggregate(transaction, plan.id),
          event: toStoredRevisionEvent(event),
        } as const;
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const aggregate = await this.getActive(input.sessionId, input.ownerId);
      if (!aggregate) return { kind: 'not_found' };
      const duplicate = await this.db.onboardingPlanRevisionEvent.findFirst({
        where: { planId: aggregate.plan.id, idempotencyKey: input.idempotencyKey },
      });
      return duplicate && duplicate.commandType === input.commandType
        ? { kind: 'duplicate', aggregate, event: toStoredRevisionEvent(duplicate) }
        : duplicate
          ? { kind: 'idempotency_conflict' }
          : { kind: 'revision_conflict', actualRevision: aggregate.plan.revision };
    }
  }

  async saveProposal(proposal: StoredRoadmapProposal): Promise<void> {
    await this.db.onboardingAiProposal.create({
      data: {
        id: proposal.id,
        planId: proposal.planId,
        ownerId: proposal.ownerId,
        basePlanRevision: proposal.basePlanRevision,
        baseContentHash: proposal.baseContentHash,
        proposalHash: proposal.proposalHash,
        operations: toJson(proposal.operations),
        rationale: proposal.rationale,
        assumptions: toJson(proposal.assumptions),
        warnings: toJson(proposal.warnings),
        sourceReferences: toJson(proposal.sourceReferences),
        impact: toJson(proposal.progressImpact),
        status: proposal.status,
        expiresAt: new Date(proposal.expiresAt),
        createdAt: new Date(proposal.createdAt),
      },
    });
  }

  async getProposal(id: string, ownerId: string): Promise<StoredRoadmapProposal | null> {
    const proposal = await this.db.onboardingAiProposal.findFirst({ where: { id, ownerId } });
    return proposal ? toStoredProposal(proposal) : null;
  }

  async dismissProposal(id: string, ownerId: string): Promise<boolean> {
    const result = await this.db.onboardingAiProposal.updateMany({
      where: { id, ownerId, status: 'pending' },
      data: { status: 'dismissed' },
    });
    return result.count === 1;
  }

  async listRevisionEvents(planId: string, ownerId: string): Promise<StoredPlanRevisionEvent[]> {
    const events = await this.db.onboardingPlanRevisionEvent.findMany({
      where: { planId, ownerId },
      orderBy: { planRevision: 'desc' },
    });
    return events.map(toStoredRevisionEvent);
  }

  async getRevisionEventByIdempotency(
    ownerId: string,
    idempotencyKey: string,
  ): Promise<StoredPlanRevisionEvent | null> {
    const event = await this.db.onboardingPlanRevisionEvent.findFirst({
      where: { ownerId, idempotencyKey },
    });
    return event ? toStoredRevisionEvent(event) : null;
  }

  async cancelPlan(input: CancelOnboardingPlanInput): Promise<CancelOnboardingPlanResult> {
    return this.db.$transaction(async (transaction) => {
      const plan = await transaction.onboardingPlan.findFirst({
        where: { ownerId: input.ownerId, status: 'active' },
        include: { taskInstances: { where: { retiredAt: null } } },
      });
      if (!plan) {
        const duplicate = await transaction.onboardingPlanRevisionEvent.findFirst({
          where: {
            ownerId: input.ownerId,
            idempotencyKey: input.idempotencyKey,
            commandType: 'cancel_plan',
          },
        });
        return duplicate
          ? ({ kind: 'duplicate', planId: duplicate.planId } as const)
          : ({ kind: 'not_found' } as const);
      }
      if (plan.revision !== input.expectedPlanRevision) {
        return { kind: 'revision_conflict', actualRevision: plan.revision } as const;
      }
      await transaction.onboardingPlan.update({
        where: { id: plan.id },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(input.changedAt),
          cancellationReason: input.reason,
          revision: { increment: 1 },
        },
      });
      await transaction.onboardingPlanRevisionEvent.create({
        data: {
          id: randomUUID(),
          planId: plan.id,
          ownerId: input.ownerId,
          actorId: input.actorId,
          fromDefinitionVersionId: plan.definitionVersionId,
          toDefinitionVersionId: plan.definitionVersionId,
          planRevision: plan.revision + 1,
          commandType: 'cancel_plan',
          idempotencyKey: input.idempotencyKey,
          contentHash: '',
          impact: toJson({
            tasksAdded: 0,
            tasksRetired: plan.taskInstances.length,
            completedTasksRetained: 0,
            completedTasksReset: 0,
            destructive: true,
          }),
          createdAt: new Date(input.changedAt),
        },
      });
      return { kind: 'cancelled', planId: plan.id } as const;
    });
  }
}

async function loadAggregate(db: Database, planId: string): Promise<OnboardingPlanAggregate> {
  const row = await db.onboardingPlan.findUnique({
    where: { id: planId },
    include: { definitionVersion: true, taskInstances: { where: { retiredAt: null } } },
  });
  if (!row) throw new Error(`Missing onboarding plan: ${planId}`);
  const definition: StoredJourneyDefinitionVersion = {
    id: row.definitionVersion.id,
    // Canonical journey versions are system-owned and therefore have no definition owner. The
    // legacy aggregate contract still requires an owner, so use the plan owner when a canonical
    // state is encountered through the compatibility read path.
    ownerId: row.definitionVersion.ownerId ?? row.ownerId,
    title: row.definitionVersion.title,
    ...(row.definitionVersion.supersedesVersionId
      ? { supersedesVersionId: row.definitionVersion.supersedesVersionId }
      : {}),
    changeSource: row.definitionVersion.changeSource,
    ...(row.definitionVersion.createdBy ? { createdBy: row.definitionVersion.createdBy } : {}),
    createdAt: row.definitionVersion.createdAt.toISOString(),
    sourceReferences: structuredClone(row.definitionVersion.sourceReferences) as string[],
    stages: structuredClone(row.definitionVersion.stages) as unknown as StoredStageDefinition[],
  };
  const plan: StoredOnboardingPlan = {
    id: row.id,
    ...(row.sessionId ? { sessionId: row.sessionId } : {}),
    ownerId: row.ownerId,
    definitionVersionId: row.definitionVersionId,
    creationRequestId: row.creationRequestId,
    title: row.title,
    status: row.status as StoredOnboardingPlan['status'],
    startAt: row.startAt.toISOString(),
    ...(row.targetAt ? { targetAt: row.targetAt.toISOString() } : {}),
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt.toISOString(),
    ...(row.cancelledAt ? { cancelledAt: row.cancelledAt.toISOString() } : {}),
    ...(row.cancellationReason ? { cancellationReason: row.cancellationReason } : {}),
  };
  const tasks: StoredTaskInstance[] = row.taskInstances.map((task) => ({
    id: task.id,
    planId: task.planId,
    definitionId: task.definitionId,
    stableKey: task.stableKey,
    stageId: task.stageId,
    status: task.status as OnboardingTaskStatus,
    ...(task.dueAt ? { dueAt: task.dueAt.toISOString() } : {}),
    ...(task.completedAt ? { completedAt: task.completedAt.toISOString() } : {}),
    ...(task.completedBy ? { completedBy: task.completedBy } : {}),
    revision: task.revision,
    ...(task.retiredAt ? { retiredAt: task.retiredAt.toISOString() } : {}),
    ...(task.retiredReason ? { retiredReason: task.retiredReason } : {}),
  }));
  return { definition, plan, tasks };
}

function toRevisionEventCreate(event: StoredPlanRevisionEvent) {
  return {
    id: event.id,
    planId: event.planId,
    ownerId: event.ownerId,
    actorId: event.actorId,
    fromDefinitionVersionId: event.fromDefinitionVersionId,
    toDefinitionVersionId: event.toDefinitionVersionId,
    planRevision: event.planRevision,
    commandType: event.commandType,
    idempotencyKey: event.idempotencyKey,
    contentHash: event.contentHash,
    impact: toJson(event.impact),
    createdAt: new Date(event.createdAt),
  };
}

function toStoredRevisionEvent(row: {
  id: string;
  planId: string;
  ownerId: string;
  actorId: string;
  fromDefinitionVersionId: string | null;
  toDefinitionVersionId: string;
  planRevision: number;
  commandType: string;
  idempotencyKey: string;
  contentHash: string;
  impact: unknown;
  createdAt: Date;
}): StoredPlanRevisionEvent {
  return {
    id: row.id,
    planId: row.planId,
    ownerId: row.ownerId,
    actorId: row.actorId,
    ...(row.fromDefinitionVersionId
      ? { fromDefinitionVersionId: row.fromDefinitionVersionId }
      : {}),
    toDefinitionVersionId: row.toDefinitionVersionId,
    planRevision: row.planRevision,
    commandType: row.commandType,
    idempotencyKey: row.idempotencyKey,
    contentHash: row.contentHash,
    impact: structuredClone(row.impact) as StoredPlanRevisionEvent['impact'],
    createdAt: row.createdAt.toISOString(),
  };
}

function toStoredProposal(row: {
  id: string;
  planId: string;
  ownerId: string;
  basePlanRevision: number;
  baseContentHash: string;
  proposalHash: string;
  operations: unknown;
  rationale: string;
  assumptions: unknown;
  warnings: unknown;
  sourceReferences: unknown;
  impact: unknown;
  status: string;
  expiresAt: Date;
  createdAt: Date;
  appliedAt: Date | null;
}): StoredRoadmapProposal {
  return {
    id: row.id,
    planId: row.planId,
    ownerId: row.ownerId,
    basePlanRevision: row.basePlanRevision,
    baseContentHash: row.baseContentHash,
    proposalHash: row.proposalHash,
    operations: structuredClone(row.operations) as StoredRoadmapProposal['operations'],
    rationale: row.rationale,
    assumptions: structuredClone(row.assumptions) as string[],
    warnings: structuredClone(row.warnings) as string[],
    progressImpact: structuredClone(row.impact) as StoredRoadmapProposal['progressImpact'],
    sourceReferences: structuredClone(row.sourceReferences) as string[],
    status: row.status as StoredRoadmapProposal['status'],
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    ...(row.appliedAt ? { appliedAt: row.appliedAt.toISOString() } : {}),
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
