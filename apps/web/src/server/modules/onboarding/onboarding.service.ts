import { randomUUID } from 'node:crypto';
import type {
  ActivateOnboardingPlanRequest,
  OnboardingTaskStatus,
  TransitionOnboardingTaskRequest,
  TransitionOnboardingTaskResponse,
  WorkspaceOnboardingState,
} from '@onboarding/shared';
import type { AuthenticatedUser } from '../../auth';
import { AppError } from '../../core/errors/appError';
import type { SessionRepository } from '../../sessionRepository';
import { calculateOnboardingProjection } from './onboardingProjection';
import {
  ActiveOnboardingPlanError,
  type CreateOnboardingPlanInput,
  type OnboardingPlanAggregate,
  type OnboardingRepository,
  type StoredStageDefinition,
} from './onboarding.repository';

export class OnboardingService {
  constructor(
    private readonly repository: OnboardingRepository,
    private readonly sessions: SessionRepository,
  ) {}

  async get(sessionId: string, ownerId: string): Promise<WorkspaceOnboardingState> {
    await this.sessions.get(sessionId, ownerId);
    const aggregate = await this.repository.getActive(sessionId, ownerId);
    return aggregate
      ? { status: 'ready', projection: calculateOnboardingProjection(aggregate) }
      : { status: 'empty', reason: 'no-active-plan' };
  }

  async activate(
    sessionId: string,
    input: ActivateOnboardingPlanRequest,
    actor: AuthenticatedUser,
  ): Promise<TransitionOnboardingTaskResponse> {
    await this.sessions.get(sessionId, actor.id);
    const creation = createPlanInput(sessionId, input, actor.id);
    try {
      const result = await this.repository.createPlan(creation);
      return {
        state: { status: 'ready', projection: calculateOnboardingProjection(result.aggregate) },
        idempotentReplay: result.idempotentReplay,
      };
    } catch (error) {
      if (error instanceof ActiveOnboardingPlanError) {
        throw AppError.conflict(error.message);
      }
      throw error;
    }
  }

  async transitionTask(
    sessionId: string,
    taskId: string,
    input: TransitionOnboardingTaskRequest,
    actor: AuthenticatedUser,
  ): Promise<TransitionOnboardingTaskResponse> {
    await this.sessions.get(sessionId, actor.id);
    const aggregate = await this.repository.getActive(sessionId, actor.id);
    if (!aggregate) throw AppError.notFound('No active onboarding plan was found.');
    const task = aggregate.tasks.find((candidate) => candidate.id === taskId);
    if (!task) throw AppError.notFound('Onboarding task not found.');

    if (task.status !== input.status && !canTransition(task.status, input.status, actor.role)) {
      throw AppError.conflict(`Task cannot transition from ${task.status} to ${input.status}.`);
    }
    assertDependenciesSatisfied(aggregate, task.definitionId, input.status);

    const result = await this.repository.transitionTask({
      ownerId: actor.id,
      sessionId,
      taskId,
      status: input.status,
      expectedRevision: input.expectedRevision,
      idempotencyKey: input.idempotencyKey,
      source: input.source,
      actorId: actor.id,
      changedAt: new Date().toISOString(),
    });
    if (result.kind === 'not_found') throw AppError.notFound('Onboarding task not found.');
    if (result.kind === 'no_change') {
      throw AppError.conflict('Task is already in the requested state.');
    }
    if (result.kind === 'idempotency_conflict') {
      throw AppError.conflict('Idempotency key was already used for a different task command.');
    }
    if (result.kind === 'revision_conflict') {
      throw new AppError('CONFLICT', 'Task was changed by another request.', {
        actualRevision: result.actualRevision,
      });
    }
    return {
      state: { status: 'ready', projection: calculateOnboardingProjection(result.aggregate) },
      idempotentReplay: result.kind === 'duplicate',
    };
  }
}

function createPlanInput(
  sessionId: string,
  input: ActivateOnboardingPlanRequest,
  ownerId: string,
): CreateOnboardingPlanInput {
  validateDefinition(input);
  const now = new Date().toISOString();
  const startAt = input.startAt ?? now;
  const definitionId = input.definitionVersionId ?? randomUUID();
  const stages: StoredStageDefinition[] = input.stages.map((stage) => {
    const stageId = randomUUID();
    return {
      id: stageId,
      stableKey: stage.stableKey,
      title: stage.title,
      description: stage.description,
      position: stage.position,
      ...(stage.guideStepId ? { guideStepId: stage.guideStepId } : {}),
      dependsOnStageKeys: stage.dependsOnStageKeys ?? [],
      tasks: stage.tasks.map((task) => ({
        id: randomUUID(),
        stableKey: task.stableKey,
        title: task.title,
        ...(task.description ? { description: task.description } : {}),
        required: task.required ?? true,
        countsTowardProgress: task.countsTowardProgress ?? true,
        weight: task.weight ?? 1,
        ...(task.dueOffsetDays !== undefined ? { dueOffsetDays: task.dueOffsetDays } : {}),
        dependsOnTaskKeys: task.dependsOnTaskKeys ?? [],
      })),
    };
  });
  const planId = randomUUID();
  return {
    definition: {
      id: definitionId,
      ownerId,
      title: input.title,
      createdAt: now,
      stages,
    },
    plan: {
      id: planId,
      sessionId,
      ownerId,
      definitionVersionId: definitionId,
      activationRequestId: input.clientRequestId,
      title: input.title,
      status: 'active',
      startAt,
      ...(input.targetAt ? { targetAt: input.targetAt } : {}),
      revision: 0,
      createdAt: now,
      activatedAt: now,
    },
    tasks: stages.flatMap((stage) =>
      stage.tasks.map((task) => ({
        id: randomUUID(),
        planId,
        definitionId: task.id,
        stableKey: task.stableKey,
        stageId: stage.id,
        status: 'not_started' as const,
        ...(task.dueOffsetDays !== undefined
          ? { dueAt: addDays(startAt, task.dueOffsetDays) }
          : {}),
        revision: 0,
      })),
    ),
  };
}

