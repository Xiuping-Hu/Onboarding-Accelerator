import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  OnboardingPlanStatus,
  OnboardingPlanRevisionEvent,
  RoadmapChangeImpact,
  RoadmapChangeProposal,
  OnboardingTaskMutationSource,
  OnboardingTaskStatus,
} from '@onboarding/shared';

export interface StoredTaskDefinition {
  id: string;
  stableKey: string;
  title: string;
  description?: string;
  completionCriteria?: string;
  required: boolean;
  countsTowardProgress: boolean;
  weight: number;
  dueOffsetDays?: number;
  dependsOnTaskKeys: string[];
}

export interface StoredStageDefinition {
  id: string;
  stableKey: string;
  title: string;
  description: string;
  position: number;
  guideStepId?: string;
  dependsOnStageKeys: string[];
  tasks: StoredTaskDefinition[];
}

export interface StoredJourneyDefinitionVersion {
  id: string;
  ownerId: string;
  title: string;
  supersedesVersionId?: string;
  changeSource?: string;
  createdBy?: string;
  createdAt: string;
  sourceReferences: string[];
  stages: StoredStageDefinition[];
}

export interface StoredOnboardingPlan {
  id: string;
  sessionId?: string;
  ownerId: string;
  definitionVersionId: string;
  creationRequestId: string;
  title: string;
  status: OnboardingPlanStatus;
  startAt: string;
  targetAt?: string;
  revision: number;
  createdAt: string;
  startedAt: string;
  cancelledAt?: string;
  cancellationReason?: string;
}

export interface StoredTaskInstance {
  id: string;
  planId: string;
  definitionId: string;
  stableKey: string;
  stageId: string;
  status: OnboardingTaskStatus;
  dueAt?: string;
  completedAt?: string;
  completedBy?: string;
  revision: number;
  retiredAt?: string;
  retiredReason?: string;
}

export interface StoredTaskEvent {
  id: string;
  planId: string;
  taskId: string;
  actorId: string;
  fromStatus: OnboardingTaskStatus;
  toStatus: OnboardingTaskStatus;
  source: OnboardingTaskMutationSource;
  idempotencyKey: string;
  taskRevision: number;
  planRevision: number;
  createdAt: string;
}

export interface OnboardingPlanAggregate {
  definition: StoredJourneyDefinitionVersion;
  plan: StoredOnboardingPlan;
  tasks: StoredTaskInstance[];
}

export type CreateOnboardingPlanInput = OnboardingPlanAggregate & {
  creationEvent: StoredPlanRevisionEvent;
};

export interface MutateOnboardingPlanInput {
  ownerId: string;
  sessionId: string;
  expectedPlanRevision: number;
  idempotencyKey: string;
  commandType: string;
  contentHash: string;
  impact: RoadmapChangeImpact;
  aggregate: OnboardingPlanAggregate;
  retiredTaskIds: string[];
  resetEvents: StoredTaskEvent[];
  proposalId?: string;
  actorId: string;
  changedAt: string;
}

export type MutateOnboardingPlanResult =
  | {
      kind: 'updated' | 'duplicate';
      aggregate: OnboardingPlanAggregate;
      event: StoredPlanRevisionEvent;
    }
  | { kind: 'not_found' }
  | { kind: 'idempotency_conflict' }
  | { kind: 'proposal_conflict' }
  | { kind: 'revision_conflict'; actualRevision: number };

export interface StoredPlanRevisionEvent extends OnboardingPlanRevisionEvent {
  ownerId: string;
  idempotencyKey: string;
  contentHash: string;
}

export interface StoredRoadmapProposal extends RoadmapChangeProposal {
  ownerId: string;
  status: 'pending' | 'applied' | 'dismissed' | 'expired';
  createdAt: string;
  appliedAt?: string;
}

export interface CancelOnboardingPlanInput {
  ownerId: string;
  sessionId: string;
  expectedPlanRevision: number;
  idempotencyKey: string;
  reason: string;
  actorId: string;
  changedAt: string;
}

export type CancelOnboardingPlanResult =
  | { kind: 'cancelled' | 'duplicate'; planId: string }
  | { kind: 'not_found' }
  | { kind: 'revision_conflict'; actualRevision: number };

