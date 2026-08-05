import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { OnboardingTaskStatus } from '@onboarding/shared';
import {
  ActiveOnboardingPlanError,
  type CreateOnboardingPlanInput,
  type OnboardingPlanAggregate,
  type OnboardingRepository,
  type StoredJourneyDefinitionVersion,
  type StoredOnboardingPlan,
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
        activationRequestId: input.plan.activationRequestId,
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
            createdAt: new Date(input.definition.createdAt),
          },
        });
        await transaction.onboardingPlan.create({
          data: {
            id: input.plan.id,
            sessionId: input.plan.sessionId,
            ownerId: input.plan.ownerId,
            definitionVersionId: input.plan.definitionVersionId,
            activationRequestId: input.plan.activationRequestId,
            title: input.plan.title,
            status: input.plan.status,
            startAt: new Date(input.plan.startAt),
            targetAt: input.plan.targetAt ? new Date(input.plan.targetAt) : undefined,
            revision: input.plan.revision,
            createdAt: new Date(input.plan.createdAt),
            activatedAt: new Date(input.plan.activatedAt),
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
        return input.plan.id;
      });
      return { aggregate: await loadAggregate(this.db, planId), idempotentReplay: false };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const replay = await this.db.onboardingPlan.findFirst({
        where: {
          ownerId: input.plan.ownerId,
          activationRequestId: input.plan.activationRequestId,
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
}

async function loadAggregate(db: Database, planId: string): Promise<OnboardingPlanAggregate> {
  const row = await db.onboardingPlan.findUnique({
    where: { id: planId },
    include: { definitionVersion: true, taskInstances: true },
  });
  if (!row) throw new Error(`Missing onboarding plan: ${planId}`);
  const definition: StoredJourneyDefinitionVersion = {
    id: row.definitionVersion.id,
    ownerId: row.definitionVersion.ownerId,
    title: row.definitionVersion.title,
    createdAt: row.definitionVersion.createdAt.toISOString(),
    stages: structuredClone(row.definitionVersion.stages) as unknown as StoredStageDefinition[],
  };
  const plan: StoredOnboardingPlan = {
    id: row.id,
    ...(row.sessionId ? { sessionId: row.sessionId } : {}),
    ownerId: row.ownerId,
    definitionVersionId: row.definitionVersionId,
    activationRequestId: row.activationRequestId,
    title: row.title,
    status: row.status as StoredOnboardingPlan['status'],
    startAt: row.startAt.toISOString(),
    ...(row.targetAt ? { targetAt: row.targetAt.toISOString() } : {}),
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    activatedAt: row.activatedAt.toISOString(),
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
  }));
  return { definition, plan, tasks };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
