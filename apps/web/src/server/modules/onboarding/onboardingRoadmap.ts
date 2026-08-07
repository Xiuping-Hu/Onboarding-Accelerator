import { createHash, randomUUID } from 'node:crypto';
import type {
  OnboardingTaskDefinitionInput,
  RoadmapChangeImpact,
  RoadmapCommand,
  RoadmapStageDefinitionInput,
} from '@onboarding/shared';
import { AppError } from '../../core/errors/appError';
import type {
  OnboardingPlanAggregate,
  StoredJourneyDefinitionVersion,
  StoredStageDefinition,
  StoredTaskEvent,
  StoredTaskInstance,
} from './onboarding.repository';

export const roadmapLimits = {
  stages: 12,
  tasksPerStage: 20,
  tasksTotal: 120,
} as const;

export interface PreparedRoadmapMutation {
  aggregate: OnboardingPlanAggregate;
  retiredTaskIds: string[];
  resetEvents: StoredTaskEvent[];
  impact: RoadmapChangeImpact;
  impactHash: string;
  contentHash: string;
}

export function prepareRoadmapMutation(input: {
  current: OnboardingPlanAggregate;
  commands: RoadmapCommand[];
  actorId: string;
  idempotencyKey: string;
  now: string;
  changeSource: string;
  sourceReferences?: string[];
}): PreparedRoadmapMutation {
  if (!input.commands.length)
    throw AppError.validation('At least one roadmap command is required.');
  const nextDefinition = structuredClone(input.current.definition);
  let title = input.current.plan.title;
  let startAt = input.current.plan.startAt;
  let targetAt = input.current.plan.targetAt;

  for (const command of input.commands) {
    if (command.type === 'set_metadata') {
      if (command.title !== undefined) title = command.title.trim();
      if (command.startAt !== undefined) startAt = command.startAt;
      if (command.targetAt !== undefined) targetAt = command.targetAt ?? undefined;
      continue;
    }
    applyDefinitionCommand(nextDefinition.stages, command);
  }

  if (!title) throw AppError.validation('Roadmap title is required.');
  validateRoadmapDefinition(nextDefinition.stages);
  validateDates(startAt, targetAt);

  const definitionId = randomUUID();
  const definition: StoredJourneyDefinitionVersion = {
    ...nextDefinition,
    id: definitionId,
    title,
    supersedesVersionId: input.current.definition.id,
    changeSource: input.changeSource,
    createdBy: input.actorId,
    createdAt: input.now,
    sourceReferences: input.sourceReferences ?? nextDefinition.sourceReferences,
  };
  const reconciliation = reconcileTasks({
    current: input.current,
    nextStages: definition.stages,
    startAt,
    actorId: input.actorId,
    idempotencyKey: input.idempotencyKey,
    nextPlanRevision: input.current.plan.revision + 1,
    now: input.now,
  });
  const impactHash = hashValue({
    planId: input.current.plan.id,
    planRevision: input.current.plan.revision,
    commands: input.commands,
    impact: reconciliation.impact,
  });
  const impact = {
    ...reconciliation.impact,
    ...(reconciliation.impact.destructive ? { impactHash } : {}),
  };

  return {
    aggregate: {
      definition,
      plan: {
        ...input.current.plan,
        definitionVersionId: definitionId,
        title,
        startAt,
        ...(targetAt ? { targetAt } : { targetAt: undefined }),
        revision: input.current.plan.revision + 1,
      },
      tasks: reconciliation.tasks,
    },
    retiredTaskIds: reconciliation.retiredTaskIds,
    resetEvents: reconciliation.resetEvents,
    impact,
    impactHash,
    contentHash: hashDefinition(definition),
  };
}

export function createStoredStages(stages: RoadmapStageDefinitionInput[]): StoredStageDefinition[] {
  const stored = stages.map((stage) => ({
    id: randomUUID(),
    stableKey: stage.stableKey,
    title: stage.title,
    description: stage.description,
    position: stage.position,
    ...(stage.guideStepId ? { guideStepId: stage.guideStepId } : {}),
    dependsOnStageKeys: stage.dependsOnStageKeys ?? [],
    tasks: stage.tasks.map(createStoredTask),
  }));
  validateRoadmapDefinition(stored);
  return stored;
}