export interface TransitionTaskInput {
  ownerId: string;
  sessionId: string;
  taskId: string;
  status: OnboardingTaskStatus;
  expectedRevision: number;
  idempotencyKey: string;
  source: OnboardingTaskMutationSource;
  actorId: string;
  changedAt: string;
}

export type TransitionTaskResult =
  | { kind: 'updated' | 'duplicate'; aggregate: OnboardingPlanAggregate }
  | { kind: 'not_found' }
  | { kind: 'no_change' }
  | { kind: 'idempotency_conflict' }
  | { kind: 'revision_conflict'; actualRevision: number };

export interface OnboardingRepository {
  getActive(sessionId: string, ownerId: string): Promise<OnboardingPlanAggregate | null>;
  createPlan(
    input: CreateOnboardingPlanInput,
  ): Promise<{ aggregate: OnboardingPlanAggregate; idempotentReplay: boolean }>;
  transitionTask(input: TransitionTaskInput): Promise<TransitionTaskResult>;
  mutatePlan(input: MutateOnboardingPlanInput): Promise<MutateOnboardingPlanResult>;
  saveProposal(proposal: StoredRoadmapProposal): Promise<void>;
  getProposal(id: string, ownerId: string): Promise<StoredRoadmapProposal | null>;
  dismissProposal(id: string, ownerId: string): Promise<boolean>;
  listRevisionEvents(planId: string, ownerId: string): Promise<StoredPlanRevisionEvent[]>;
  getRevisionEventByIdempotency(
    ownerId: string,
    idempotencyKey: string,
  ): Promise<StoredPlanRevisionEvent | null>;
  cancelPlan(input: CancelOnboardingPlanInput): Promise<CancelOnboardingPlanResult>;
}

interface OnboardingStore {
  definitions: StoredJourneyDefinitionVersion[];
  plans: StoredOnboardingPlan[];
  tasks: StoredTaskInstance[];
  events: StoredTaskEvent[];
  revisionEvents: StoredPlanRevisionEvent[];
  proposals: StoredRoadmapProposal[];
}

const emptyStore = (): OnboardingStore => ({
  definitions: [],
  plans: [],
  tasks: [],
  events: [],
  revisionEvents: [],
  proposals: [],
});

export class InMemoryOnboardingRepository implements OnboardingRepository {
  constructor(protected readonly store: OnboardingStore = emptyStore()) {}

  async getActive(_sessionId: string, ownerId: string): Promise<OnboardingPlanAggregate | null> {
    const plan = this.store.plans.find(
      (candidate) => candidate.ownerId === ownerId && candidate.status === 'active',
    );
    return plan ? this.toAggregate(plan) : null;
  }

  async createPlan(
    input: CreateOnboardingPlanInput,
  ): Promise<{ aggregate: OnboardingPlanAggregate; idempotentReplay: boolean }> {
    const duplicate = this.store.plans.find(
      (plan) =>
        plan.ownerId === input.plan.ownerId &&
        plan.creationRequestId === input.plan.creationRequestId,
    );
    if (duplicate) {
      return { aggregate: this.toAggregate(duplicate), idempotentReplay: true };
    }

    const active = this.store.plans.some(
      (plan) => plan.ownerId === input.plan.ownerId && plan.status === 'active',
    );
    if (active) throw new ActiveOnboardingPlanError();

    this.store.definitions.push(clone(input.definition));
    this.store.plans.push(clone(input.plan));
    this.store.tasks.push(...clone(input.tasks));
    this.store.revisionEvents.push(clone(input.creationEvent));
    return {
      aggregate: clone({ definition: input.definition, plan: input.plan, tasks: input.tasks }),
      idempotentReplay: false,
    };
  }

