import type {
  OnboardingProgress,
  OnboardingTaskStatus,
  SourceReference,
  StaticRoadmapStage,
  StaticRoadmapTask,
  UserRoadmapTaskState,
  WorkspaceOnboardingState,
} from '@onboarding/shared';
import { getDisplaySourceState, type DisplaySourceLink } from './sourceLinks';

export type WorkspaceRoadmapStageStatus =
  | 'completed'
  | 'in-progress'
  | 'upcoming'
  | 'overdue'
  | 'status-unavailable';

export interface WorkspaceTask extends StaticRoadmapTask {
  taskInstanceId: string;
  stageId: string;
  status: OnboardingTaskStatus;
  taskRevision: number;
  dueAt?: string;
  completedAt?: string;
  completedBy?: string;
  overdue: boolean;
}

export interface WorkspaceRoadmapStage extends Omit<StaticRoadmapStage, 'tasks'> {
  status: WorkspaceRoadmapStageStatus;
  dueAt?: string;
  completedAt?: string;
  completedTaskCount: number;
  totalTaskCount: number;
}

export type WorkspaceRoadmapState =
  | { status: 'unavailable'; stages: []; reason: 'onboarding-unavailable' }
  | {
      status: 'empty';
      stages: [];
      reason: 'roadmap-preparing' | 'no-roadmap-content';
      message: string;
    }
  | {
      status: 'ready';
      roadmapId: string;
      versionId: string;
      versionNumber: number;
      title: string;
      sourceReferences: SourceReference[];
      stages: WorkspaceRoadmapStage[];
    };

export interface WorkspaceProgressSummary {
  completedTaskCount: number;
  totalTaskCount: number;
  percentComplete: number;
  currentStage: WorkspaceRoadmapStage | null;
}

export type WorkspaceProgressState =
  | {
      status: 'unavailable';
      summary: null;
      reason: 'onboarding-unavailable' | 'no-progress-tasks';
    }
  | { status: 'empty'; summary: null; message: string }
  | { status: 'ready'; summary: WorkspaceProgressSummary };

export type WorkspaceUpcomingTasksState =
  | { status: 'unavailable'; items: []; reason: 'onboarding-unavailable' }
  | { status: 'empty'; items: [] }
  | { status: 'ready'; items: WorkspaceTask[] };

export type WorkspaceResourcesState =
  | {
      status: 'unavailable';
      items: DisplaySourceLink[];
      reason: 'onboarding-unavailable' | 'source-links-unavailable';
    }
  | { status: 'empty'; items: DisplaySourceLink[] }
  | { status: 'ready'; items: DisplaySourceLink[] };

export interface WorkspaceDashboardModel {
  roadmap: WorkspaceRoadmapState;
  progress: WorkspaceProgressState;
  upcomingTasks: WorkspaceUpcomingTasksState;
  resources: WorkspaceResourcesState;
}

export function createWorkspaceDashboardModel(
  onboarding: WorkspaceOnboardingState | null,
): WorkspaceDashboardModel {
  return {
    roadmap: deriveWorkspaceRoadmap(onboarding),
    progress: deriveWorkspaceProgress(onboarding),
    upcomingTasks: deriveUpcomingTasks(onboarding),
    resources: deriveWorkspaceResources(onboarding),
  };
}

export function deriveWorkspaceRoadmap(
  onboarding: WorkspaceOnboardingState | null,
): WorkspaceRoadmapState {
  if (!onboarding) {
    return { status: 'unavailable', stages: [], reason: 'onboarding-unavailable' };
  }
  if (onboarding.status === 'empty') {
    return {
      status: 'empty',
      stages: [],
      reason: 'roadmap-preparing',
      message: onboarding.message,
    };
  }
  if (onboarding.roadmap.stages.length === 0) {
    return {
      status: 'empty',
      stages: [],
      reason: 'no-roadmap-content',
      message: 'Roadmap is being prepared from the latest knowledge base.',
    };
  }

  const tasks = joinRoadmapTasks(onboarding.roadmap.stages, onboarding.userState.tasks);
  return {
    status: 'ready',
    roadmapId: onboarding.roadmap.roadmapId,
    versionId: onboarding.roadmap.versionId,
    versionNumber: onboarding.roadmap.versionNumber,
    title: onboarding.roadmap.title,
    sourceReferences: onboarding.roadmap.sourceReferences,
    stages: onboarding.roadmap.stages.map((stage) =>
      createStageProjection(stage, tasks, onboarding.userState.progress),
    ),
  };
}

export function deriveWorkspaceProgress(
  onboarding: WorkspaceOnboardingState | null,
): WorkspaceProgressState {
  if (!onboarding) {
    return { status: 'unavailable', summary: null, reason: 'onboarding-unavailable' };
  }
  if (onboarding.status === 'empty') {
    return { status: 'empty', summary: null, message: onboarding.message };
  }

  const roadmap = deriveWorkspaceRoadmap(onboarding);
  if (roadmap.status === 'empty') {
    return { status: 'empty', summary: null, message: roadmap.message };
  }
  if (roadmap.status === 'unavailable') {
    return { status: 'unavailable', summary: null, reason: 'onboarding-unavailable' };
  }

  const { progress } = onboarding.userState;
  if (progress.percentComplete === null) {
    return { status: 'unavailable', summary: null, reason: 'no-progress-tasks' };
  }
  return {
    status: 'ready',
    summary: {
      completedTaskCount: progress.completedTaskCount,
      totalTaskCount: progress.totalTaskCount,
      percentComplete: progress.percentComplete,
      currentStage: roadmap.stages.find((stage) => stage.id === progress.currentStageId) ?? null,
    },
  };
}

