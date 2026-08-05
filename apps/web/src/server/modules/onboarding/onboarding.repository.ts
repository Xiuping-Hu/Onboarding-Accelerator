import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  OnboardingPlanStatus,
  OnboardingTaskMutationSource,
  OnboardingTaskStatus,
} from '@onboarding/shared';

export interface StoredTaskDefinition {
  id: string;
  stableKey: string;
  title: string;
  description?: string;
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
  createdAt: string;
  stages: StoredStageDefinition[];
}

export interface StoredOnboardingPlan {
  id: string;
  sessionId?: string;
  ownerId: string;
  definitionVersionId: string;
  activationRequestId: string;
  title: string;
  status: OnboardingPlanStatus;
  startAt: string;
  targetAt?: string;
  revision: number;
  createdAt: string;
  activatedAt: string;
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

export type CreateOnboardingPlanInput = OnboardingPlanAggregate;

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
}

interface OnboardingStore {
  definitions: StoredJourneyDefinitionVersion[];
  plans: StoredOnboardingPlan[];
  tasks: StoredTaskInstance[];
  events: StoredTaskEvent[];
}

const emptyStore = (): OnboardingStore => ({ definitions: [], plans: [], tasks: [], events: [] });

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
        plan.activationRequestId === input.plan.activationRequestId,
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
    return { aggregate: clone(input), idempotentReplay: false };
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

  protected toAggregate(plan: StoredOnboardingPlan): OnboardingPlanAggregate {
    const definition = this.store.definitions.find(
      (candidate) => candidate.id === plan.definitionVersionId,
    );
    if (!definition) throw new Error(`Missing onboarding definition: ${plan.definitionVersionId}`);
    return clone({
      definition,
      plan,
      tasks: this.store.tasks.filter((task) => task.planId === plan.id),
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
        plans: parsed.plans ?? [],
        tasks: parsed.tasks ?? [],
        events: parsed.events ?? [],
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
    super('An active onboarding plan already exists for this session.');
    this.name = 'ActiveOnboardingPlanError';
  }
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