  async transitionTask(input: TransitionTaskInput): Promise<TransitionTaskResult> {
    const plan = this.store.plans.find(
      (candidate) => candidate.ownerId === input.ownerId && candidate.status === 'active',
    );
    if (!plan) return { kind: 'not_found' };

    const duplicate = this.store.events.find(
      (event) => event.planId === plan.id && event.idempotencyKey === input.idempotencyKey,
    );
    if (duplicate) {
      return duplicate.taskId === input.taskId &&
        duplicate.toStatus === input.status &&
        duplicate.source === input.source
        ? { kind: 'duplicate', aggregate: this.toAggregate(plan) }
        : { kind: 'idempotency_conflict' };
    }

    const task = this.store.tasks.find(
      (candidate) => candidate.id === input.taskId && candidate.planId === plan.id,
    );
    if (!task) return { kind: 'not_found' };
    if (task.revision !== input.expectedRevision) {
      return { kind: 'revision_conflict', actualRevision: task.revision };
    }
    if (task.status === input.status) return { kind: 'no_change' };

    const fromStatus = task.status;
    task.status = input.status;
    task.revision += 1;
    if (input.status === 'completed') {
      task.completedAt = input.changedAt;
      task.completedBy = input.actorId;
    } else {
      task.completedAt = undefined;
      task.completedBy = undefined;
    }
    plan.revision += 1;
    this.store.events.push({
      id: randomUUID(),
      planId: plan.id,
      taskId: task.id,
      actorId: input.actorId,
      fromStatus,
      toStatus: input.status,
      source: input.source,
      idempotencyKey: input.idempotencyKey,
      taskRevision: task.revision,
      planRevision: plan.revision,
      createdAt: input.changedAt,
    });
    return { kind: 'updated', aggregate: this.toAggregate(plan) };
  }

  async mutatePlan(input: MutateOnboardingPlanInput): Promise<MutateOnboardingPlanResult> {
    const plan = this.store.plans.find(
      (candidate) => candidate.ownerId === input.ownerId && candidate.status === 'active',
    );
    if (!plan) return { kind: 'not_found' };
    const duplicate = this.store.revisionEvents.find(
      (event) => event.planId === plan.id && event.idempotencyKey === input.idempotencyKey,
    );
    if (duplicate) {
      return duplicate.commandType === input.commandType
        ? { kind: 'duplicate', aggregate: this.toAggregate(plan), event: clone(duplicate) }
        : { kind: 'idempotency_conflict' };
    }
    if (plan.revision !== input.expectedPlanRevision) {
      return { kind: 'revision_conflict', actualRevision: plan.revision };
    }
    const proposal = input.proposalId
      ? this.store.proposals.find(
          (candidate) =>
            candidate.id === input.proposalId &&
            candidate.ownerId === input.ownerId &&
            candidate.planId === plan.id,
        )
      : undefined;
    if (input.proposalId && proposal?.status !== 'pending') {
      return { kind: 'proposal_conflict' };
    }

    this.store.definitions.push(clone(input.aggregate.definition));
    Object.assign(plan, clone(input.aggregate.plan));
    for (const taskId of input.retiredTaskIds) {
      const task = this.store.tasks.find((candidate) => candidate.id === taskId);
      if (task) {
        task.retiredAt = input.changedAt;
        task.retiredReason = input.commandType;
      }
    }
    for (const nextTask of input.aggregate.tasks) {
      const task = this.store.tasks.find((candidate) => candidate.id === nextTask.id);
      if (task)
        Object.assign(task, clone(nextTask), { retiredAt: undefined, retiredReason: undefined });
      else this.store.tasks.push(clone(nextTask));
    }
    this.store.events.push(...clone(input.resetEvents));
    const event = createRevisionEvent(input);
    this.store.revisionEvents.push(event);
    if (proposal) {
      proposal.status = 'applied';
      proposal.appliedAt = input.changedAt;
    }
    return { kind: 'updated', aggregate: this.toAggregate(plan), event: clone(event) };
  }

  async saveProposal(proposal: StoredRoadmapProposal): Promise<void> {
    this.store.proposals.push(clone(proposal));
  }

  async getProposal(id: string, ownerId: string): Promise<StoredRoadmapProposal | null> {
    const proposal = this.store.proposals.find(
      (candidate) => candidate.id === id && candidate.ownerId === ownerId,
    );
    return proposal ? clone(proposal) : null;
  }

  async dismissProposal(id: string, ownerId: string): Promise<boolean> {
    const proposal = this.store.proposals.find(
      (candidate) => candidate.id === id && candidate.ownerId === ownerId,
    );
    if (!proposal || proposal.status !== 'pending') return false;
    proposal.status = 'dismissed';
    return true;
  }

