import { randomUUID } from 'node:crypto';
import type {
  ApplyRoadmapAiProposalRequest,
  CancelOnboardingPlanRequest,
  CreateOnboardingPlanRequest,
  GenerateOnboardingPlanRequest,
  LegacyWorkspaceOnboardingState,
  MutateOnboardingRoadmapResponse,
  OnboardingCancellationImpact,
  OnboardingPlanHistoryResponse,
  OnboardingPlanRevisionEvent,
  OnboardingTaskMutationSource,
  OnboardingTaskStatus,
  RequestRoadmapAiProposal,
  RoadmapCommand,
  RoadmapChangeProposal,
  RoadmapCommandRequest,
} from '@onboarding/shared';
import type { AuthenticatedUser } from '../../auth';
import { AppError } from '../../core/errors/appError';
import type { SessionRepository } from '../../sessionRepository';
import type { OnboardingRoadmapAgent } from './onboarding.agent';
import {
  ActiveOnboardingPlanError,
  type CreateOnboardingPlanInput,
  type OnboardingPlanAggregate,
  type OnboardingRepository,
  type StoredPlanRevisionEvent,
  type StoredRoadmapProposal,
} from './onboarding.repository';
import {
  createStoredStages,
  hashDefinition,
  hashValue,
  prepareRoadmapMutation,
  type PreparedRoadmapMutation,
} from './onboardingRoadmap';
import { calculateOnboardingProjection } from './onboardingProjection';

type ResolveAccessScopes = (ownerId: string) => Promise<string[]>;

/** @deprecated Input retained only for the session-scoped compatibility service. */
interface LegacyTransitionOnboardingTaskRequest {
  status: OnboardingTaskStatus;
  expectedRevision: number;
  idempotencyKey: string;
  source: OnboardingTaskMutationSource;
}

/** @deprecated Response retained only for the session-scoped compatibility service. */
interface LegacyOnboardingMutationResponse {
  state: LegacyWorkspaceOnboardingState;
  idempotentReplay: boolean;
}

export class OnboardingService {
  constructor(
    private readonly repository: OnboardingRepository,
    private readonly sessions: SessionRepository,
    private readonly agent?: OnboardingRoadmapAgent,
    private readonly resolveAccessScopes: ResolveAccessScopes = async () => ['all_users'],
  ) {}

  async get(sessionId: string, ownerId: string): Promise<LegacyWorkspaceOnboardingState> {
    await this.sessions.get(sessionId, ownerId);
    const aggregate = await this.repository.getActive(sessionId, ownerId);
    return aggregate
      ? { status: 'ready', projection: calculateOnboardingProjection(aggregate) }
      : { status: 'empty', reason: 'no-active-plan' };
  }

  async create(
    sessionId: string,
    input: CreateOnboardingPlanRequest,
    actor: AuthenticatedUser,
  ): Promise<LegacyOnboardingMutationResponse> {
    await this.sessions.get(sessionId, actor.id);
    return this.createPrepared(sessionId, input, actor, 'manual');
  }