export function validateRoadmapDefinition(stages: StoredStageDefinition[]): void {
  if (stages.length > roadmapLimits.stages) {
    throw AppError.validation(`A roadmap can contain at most ${roadmapLimits.stages} stages.`);
  }
  const taskCount = stages.reduce((total, stage) => total + stage.tasks.length, 0);
  if (taskCount > roadmapLimits.tasksTotal) {
    throw AppError.validation(`A roadmap can contain at most ${roadmapLimits.tasksTotal} tasks.`);
  }
  const stageKeys = new Set<string>();
  const taskKeys = new Set<string>();
  const positions = new Set<number>();
  for (const stage of stages) {
    assertStableKey(stage.stableKey, 'Stage');
    if (!stage.title.trim()) throw AppError.validation('Stage title is required.');
    if (stage.tasks.length > roadmapLimits.tasksPerStage) {
      throw AppError.validation(
        `Stage ${stage.stableKey} can contain at most ${roadmapLimits.tasksPerStage} tasks.`,
      );
    }
    if (stageKeys.has(stage.stableKey)) throw AppError.validation('Stage keys must be unique.');
    if (positions.has(stage.position)) throw AppError.validation('Stage positions must be unique.');
    stageKeys.add(stage.stableKey);
    positions.add(stage.position);
    for (const task of stage.tasks) {
      assertStableKey(task.stableKey, 'Task');
      if (!task.title.trim()) throw AppError.validation('Task title is required.');
      if (task.weight <= 0 || task.weight > 10_000) {
        throw AppError.validation(`Task ${task.stableKey} has an invalid weight.`);
      }
      if (taskKeys.has(task.stableKey)) throw AppError.validation('Task keys must be unique.');
      taskKeys.add(task.stableKey);
    }
  }
  for (const stage of stages) {
    if (stage.dependsOnStageKeys.some((key) => !stageKeys.has(key))) {
      throw AppError.validation(`Stage ${stage.stableKey} has an unknown dependency.`);
    }
    for (const task of stage.tasks) {
      if (task.dependsOnTaskKeys.some((key) => !taskKeys.has(key))) {
        throw AppError.validation(`Task ${task.stableKey} has an unknown dependency.`);
      }
    }
  }
  assertAcyclic(
    stages.map((stage) => ({ key: stage.stableKey, dependencies: stage.dependsOnStageKeys })),
    'stage',
  );
  assertAcyclic(
    stages.flatMap((stage) =>
      stage.tasks.map((task) => ({ key: task.stableKey, dependencies: task.dependsOnTaskKeys })),
    ),
    'task',
  );
}

export function hashDefinition(
  definition: Pick<StoredJourneyDefinitionVersion, 'title' | 'stages' | 'sourceReferences'>,
): string {
  return hashValue({
    title: definition.title,
    stages: definition.stages,
    sourceReferences: definition.sourceReferences,
  });
}

