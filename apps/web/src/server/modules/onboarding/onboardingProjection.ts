import type {
  OnboardingTaskProjection,
  RoadmapStageProjection,
  WorkspaceOnboardingProjection,
} from '@onboarding/shared';
import type {
  OnboardingPlanAggregate,
  StoredStageDefinition,
  StoredTaskDefinition,
  StoredTaskInstance,
} from './onboarding.repository';

export function calculateOnboardingProjection(
  aggregate: OnboardingPlanAggregate,
  asOf = new Date(),
): WorkspaceOnboardingProjection {
  const taskDefinitionById = new Map<string, StoredTaskDefinition>();
  const stageByTaskDefinitionId = new Map<string, StoredStageDefinition>();
  for (const stage of aggregate.definition.stages) {
    for (const task of stage.tasks) {
      taskDefinitionById.set(task.id, task);
      stageByTaskDefinitionId.set(task.id, stage);
    }
  }

  const tasks = aggregate.tasks
    .map((task) => toTaskProjection(task, taskDefinitionById, stageByTaskDefinitionId, asOf))
    .sort(compareTasks(aggregate.definition.stages));
  const tasksByStageId = new Map<string, OnboardingTaskProjection[]>();
  for (const task of tasks) {
    const stageTasks = tasksByStageId.get(task.stageId) ?? [];
    stageTasks.push(task);
    tasksByStageId.set(task.stageId, stageTasks);
  }

  const orderedStages = [...aggregate.definition.stages].sort(
    (left, right) =>
      left.position - right.position || left.stableKey.localeCompare(right.stableKey),
  );
  const baseStages = orderedStages.map((stage) =>
    toBaseStageProjection(stage, tasksByStageId.get(stage.id) ?? []),
  );
  const completedStageKeys = new Set(
    baseStages.filter((stage) => stage.status === 'completed').map((stage) => stage.stableKey),
  );
  const currentStage = baseStages.find((stage) => {
    if (stage.status === 'completed' || stage.status === 'status-unavailable') return false;
    const definition = orderedStages.find((candidate) => candidate.id === stage.id);
    return definition?.dependsOnStageKeys.every((key) => completedStageKeys.has(key)) ?? false;
  });
  const roadmap = baseStages.map((stage) => {
    if (stage.status === 'upcoming') {
      const stageTasks = tasksByStageId.get(stage.id) ?? [];
      if (stage.id === currentStage?.id || stageTasks.some(hasStarted)) {
        return { ...stage, status: 'in-progress' as const };
      }
    }
    return stage;
  });

  const applicable = tasks.filter((task) => task.countsTowardProgress && task.status !== 'waived');
  const completed = applicable.filter((task) => task.status === 'completed');
  const completedWeight = completed.reduce((total, task) => total + task.weight, 0);
  const totalWeight = applicable.reduce((total, task) => total + task.weight, 0);
  const upcomingTasks = tasks
    .filter((task) => task.status !== 'completed' && task.status !== 'waived')
    .sort((left, right) => {
      if (left.dueAt && right.dueAt) return left.dueAt.localeCompare(right.dueAt);
      if (left.dueAt) return -1;
      if (right.dueAt) return 1;
      return 0;
    })
    .slice(0, 5);

  return {
    planId: aggregate.plan.id,
    planRevision: aggregate.plan.revision,
    planStatus: aggregate.plan.status,
    definitionVersionId: aggregate.definition.id,
    calculatedAt: asOf.toISOString(),
    progress: {
      percentComplete: totalWeight === 0 ? null : Math.round((completedWeight / totalWeight) * 100),
      completedWeight,
      totalWeight,
      completedTaskCount: completed.length,
      totalTaskCount: applicable.length,
      currentStageId: currentStage?.id ?? null,
    },
    roadmap,
    tasks,
    upcomingTasks,
  };
}

function toTaskProjection(
  task: StoredTaskInstance,
  definitionById: Map<string, StoredTaskDefinition>,
  stageByDefinitionId: Map<string, StoredStageDefinition>,
  asOf: Date,
): OnboardingTaskProjection {
  const definition = definitionById.get(task.definitionId);
  const stage = stageByDefinitionId.get(task.definitionId);
  if (!definition || !stage) {
    throw new Error(`Task instance ${task.id} references a missing immutable definition.`);
  }
  return {
    id: task.id,
    planId: task.planId,
    stageId: stage.id,
    stableKey: definition.stableKey,
    title: definition.title,
    ...(definition.description ? { description: definition.description } : {}),
    status: task.status,
    required: definition.required,
    countsTowardProgress: definition.countsTowardProgress,
    weight: definition.weight,
    ...(task.dueAt ? { dueAt: task.dueAt } : {}),
    ...(task.completedAt ? { completedAt: task.completedAt } : {}),
    revision: task.revision,
    overdue:
      Boolean(task.dueAt) &&
      task.status !== 'completed' &&
      task.status !== 'waived' &&
      new Date(task.dueAt!).getTime() < asOf.getTime(),
  };
}

function toBaseStageProjection(
  stage: StoredStageDefinition,
  tasks: OnboardingTaskProjection[],
): RoadmapStageProjection {
  const requiredTasks = tasks.filter((task) => task.required);
  const completionTasks = requiredTasks.length > 0 ? requiredTasks : tasks;
  const completed =
    completionTasks.length > 0 &&
    completionTasks.every((task) => task.status === 'completed' || task.status === 'waived');
  const overdue = tasks.some((task) => task.overdue);
  const completedDates = tasks
    .map((task) => task.completedAt)
    .filter((value): value is string => Boolean(value))
    .sort();
  const dueDates = tasks
    .map((task) => task.dueAt)
    .filter((value): value is string => Boolean(value))
    .sort();

  return {
    id: stage.id,
    stableKey: stage.stableKey,
    position: stage.position,
    title: stage.title,
    description: stage.description,
    status:
      tasks.length === 0
        ? 'status-unavailable'
        : completed
          ? 'completed'
          : overdue
            ? 'overdue'
            : 'upcoming',
    ...(stage.guideStepId ? { guideStepId: stage.guideStepId } : {}),
    ...(dueDates.at(-1) ? { dueAt: dueDates.at(-1) } : {}),
    ...(completed ? { completedAt: completedDates.at(-1) } : {}),
    completedTaskCount: tasks.filter(
      (task) => task.status === 'completed' || task.status === 'waived',
    ).length,
    totalTaskCount: tasks.length,
  };
}

function compareTasks(stages: StoredStageDefinition[]) {
  const stagePosition = new Map(stages.map((stage) => [stage.id, stage.position]));
  const taskPosition = new Map(
    stages.flatMap((stage) => stage.tasks.map((task, index) => [task.stableKey, index] as const)),
  );
  return (left: OnboardingTaskProjection, right: OnboardingTaskProjection) =>
    (stagePosition.get(left.stageId) ?? 0) - (stagePosition.get(right.stageId) ?? 0) ||
    (taskPosition.get(left.stableKey) ?? 0) - (taskPosition.get(right.stableKey) ?? 0) ||
    left.title.localeCompare(right.title);
}

function hasStarted(task: OnboardingTaskProjection): boolean {
  return task.status === 'in_progress' || task.status === 'blocked' || task.status === 'completed';
}