  async generate(
    sessionId: string,
    input: GenerateOnboardingPlanRequest,
    actor: AuthenticatedUser,
  ): Promise<LegacyOnboardingMutationResponse> {
    await this.sessions.get(sessionId, actor.id);
    const existing = await this.repository.getActive(sessionId, actor.id);
    if (existing) {
      if (existing.plan.creationRequestId === input.clientRequestId) {
        return {
          state: { status: 'ready', projection: calculateOnboardingProjection(existing) },
          idempotentReplay: true,
        };
      }
      const replay = await this.replayMutation(existing, input.clientRequestId, 'generate_plan');
      if (replay) return replay;
      if (!isEmptyRoadmap(existing)) {
        throw AppError.conflict('An active onboarding plan already exists.');
      }
    }
    if (!this.agent) {
      throw AppError.featureDisabled('AI roadmap generation is not configured.');
    }
    const generated = await this.agent.generate(input, await this.resolveAccessScopes(actor.id));
    if (existing) {
      const commands: RoadmapCommand[] = [
        {
          type: 'set_metadata',
          title: input.title ?? generated.title,
          ...(input.startAt ? { startAt: input.startAt } : {}),
          ...(input.targetAt ? { targetAt: input.targetAt } : {}),
        },
        ...generated.stages.map((stage) => ({
          type: 'add_stage' as const,
          stage: {
            stableKey: stage.stableKey,
            title: stage.title,
            description: stage.description,
            ...(stage.guideStepId ? { guideStepId: stage.guideStepId } : {}),
            ...(stage.dependsOnStageKeys ? { dependsOnStageKeys: stage.dependsOnStageKeys } : {}),
            tasks: stage.tasks,
          },
        })),
      ];
      const now = new Date().toISOString();
      const prepared = prepareRoadmapMutation({
        current: existing,
        commands,
        actorId: actor.id,
        idempotencyKey: input.clientRequestId,
        now,
        changeSource: 'ai_generated_recovery',
        sourceReferences: generated.sourceReferences,
      });
      return this.persistMutation({
        sessionId,
        actor,
        current: existing,
        prepared,
        idempotencyKey: input.clientRequestId,
        commandType: 'generate_plan',
        now,
      });
    }
    return this.createPrepared(
      sessionId,
      {
        clientRequestId: input.clientRequestId,
        title: input.title ?? generated.title,
        ...(input.startAt ? { startAt: input.startAt } : {}),
        ...(input.targetAt ? { targetAt: input.targetAt } : {}),
        stages: generated.stages,
      },
      actor,
      'ai_generated',
      generated.sourceReferences,
    );
  }

  async commandImpact(sessionId: string, input: RoadmapCommandRequest, actor: AuthenticatedUser) {
    const current = await this.requireActive(sessionId, actor.id);
    assertExpectedPlanRevision(current, input.expectedPlanRevision);
    const prepared = prepareRoadmapMutation({
      current,
      commands: [input.command],
      actorId: actor.id,
      idempotencyKey: input.idempotencyKey,
      now: new Date().toISOString(),
      changeSource: input.command.type,
    });
    return { impact: prepared.impact };
  }

  async applyCommand(
    sessionId: string,
    input: RoadmapCommandRequest,
    actor: AuthenticatedUser,
  ): Promise<MutateOnboardingRoadmapResponse> {
    const current = await this.requireActive(sessionId, actor.id);
    const replay = await this.replayMutation(current, input.idempotencyKey, input.command.type);
    if (replay) return replay;
    assertExpectedPlanRevision(current, input.expectedPlanRevision);
    const now = new Date().toISOString();
    const prepared = prepareRoadmapMutation({
      current,
      commands: [input.command],
      actorId: actor.id,
      idempotencyKey: input.idempotencyKey,
      now,
      changeSource: input.command.type,
    });
    assertDestructiveImpact(prepared, input.destructiveImpactHash);
    return this.persistMutation({
      sessionId,
      actor,
      current,
      prepared,
      idempotencyKey: input.idempotencyKey,
      commandType: input.command.type,
      now,
    });
  }