export function hashValue(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function applyDefinitionCommand(stages: StoredStageDefinition[], command: RoadmapCommand): void {
  if (command.type === 'add_stage') {
    if (stages.some((stage) => stage.stableKey === command.stage.stableKey)) {
      throw AppError.conflict('A stage with that key already exists.');
    }
    const stage: StoredStageDefinition = {
      id: randomUUID(),
      stableKey: command.stage.stableKey,
      title: command.stage.title,
      description: command.stage.description,
      position: 0,
      ...(command.stage.guideStepId ? { guideStepId: command.stage.guideStepId } : {}),
      dependsOnStageKeys: command.stage.dependsOnStageKeys ?? [],
      tasks: command.stage.tasks.map(createStoredTask),
    };
    insertAfter(stages, stage, command.afterStageKey, (item) => item.stableKey);
    reindexStages(stages);
    return;
  }
  if (command.type === 'update_stage') {
    const stage = requireStage(stages, command.stageKey);
    if (command.patch.title !== undefined) stage.title = command.patch.title;
    if (command.patch.description !== undefined) stage.description = command.patch.description;
    if (command.patch.guideStepId !== undefined) {
      stage.guideStepId = command.patch.guideStepId || undefined;
    }
    if (command.patch.dependsOnStageKeys !== undefined) {
      stage.dependsOnStageKeys = [...command.patch.dependsOnStageKeys];
    }
    return;
  }
  if (command.type === 'move_stage') {
    moveAfter(stages, command.stageKey, command.afterStageKey, (item) => item.stableKey);
    reindexStages(stages);
    return;
  }
  if (command.type === 'delete_stage') {
    const index = stages.findIndex((stage) => stage.stableKey === command.stageKey);
    if (index < 0) throw AppError.notFound('Roadmap stage not found.');
    stages.splice(index, 1);
    for (const stage of stages) {
      stage.dependsOnStageKeys = stage.dependsOnStageKeys.filter((key) => key !== command.stageKey);
    }
    reindexStages(stages);
    return;
  }
  if (command.type === 'add_task') {
    const stage = requireStage(stages, command.stageKey);
    if (findTask(stages, command.task.stableKey)) {
      throw AppError.conflict('A task with that key already exists.');
    }
    insertAfter(
      stage.tasks,
      createStoredTask(command.task),
      command.afterTaskKey,
      (item) => item.stableKey,
    );
    return;
  }
  if (command.type === 'update_task') {
    const found = requireTask(stages, command.taskKey);
    const patch = command.patch;
    if (patch.title !== undefined) found.task.title = patch.title;
    if (patch.description !== undefined) found.task.description = patch.description || undefined;
    if (patch.completionCriteria !== undefined) {
      found.task.completionCriteria = patch.completionCriteria || undefined;
    }
    if (patch.required !== undefined) found.task.required = patch.required;
    if (patch.countsTowardProgress !== undefined) {
      found.task.countsTowardProgress = patch.countsTowardProgress;
    }
    if (patch.weight !== undefined) found.task.weight = patch.weight;
    if (patch.dueOffsetDays !== undefined) found.task.dueOffsetDays = patch.dueOffsetDays;
    if (patch.dependsOnTaskKeys !== undefined) {
      found.task.dependsOnTaskKeys = [...patch.dependsOnTaskKeys];
    }
    return;
  }
  if (command.type === 'move_task') {
    const found = requireTask(stages, command.taskKey);
    found.stage.tasks.splice(found.index, 1);
    const target = requireStage(stages, command.toStageKey);
    insertAfter(target.tasks, found.task, command.afterTaskKey, (item) => item.stableKey);
    return;
  }
  if (command.type === 'delete_task') {
    const found = requireTask(stages, command.taskKey);
    found.stage.tasks.splice(found.index, 1);
    for (const stage of stages) {
      for (const task of stage.tasks) {
        task.dependsOnTaskKeys = task.dependsOnTaskKeys.filter((key) => key !== command.taskKey);
      }
    }
  }
}

function reconcileTasks(input: {
  current: OnboardingPlanAggregate;
  nextStages: StoredStageDefinition[];
  startAt: string;
  actorId: string;
  idempotencyKey: string;
  nextPlanRevision: number;
  now: string;
}) {
  const currentDefinitions = new Map(
    input.current.definition.stages.flatMap((stage) =>
      stage.tasks.map((task) => [task.stableKey, task] as const),
    ),
  );
  const currentTasks = new Map(input.current.tasks.map((task) => [task.stableKey, task] as const));
  const nextTasks: StoredTaskInstance[] = [];
  const resetEvents: StoredTaskEvent[] = [];
  let tasksAdded = 0;
  let completedTasksRetained = 0;
  let completedTasksReset = 0;

  for (const stage of input.nextStages) {
    for (const definition of stage.tasks) {
      const existing = currentTasks.get(definition.stableKey);
      const priorDefinition = currentDefinitions.get(definition.stableKey);
      if (!existing) {
        tasksAdded += 1;
        nextTasks.push({
          id: randomUUID(),
          planId: input.current.plan.id,
          definitionId: definition.id,
          stableKey: definition.stableKey,
          stageId: stage.id,
          status: 'not_started',
          ...(definition.dueOffsetDays !== undefined
            ? { dueAt: addDays(input.startAt, definition.dueOffsetDays) }
            : {}),
          revision: 0,
        });
        continue;
      }
      const meaningChanged =
        (priorDefinition?.completionCriteria ?? '') !== (definition.completionCriteria ?? '');
      const reset = meaningChanged && existing.status !== 'not_started';
      if (existing.status === 'completed') {
        if (reset) completedTasksReset += 1;
        else completedTasksRetained += 1;
      }
      const next: StoredTaskInstance = {
        ...existing,
        definitionId: definition.id,
        stageId: stage.id,
        ...(definition.dueOffsetDays !== undefined
          ? { dueAt: addDays(input.startAt, definition.dueOffsetDays) }
          : { dueAt: undefined }),
        ...(reset
          ? {
              status: 'not_started',
              completedAt: undefined,
              completedBy: undefined,
              revision: existing.revision + 1,
            }
          : {}),
      };
      nextTasks.push(next);
      if (reset) {
        resetEvents.push({
          id: randomUUID(),
          planId: input.current.plan.id,
          taskId: existing.id,
          actorId: input.actorId,
          fromStatus: existing.status,
          toStatus: 'not_started',
          source: 'roadmap_edit',
          idempotencyKey: `${input.idempotencyKey}:reset:${existing.id}`,
          taskRevision: next.revision,
          planRevision: input.nextPlanRevision,
          createdAt: input.now,
        });
      }
      currentTasks.delete(definition.stableKey);
    }
  }

  const retiredTaskIds = [...currentTasks.values()].map((task) => task.id);
  const completedRetired = [...currentTasks.values()].filter(
    (task) => task.status === 'completed',
  ).length;
  const impact: RoadmapChangeImpact = {
    tasksAdded,
    tasksRetired: retiredTaskIds.length,
    completedTasksRetained,
    completedTasksReset: completedTasksReset + completedRetired,
    destructive: completedTasksReset + completedRetired > 0,
  };
  return { tasks: nextTasks, retiredTaskIds, resetEvents, impact };
}

function createStoredTask(task: OnboardingTaskDefinitionInput) {
  return {
    id: randomUUID(),
    stableKey: task.stableKey,
    title: task.title,
    ...(task.description ? { description: task.description } : {}),
    ...(task.completionCriteria ? { completionCriteria: task.completionCriteria } : {}),
    required: task.required ?? true,
    countsTowardProgress: task.countsTowardProgress ?? true,
    weight: task.weight ?? 1,
    ...(task.dueOffsetDays !== undefined ? { dueOffsetDays: task.dueOffsetDays } : {}),
    dependsOnTaskKeys: task.dependsOnTaskKeys ?? [],
  };
}

function requireStage(stages: StoredStageDefinition[], key: string): StoredStageDefinition {
  const stage = stages.find((candidate) => candidate.stableKey === key);
  if (!stage) throw AppError.notFound('Roadmap stage not found.');
  return stage;
}

function findTask(stages: StoredStageDefinition[], key: string) {
  for (const stage of stages) {
    const index = stage.tasks.findIndex((task) => task.stableKey === key);
    if (index >= 0) return { stage, task: stage.tasks[index]!, index };
  }
  return undefined;
}

function requireTask(stages: StoredStageDefinition[], key: string) {
  const found = findTask(stages, key);
  if (!found) throw AppError.notFound('Roadmap task not found.');
  return found;
}

function insertAfter<T>(
  items: T[],
  item: T,
  afterKey: string | undefined,
  keyOf: (item: T) => string,
): void {
  if (!afterKey) {
    items.push(item);
    return;
  }
  const index = items.findIndex((candidate) => keyOf(candidate) === afterKey);
  if (index < 0) throw AppError.validation('The requested insertion position does not exist.');
  items.splice(index + 1, 0, item);
}

function moveAfter<T>(
  items: T[],
  key: string,
  afterKey: string | undefined,
  keyOf: (item: T) => string,
): void {
  if (key === afterKey) return;
  const index = items.findIndex((item) => keyOf(item) === key);
  if (index < 0) throw AppError.notFound('The item to move was not found.');
  const [item] = items.splice(index, 1);
  if (!afterKey) items.unshift(item!);
  else insertAfter(items, item!, afterKey, keyOf);
}

function reindexStages(stages: StoredStageDefinition[]): void {
  stages.forEach((stage, index) => {
    stage.position = index + 1;
  });
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

function assertStableKey(value: string, label: string): void {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(value) || value.length > 120) {
    throw AppError.validation(`${label} key is invalid.`);
  }
}

function assertAcyclic(nodes: Array<{ key: string; dependencies: string[] }>, label: string): void {
  const dependencies = new Map(nodes.map((node) => [node.key, node.dependencies] as const));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(key: string): void {
    if (visiting.has(key)) throw AppError.validation(`The ${label} dependency graph has a cycle.`);
    if (visited.has(key)) return;
    visiting.add(key);
    for (const dependency of dependencies.get(key) ?? []) visit(dependency);
    visiting.delete(key);
    visited.add(key);
  }
  for (const node of nodes) visit(node.key);
}

function addDays(isoDate: string, days: number): string {
  const value = new Date(isoDate);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString();
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