  async listRevisionEvents(planId: string, ownerId: string): Promise<StoredPlanRevisionEvent[]> {
    return clone(
      this.store.revisionEvents
        .filter((event) => event.planId === planId && event.ownerId === ownerId)
        .sort((left, right) => right.planRevision - left.planRevision),
    );
  }

  async getRevisionEventByIdempotency(
    ownerId: string,
    idempotencyKey: string,
  ): Promise<StoredPlanRevisionEvent | null> {
    const event = this.store.revisionEvents.find(
      (candidate) => candidate.ownerId === ownerId && candidate.idempotencyKey === idempotencyKey,
    );
    return event ? clone(event) : null;
  }

  async cancelPlan(input: CancelOnboardingPlanInput): Promise<CancelOnboardingPlanResult> {
    const plan = this.store.plans.find(
      (candidate) => candidate.ownerId === input.ownerId && candidate.status === 'active',
    );
    if (!plan) {
      const duplicate = this.store.revisionEvents.find(
        (event) =>
          event.ownerId === input.ownerId &&
          event.idempotencyKey === input.idempotencyKey &&
          event.commandType === 'cancel_plan',
      );
      return duplicate ? { kind: 'duplicate', planId: duplicate.planId } : { kind: 'not_found' };
    }
    if (plan.revision !== input.expectedPlanRevision) {
      return { kind: 'revision_conflict', actualRevision: plan.revision };
    }
    plan.status = 'cancelled';
    plan.cancelledAt = input.changedAt;
    plan.cancellationReason = input.reason;
    plan.revision += 1;
    this.store.revisionEvents.push({
      id: randomUUID(),
      planId: plan.id,
      ownerId: input.ownerId,
      actorId: input.actorId,
      fromDefinitionVersionId: plan.definitionVersionId,
      toDefinitionVersionId: plan.definitionVersionId,
      planRevision: plan.revision,
      commandType: 'cancel_plan',
      idempotencyKey: input.idempotencyKey,
      contentHash: '',
      impact: {
        tasksAdded: 0,
        tasksRetired: this.store.tasks.filter((task) => task.planId === plan.id && !task.retiredAt)
          .length,
        completedTasksRetained: 0,
        completedTasksReset: 0,
        destructive: true,
      },
      createdAt: input.changedAt,
    });
    return { kind: 'cancelled', planId: plan.id };
  }

  protected toAggregate(plan: StoredOnboardingPlan): OnboardingPlanAggregate {
    const definition = this.store.definitions.find(
      (candidate) => candidate.id === plan.definitionVersionId,
    );
    if (!definition) throw new Error(`Missing onboarding definition: ${plan.definitionVersionId}`);
    return clone({
      definition: {
        ...definition,
        sourceReferences: definition.sourceReferences ?? [],
      },
      plan,
      tasks: this.store.tasks.filter((task) => task.planId === plan.id && !task.retiredAt),
    });
  }
}