  async proposeChange(
    sessionId: string,
    input: RequestRoadmapAiProposal,
    actor: AuthenticatedUser,
  ): Promise<RoadmapChangeProposal> {
    const current = await this.requireActive(sessionId, actor.id);
    if (!this.agent) {
      throw AppError.featureDisabled(
        'AI roadmap changes are not configured. Edit the roadmap manually.',
      );
    }
    const generated = await this.agent.propose({
      aggregate: current,
      instruction: input.instruction,
      ...(input.selectedStageKey ? { selectedStageKey: input.selectedStageKey } : {}),
      ...(input.selectedTaskKey ? { selectedTaskKey: input.selectedTaskKey } : {}),
      allowedAccessScopes: await this.resolveAccessScopes(actor.id),
    });
    const now = new Date();
    const preview = prepareRoadmapMutation({
      current,
      commands: generated.operations,
      actorId: actor.id,
      idempotencyKey: `proposal-preview:${randomUUID()}`,
      now: now.toISOString(),
      changeSource: 'ai_proposal',
      sourceReferences: [
        ...new Set([...current.definition.sourceReferences, ...generated.sourceReferences]),
      ],
    });
    const baseContentHash = hashDefinition(current.definition);
    const proposalHash = hashValue({
      planId: current.plan.id,
      basePlanRevision: current.plan.revision,
      baseContentHash,
      operations: generated.operations,
    });
    const proposal: StoredRoadmapProposal = {
      id: randomUUID(),
      planId: current.plan.id,
      ownerId: actor.id,
      basePlanRevision: current.plan.revision,
      baseContentHash,
      proposalHash,
      operations: generated.operations,
      rationale: generated.rationale,
      assumptions: generated.assumptions,
      warnings: generated.warnings,
      progressImpact: preview.impact,
      sourceReferences: generated.sourceReferences,
      status: 'pending',
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now.toISOString(),
    };
    await this.repository.saveProposal(proposal);
    emitRoadmapEvent('roadmap.ai_proposal.created', {
      planId: current.plan.id,
      proposalId: proposal.id,
      planRevision: current.plan.revision,
      operationCount: proposal.operations.length,
    });
    return toPublicProposal(proposal);
  }

  async applyProposal(
    sessionId: string,
    proposalId: string,
    input: ApplyRoadmapAiProposalRequest,
    actor: AuthenticatedUser,
  ): Promise<MutateOnboardingRoadmapResponse> {
    const current = await this.requireActive(sessionId, actor.id);
    const replay = await this.replayMutation(current, input.idempotencyKey, 'ai_proposal');
    if (replay) return replay;
    const proposal = await this.repository.getProposal(proposalId, actor.id);
    if (!proposal || proposal.planId !== current.plan.id) {
      throw AppError.notFound('Roadmap proposal not found.');
    }
    if (proposal.status !== 'pending' || Date.parse(proposal.expiresAt) <= Date.now()) {
      throw AppError.conflict('Roadmap proposal is no longer available.');
    }
    if (proposal.proposalHash !== input.proposalHash) {
      throw AppError.conflict('Roadmap proposal content has changed.');
    }
    if (
      proposal.basePlanRevision !== input.expectedPlanRevision ||
      proposal.basePlanRevision !== current.plan.revision ||
      proposal.baseContentHash !== hashDefinition(current.definition)
    ) {
      throw AppError.conflict('Roadmap proposal is stale. Generate a new proposal.');
    }
    const now = new Date().toISOString();
    const prepared = prepareRoadmapMutation({
      current,
      commands: proposal.operations,
      actorId: actor.id,
      idempotencyKey: input.idempotencyKey,
      now,
      changeSource: 'ai_proposal',
      sourceReferences: [
        ...new Set([...current.definition.sourceReferences, ...proposal.sourceReferences]),
      ],
    });
    assertDestructiveImpact(prepared, input.destructiveImpactHash);
    const response = await this.persistMutation({
      sessionId,
      actor,
      current,
      prepared,
      idempotencyKey: input.idempotencyKey,
      commandType: 'ai_proposal',
      proposalId: proposal.id,
      now,
    });
    emitRoadmapEvent('roadmap.ai_proposal.applied', {
      planId: current.plan.id,
      proposalId: proposal.id,
      planRevision: response.revisionEvent?.planRevision,
    });
    return response;
  }