function validateDefinition(input: ActivateOnboardingPlanRequest): void {
  if (input.approved !== true) throw AppError.validation('Plan activation requires approval.');
  if (input.stages.length === 0)
    throw AppError.validation('At least one roadmap stage is required.');
  const stageKeys = new Set<string>();
  const taskKeys = new Set<string>();
  const positions = new Set<number>();
  for (const stage of input.stages) {
    if (stageKeys.has(stage.stableKey)) throw AppError.validation('Stage keys must be unique.');
    if (positions.has(stage.position)) throw AppError.validation('Stage positions must be unique.');
    stageKeys.add(stage.stableKey);
    positions.add(stage.position);
    for (const task of stage.tasks) {
      if (taskKeys.has(task.stableKey)) throw AppError.validation('Task keys must be unique.');
      taskKeys.add(task.stableKey);
    }
  }
  for (const stage of input.stages) {
    if ((stage.dependsOnStageKeys ?? []).some((key) => !stageKeys.has(key))) {
      throw AppError.validation(`Stage ${stage.stableKey} has an unknown dependency.`);
    }
    for (const task of stage.tasks) {
      if ((task.dependsOnTaskKeys ?? []).some((key) => !taskKeys.has(key))) {
        throw AppError.validation(`Task ${task.stableKey} has an unknown dependency.`);
      }
    }
  }
  assertAcyclic(
    input.stages.map((stage) => ({
      key: stage.stableKey,
      dependencies: stage.dependsOnStageKeys ?? [],
    })),
    'stage',
  );
  assertAcyclic(
    input.stages.flatMap((stage) =>
      stage.tasks.map((task) => ({
        key: task.stableKey,
        dependencies: task.dependsOnTaskKeys ?? [],
      })),
    ),
    'task',
  );
}

function assertAcyclic(nodes: Array<{ key: string; dependencies: string[] }>, label: string): void {
  const dependencies = new Map(nodes.map((node) => [node.key, node.dependencies]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string) => {
    if (visiting.has(key)) throw AppError.validation(`The ${label} dependency graph is cyclic.`);
    if (visited.has(key)) return;
    visiting.add(key);
    for (const dependency of dependencies.get(key) ?? []) visit(dependency);
    visiting.delete(key);
    visited.add(key);
  };
  for (const node of nodes) visit(node.key);
}

function canTransition(
  from: OnboardingTaskStatus,
  to: OnboardingTaskStatus,
  role: string | undefined,
): boolean {
  if (to === 'waived' || from === 'waived' || from === 'completed') return role === 'admin';
  const allowed: Record<OnboardingTaskStatus, OnboardingTaskStatus[]> = {
    not_started: ['in_progress', 'blocked', 'completed'],
    in_progress: ['not_started', 'blocked', 'completed'],
    blocked: ['in_progress', 'completed'],
    completed: [],
    waived: [],
  };
  return allowed[from].includes(to);
}

function assertDependenciesSatisfied(
  aggregate: OnboardingPlanAggregate,
  taskDefinitionId: string,
  targetStatus: OnboardingTaskStatus,
): void {
  if (targetStatus !== 'in_progress' && targetStatus !== 'completed') return;
  const stage = aggregate.definition.stages.find((candidate) =>
    candidate.tasks.some((task) => task.id === taskDefinitionId),
  );
  const definition = stage?.tasks.find((task) => task.id === taskDefinitionId);
  if (!stage || !definition) throw AppError.conflict('Task definition is unavailable.');
  const instanceByDefinitionId = new Map(aggregate.tasks.map((task) => [task.definitionId, task]));
  const definitionByKey = new Map(
    aggregate.definition.stages.flatMap((candidate) =>
      candidate.tasks.map((task) => [task.stableKey, task] as const),
    ),
  );
  for (const dependencyKey of definition.dependsOnTaskKeys) {
    const dependency = definitionByKey.get(dependencyKey);
    const instance = dependency ? instanceByDefinitionId.get(dependency.id) : undefined;
    if (!instance || (instance.status !== 'completed' && instance.status !== 'waived')) {
      throw AppError.conflict(`Complete task ${dependencyKey} before starting this task.`);
    }
  }

  const stageByKey = new Map(
    aggregate.definition.stages.map((candidate) => [candidate.stableKey, candidate]),
  );
  for (const dependencyKey of stage.dependsOnStageKeys) {
    const dependency = stageByKey.get(dependencyKey);
    const requiredTasks = dependency?.tasks.filter((task) => task.required) ?? [];
    const completionTasks = requiredTasks.length ? requiredTasks : (dependency?.tasks ?? []);
    if (
      completionTasks.length === 0 ||
      completionTasks.some((task) => {
        const instance = instanceByDefinitionId.get(task.id);
        return !instance || (instance.status !== 'completed' && instance.status !== 'waived');
      })
    ) {
      throw AppError.conflict(`Complete stage ${dependencyKey} before starting this task.`);
    }
  }
}

function addDays(value: string, days: number): string {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}