export function deriveUpcomingTasks(
  onboarding: WorkspaceOnboardingState | null,
): WorkspaceUpcomingTasksState {
  if (!onboarding) {
    return { status: 'unavailable', items: [], reason: 'onboarding-unavailable' };
  }
  if (onboarding.status === 'empty' || onboarding.userState.upcomingTasks.length === 0) {
    return { status: 'empty', items: [] };
  }
  const items = joinRoadmapTasks(onboarding.roadmap.stages, onboarding.userState.upcomingTasks);
  return items.length > 0 ? { status: 'ready', items } : { status: 'empty', items: [] };
}

export function deriveAllTasks(onboarding: WorkspaceOnboardingState): WorkspaceTask[] {
  if (onboarding.status === 'empty') return [];
  return joinRoadmapTasks(onboarding.roadmap.stages, onboarding.userState.tasks);
}

export function deriveWorkspaceResources(
  onboarding: WorkspaceOnboardingState | null,
): WorkspaceResourcesState {
  if (!onboarding || onboarding.status === 'empty') {
    return { status: 'unavailable', items: [], reason: 'onboarding-unavailable' };
  }
  const displaySources = getDisplaySourceState(onboarding.roadmap.sourceReferences);
  if (displaySources.status === 'error') {
    return { status: 'unavailable', items: [], reason: 'source-links-unavailable' };
  }
  if (displaySources.status === 'empty') return { status: 'empty', items: [] };
  return { status: 'ready', items: displaySources.links };
}

function joinRoadmapTasks(
  stages: StaticRoadmapStage[],
  userTasks: UserRoadmapTaskState[],
): WorkspaceTask[] {
  const definitions = new Map<
    string,
    { definition: StaticRoadmapTask; stageId: string; stagePosition: number }
  >();
  for (const stage of stages) {
    for (const definition of stage.tasks) {
      definitions.set(definition.id, {
        definition,
        stageId: stage.id,
        stagePosition: stage.position,
      });
    }
  }

  return userTasks
    .flatMap((userTask) => {
      const match = definitions.get(userTask.canonicalItemId);
      if (!match || match.definition.stableKey !== userTask.stableKey) return [];
      return [toWorkspaceTask(match.definition, match.stageId, match.stagePosition, userTask)];
    })
    .sort((left, right) =>
      left.stagePosition === right.stagePosition
        ? left.position - right.position
        : left.stagePosition - right.stagePosition,
    )
    .map(({ stagePosition: _, ...task }) => task);
}

function toWorkspaceTask(
  definition: StaticRoadmapTask,
  stageId: string,
  stagePosition: number,
  userTask: UserRoadmapTaskState,
): WorkspaceTask & { stagePosition: number } {
  const completed = userTask.status === 'completed' || userTask.status === 'waived';
  return {
    ...definition,
    taskInstanceId: userTask.taskInstanceId,
    stageId,
    stagePosition,
    status: userTask.status,
    taskRevision: userTask.taskRevision,
    ...(userTask.dueAt ? { dueAt: userTask.dueAt } : {}),
    ...(userTask.completedAt ? { completedAt: userTask.completedAt } : {}),
    ...(userTask.completedBy ? { completedBy: userTask.completedBy } : {}),
    overdue: !completed && Boolean(userTask.dueAt && Date.parse(userTask.dueAt) < Date.now()),
  };
}

function createStageProjection(
  stage: StaticRoadmapStage,
  tasks: WorkspaceTask[],
  progress: OnboardingProgress,
): WorkspaceRoadmapStage {
  const stageTasks = tasks.filter((task) => task.stageId === stage.id);
  const completedTasks = stageTasks.filter(
    (task) => task.status === 'completed' || task.status === 'waived',
  );
  const dueDates = stageTasks.flatMap((task) => (task.dueAt ? [task.dueAt] : []));
  const completionDates = completedTasks.flatMap((task) =>
    task.completedAt ? [task.completedAt] : [],
  );

  let status: WorkspaceRoadmapStageStatus = 'upcoming';
  if (stageTasks.length === 0) status = 'status-unavailable';
  else if (stageTasks.some((task) => task.overdue)) status = 'overdue';
  else if (completedTasks.length === stageTasks.length) status = 'completed';
  else if (
    progress.currentStageId === stage.id ||
    stageTasks.some((task) => task.status !== 'not_started')
  ) {
    status = 'in-progress';
  }

  return {
    id: stage.id,
    stableKey: stage.stableKey,
    position: stage.position,
    title: stage.title,
    description: stage.description,
    dependsOnStageKeys: stage.dependsOnStageKeys,
    status,
    ...(dueDates.length > 0 ? { dueAt: dueDates.sort().at(-1) } : {}),
    ...(status === 'completed' && completionDates.length > 0
      ? { completedAt: completionDates.sort().at(-1) }
      : {}),
    completedTaskCount: completedTasks.length,
    totalTaskCount: stageTasks.length,
  };
}