  async dismissProposal(
    sessionId: string,
    proposalId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const current = await this.requireActive(sessionId, actor.id);
    const proposal = await this.repository.getProposal(proposalId, actor.id);
    if (!proposal || proposal.planId !== current.plan.id) {
      throw AppError.notFound('Roadmap proposal not found.');
    }
    if (proposal.status !== 'pending') return;
    if (!(await this.repository.dismissProposal(proposalId, actor.id))) {
      throw AppError.conflict('Roadmap proposal is no longer available.');
    }
    emitRoadmapEvent('roadmap.ai_proposal.dismissed', {
      planId: current.plan.id,
      proposalId,
      planRevision: current.plan.revision,
    });
  }

  async history(
    sessionId: string,
    actor: AuthenticatedUser,
  ): Promise<OnboardingPlanHistoryResponse> {
    const current = await this.requireActive(sessionId, actor.id);
    const events = await this.repository.listRevisionEvents(current.plan.id, actor.id);
    return { events: events.map(toPublicRevisionEvent) };
  }

  async cancellationImpact(
    sessionId: string,
    actor: AuthenticatedUser,
  ): Promise<OnboardingCancellationImpact> {
    const current = await this.requireActive(sessionId, actor.id);
    const completedTaskCount = current.tasks.filter(
      (task) => task.status === 'completed' || task.status === 'waived',
    ).length;
    const incompleteTaskCount = current.tasks.length - completedTaskCount;
    return {
      planId: current.plan.id,
      planRevision: current.plan.revision,
      completedTaskCount,
      incompleteTaskCount,
      impactHash: hashValue({
        action: 'cancel_plan',
        planId: current.plan.id,
        planRevision: current.plan.revision,
        completedTaskCount,
        incompleteTaskCount,
      }),
    };
  }

  async cancel(
    sessionId: string,
    input: CancelOnboardingPlanRequest,
    actor: AuthenticatedUser,
  ): Promise<LegacyWorkspaceOnboardingState> {
    await this.sessions.get(sessionId, actor.id);
    const replay = await this.repository.getRevisionEventByIdempotency(
      actor.id,
      input.idempotencyKey,
    );
    if (replay) {
      if (replay.commandType !== 'cancel_plan') {
        throw AppError.conflict('Idempotency key was already used for another command.');
      }
      return { status: 'empty', reason: 'no-active-plan' };
    }
    const impact = await this.cancellationImpact(sessionId, actor);
    if (
      impact.planRevision !== input.expectedPlanRevision ||
      impact.impactHash !== input.impactHash
    ) {
      throw AppError.conflict('The cancellation impact has changed. Review it again.');
    }
    const result = await this.repository.cancelPlan({
      ownerId: actor.id,
      sessionId,
      expectedPlanRevision: input.expectedPlanRevision,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      actorId: actor.id,
      changedAt: new Date().toISOString(),
    });
    if (result.kind === 'not_found')
      throw AppError.notFound('No active onboarding plan was found.');
    if (result.kind === 'revision_conflict') {
      throw new AppError('CONFLICT', 'The roadmap changed before it could be cancelled.', {
        actualRevision: result.actualRevision,
      });
    }
    emitRoadmapEvent('roadmap.cancellation.completed', {
      planId: impact.planId,
      planRevision: impact.planRevision,
    });
    return { status: 'empty', reason: 'no-active-plan' };
  }