export class FileOnboardingRepository implements OnboardingRepository {
  private readonly filePath: string;
  private queue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = resolve(filePath);
  }

  async getActive(sessionId: string, ownerId: string): Promise<OnboardingPlanAggregate | null> {
    await this.queue.catch(() => undefined);
    return new InMemoryOnboardingRepository(await this.readStore()).getActive(sessionId, ownerId);
  }

  async createPlan(
    input: CreateOnboardingPlanInput,
  ): Promise<{ aggregate: OnboardingPlanAggregate; idempotentReplay: boolean }> {
    return this.mutate((repository) => repository.createPlan(input));
  }

  async transitionTask(input: TransitionTaskInput): Promise<TransitionTaskResult> {
    return this.mutate((repository) => repository.transitionTask(input));
  }

  async mutatePlan(input: MutateOnboardingPlanInput): Promise<MutateOnboardingPlanResult> {
    return this.mutate((repository) => repository.mutatePlan(input));
  }

  async saveProposal(proposal: StoredRoadmapProposal): Promise<void> {
    await this.mutate((repository) => repository.saveProposal(proposal));
  }

  async getProposal(id: string, ownerId: string): Promise<StoredRoadmapProposal | null> {
    await this.queue.catch(() => undefined);
    return new InMemoryOnboardingRepository(await this.readStore()).getProposal(id, ownerId);
  }

  async dismissProposal(id: string, ownerId: string): Promise<boolean> {
    return this.mutate((repository) => repository.dismissProposal(id, ownerId));
  }

  async listRevisionEvents(planId: string, ownerId: string): Promise<StoredPlanRevisionEvent[]> {
    await this.queue.catch(() => undefined);
    return new InMemoryOnboardingRepository(await this.readStore()).listRevisionEvents(
      planId,
      ownerId,
    );
  }

  async getRevisionEventByIdempotency(
    ownerId: string,
    idempotencyKey: string,
  ): Promise<StoredPlanRevisionEvent | null> {
    await this.queue.catch(() => undefined);
    return new InMemoryOnboardingRepository(await this.readStore()).getRevisionEventByIdempotency(
      ownerId,
      idempotencyKey,
    );
  }

  async cancelPlan(input: CancelOnboardingPlanInput): Promise<CancelOnboardingPlanResult> {
    return this.mutate((repository) => repository.cancelPlan(input));
  }

  private async mutate<T>(operation: (repository: InMemoryOnboardingRepository) => Promise<T>) {
    let value!: T;
    this.queue = this.queue
      .catch(() => undefined)
      .then(async () => {
        const store = await this.readStore();
        value = await operation(new InMemoryOnboardingRepository(store));
        await this.writeStore(store);
      });
    await this.queue;
    return value;
  }

  private async readStore(): Promise<OnboardingStore> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<OnboardingStore>;
      return {
        definitions: parsed.definitions ?? [],
        plans: ((parsed.plans ?? []) as unknown as LegacyStoredOnboardingPlan[]).map(
          normalizeStoredPlan,
        ),
        tasks: parsed.tasks ?? [],
        events: parsed.events ?? [],
        revisionEvents: parsed.revisionEvents ?? [],
        proposals: parsed.proposals ?? [],
      };
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) return emptyStore();
      throw error;
    }
  }

  private async writeStore(store: OnboardingStore): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    try {
      await replaceFile(tempPath, this.filePath);
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}

export class ActiveOnboardingPlanError extends Error {
  constructor() {
    super('An active onboarding plan already exists for this learner.');
    this.name = 'ActiveOnboardingPlanError';
  }
}

type LegacyStoredOnboardingPlan = Omit<StoredOnboardingPlan, 'creationRequestId' | 'startedAt'> & {
  creationRequestId?: string;
  startedAt?: string;
  activationRequestId?: string;
  activatedAt?: string;
};

function normalizeStoredPlan(plan: LegacyStoredOnboardingPlan): StoredOnboardingPlan {
  const creationRequestId = plan.creationRequestId ?? plan.activationRequestId;
  const startedAt = plan.startedAt ?? plan.activatedAt;
  if (!creationRequestId || !startedAt) {
    throw new Error(`Invalid persisted onboarding plan: ${plan.id}`);
  }
  const current = { ...plan };
  delete current.activationRequestId;
  delete current.activatedAt;
  return { ...current, creationRequestId, startedAt };
}

function createRevisionEvent(input: MutateOnboardingPlanInput): StoredPlanRevisionEvent {
  return {
    id: randomUUID(),
    planId: input.aggregate.plan.id,
    ownerId: input.ownerId,
    actorId: input.actorId,
    fromDefinitionVersionId: input.aggregate.definition.supersedesVersionId,
    toDefinitionVersionId: input.aggregate.definition.id,
    planRevision: input.aggregate.plan.revision,
    commandType: input.commandType,
    idempotencyKey: input.idempotencyKey,
    contentHash: input.contentHash,
    impact: input.impact,
    createdAt: input.changedAt,
  };
}

function clone<T>(value: T): T {
  return structuredClone(value) as T;
}

function isNodeError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

async function replaceFile(sourcePath: string, targetPath: string): Promise<void> {
  try {
    await rename(sourcePath, targetPath);
  } catch (error) {
    if (
      !isNodeError(error, 'EACCES') &&
      !isNodeError(error, 'EPERM') &&
      !isNodeError(error, 'EBUSY')
    ) {
      throw error;
    }
    await copyFile(sourcePath, targetPath);
    await rm(sourcePath, { force: true });
  }
}