  async transitionTask(
    sessionId: string,
    taskId: string,
    input: LegacyTransitionOnboardingTaskRequest,
    actor: AuthenticatedUser,
  ): Promise<LegacyOnboardingMutationResponse> {
    const aggregate = await this.requireActive(sessionId, actor.id);
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
    if (result.kind === 'no_change')
      throw AppError.conflict('Task is already in the requested state.');
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

  private async requireActive(
    sessionId: string,
    ownerId: string,
  ): Promise<OnboardingPlanAggregate> {
    await this.sessions.get(sessionId, ownerId);
    const aggregate = await this.repository.getActive(sessionId, ownerId);
    if (!aggregate) throw AppError.notFound('No active onboarding plan was found.');
    return aggregate;
  }

  private async createPrepared(
    sessionId: string,
    input: CreateOnboardingPlanRequest,
    actor: AuthenticatedUser,
    changeSource: string,
    sourceReferences: string[] = [],
  ): Promise<LegacyOnboardingMutationResponse> {
    const creation = createPlanInput(sessionId, input, actor.id, changeSource, sourceReferences);
    try {
      const result = await this.repository.createPlan(creation);
      emitRoadmapEvent('roadmap.plan.created', {
        planId: result.aggregate.plan.id,
        source: changeSource,
        taskCount: result.aggregate.tasks.length,
        idempotentReplay: result.idempotentReplay,
      });
      return {
        state: { status: 'ready', projection: calculateOnboardingProjection(result.aggregate) },
        idempotentReplay: result.idempotentReplay,
      };
    } catch (error) {
      if (error instanceof ActiveOnboardingPlanError) throw AppError.conflict(error.message);
      throw error;
    }
  }

  private async replayMutation(
    current: OnboardingPlanAggregate,
    idempotencyKey: string,
    commandType: string,
  ): Promise<MutateOnboardingRoadmapResponse | null> {
    const event = await this.repository.getRevisionEventByIdempotency(
      current.plan.ownerId,
      idempotencyKey,
    );
    if (!event || event.planId !== current.plan.id) return null;
    if (event.commandType !== commandType) {
      throw AppError.conflict('Idempotency key was already used for another roadmap command.');
    }
    return {
      state: { status: 'ready', projection: calculateOnboardingProjection(current) },
      idempotentReplay: true,
      impact: event.impact,
      revisionEvent: toPublicRevisionEvent(event),
    };
  }

  private async persistMutation(input: {
    sessionId: string;
    actor: AuthenticatedUser;
    current: OnboardingPlanAggregate;
    prepared: PreparedRoadmapMutation;
    idempotencyKey: string;
    commandType: string;
    proposalId?: string;
    now: string;
  }): Promise<MutateOnboardingRoadmapResponse> {
    const result = await this.repository.mutatePlan({
      ownerId: input.actor.id,
      sessionId: input.sessionId,
      expectedPlanRevision: input.current.plan.revision,
      idempotencyKey: input.idempotencyKey,
      commandType: input.commandType,
      contentHash: input.prepared.contentHash,
      impact: input.prepared.impact,
      aggregate: input.prepared.aggregate,
      retiredTaskIds: input.prepared.retiredTaskIds,
      resetEvents: input.prepared.resetEvents,
      ...(input.proposalId ? { proposalId: input.proposalId } : {}),
      actorId: input.actor.id,
      changedAt: input.now,
    });
    if (result.kind === 'not_found')
      throw AppError.notFound('No active onboarding plan was found.');
    if (result.kind === 'idempotency_conflict') {
      throw AppError.conflict('Idempotency key was already used for a different roadmap command.');
    }
    if (result.kind === 'proposal_conflict') {
      throw AppError.conflict('Roadmap proposal is no longer available.');
    }
    if (result.kind === 'revision_conflict') {
      throw new AppError('CONFLICT', 'The roadmap was changed by another request.', {
        actualRevision: result.actualRevision,
      });
    }
    emitRoadmapEvent('roadmap.version.created', {
      planId: result.aggregate.plan.id,
      planRevision: result.aggregate.plan.revision,
      commandType: input.commandType,
      idempotentReplay: result.kind === 'duplicate',
      impact: result.event.impact,
    });
    return {
      state: { status: 'ready', projection: calculateOnboardingProjection(result.aggregate) },
      idempotentReplay: result.kind === 'duplicate',
      impact: result.event.impact,
      revisionEvent: toPublicRevisionEvent(result.event),
    };
  }
}

function isEmptyRoadmap(aggregate: OnboardingPlanAggregate): boolean {
  return aggregate.definition.stages.length === 0 && aggregate.tasks.length === 0;
}

function createPlanInput(
  sessionId: string,
  input: CreateOnboardingPlanRequest,
  ownerId: string,
  changeSource: string,
  sourceReferences: string[],
): CreateOnboardingPlanInput {
  const now = new Date().toISOString();
  const startAt = input.startAt ?? now;
  validateDates(startAt, input.targetAt);
  const definitionId = input.definitionVersionId ?? randomUUID();
  const stages = createStoredStages(input.stages);
  const planId = randomUUID();
  const definition = {
    id: definitionId,
    ownerId,
    title: input.title,
    changeSource,
    createdBy: ownerId,
    createdAt: now,
    sourceReferences,
    stages,
  };
  const impact = {
    tasksAdded: stages.reduce((total, stage) => total + stage.tasks.length, 0),
    tasksRetired: 0,
    completedTasksRetained: 0,
    completedTasksReset: 0,
    destructive: false,
  };
  return {
    definition,
    plan: {
      id: planId,
      sessionId,
      ownerId,
      definitionVersionId: definitionId,
      creationRequestId: input.clientRequestId,
      title: input.title,
      status: 'active',
      startAt,
      ...(input.targetAt ? { targetAt: input.targetAt } : {}),
      revision: 0,
      createdAt: now,
      startedAt: now,
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
    creationEvent: {
      id: randomUUID(),
      planId,
      ownerId,
      actorId: ownerId,
      toDefinitionVersionId: definitionId,
      planRevision: 0,
      commandType: 'create_plan',
      idempotencyKey: input.clientRequestId,
      contentHash: hashDefinition(definition),
      impact,
      createdAt: now,
    },
  };
}

function assertExpectedPlanRevision(
  current: OnboardingPlanAggregate,
  expectedRevision: number,
): void {
  if (current.plan.revision !== expectedRevision) {
    throw new AppError('CONFLICT', 'The roadmap was changed by another request.', {
      actualRevision: current.plan.revision,
    });
  }
}

function assertDestructiveImpact(
  prepared: PreparedRoadmapMutation,
  suppliedHash: string | undefined,
): void {
  if (prepared.impact.destructive && suppliedHash !== prepared.impactHash) {
    throw new AppError(
      'CONFLICT',
      'Review the completed-work impact before applying this change.',
      {
        impact: prepared.impact,
      },
    );
  }
}

function toPublicRevisionEvent(event: StoredPlanRevisionEvent): OnboardingPlanRevisionEvent {
  return {
    id: event.id,
    planId: event.planId,
    planRevision: event.planRevision,
    commandType: event.commandType,
    actorId: event.actorId,
    ...(event.fromDefinitionVersionId
      ? { fromDefinitionVersionId: event.fromDefinitionVersionId }
      : {}),
    toDefinitionVersionId: event.toDefinitionVersionId,
    impact: event.impact,
    createdAt: event.createdAt,
  };
}

function toPublicProposal(proposal: StoredRoadmapProposal): RoadmapChangeProposal {
  return {
    id: proposal.id,
    planId: proposal.planId,
    basePlanRevision: proposal.basePlanRevision,
    baseContentHash: proposal.baseContentHash,
    proposalHash: proposal.proposalHash,
    operations: proposal.operations,
    rationale: proposal.rationale,
    assumptions: proposal.assumptions,
    warnings: proposal.warnings,
    progressImpact: proposal.progressImpact,
    sourceReferences: proposal.sourceReferences,
    expiresAt: proposal.expiresAt,
  };
}

function validateDates(startAt: string, targetAt: string | undefined): void {
  const start = Date.parse(startAt);
  if (!Number.isFinite(start)) throw AppError.validation('Roadmap start date is invalid.');
  if (targetAt) {
    const target = Date.parse(targetAt);
    if (!Number.isFinite(target)) throw AppError.validation('Roadmap target date is invalid.');
    if (target < start) {
      throw AppError.validation('Roadmap target date cannot be before its start date.');
    }
  }
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

function emitRoadmapEvent(event: string, details: Record<string, unknown>): void {
  console.info(JSON.stringify({ event, ...details }));
}
