import type {
  GuideGraph,
  OnboardingTaskProjection,
  RoadmapStageProjection,
  WorkspaceOnboardingState,
} from '@onboarding/shared';
import { getDisplaySourceState, type DisplaySourceLink } from './sourceLinks';

export type WorkspaceRoadmapStage = RoadmapStageProjection;

export type WorkspaceRoadmapState =
  | { status: 'unavailable'; stages: []; reason: 'onboarding-unavailable' }
  | { status: 'empty'; stages: []; reason: 'no-active-plan' }
  | { status: 'ready'; stages: WorkspaceRoadmapStage[] };

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
  | { status: 'empty'; summary: null }
  | { status: 'ready'; summary: WorkspaceProgressSummary };

export type WorkspaceUpcomingTasksState =
  | { status: 'unavailable'; items: []; reason: 'onboarding-unavailable' }
  | { status: 'empty'; items: [] }
  | { status: 'ready'; items: OnboardingTaskProjection[] };

export type WorkspaceResourcesState =
  | {
      status: 'unavailable';
      items: DisplaySourceLink[];
      reason: 'guide-unavailable' | 'source-links-unavailable';
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
  graph: GuideGraph | null,
  onboarding: WorkspaceOnboardingState | null,
): WorkspaceDashboardModel {
  return {
    roadmap: deriveWorkspaceRoadmap(onboarding),
    progress: deriveWorkspaceProgress(onboarding),
    upcomingTasks: deriveUpcomingTasks(onboarding),
    resources: deriveWorkspaceResources(graph),
  };
}

export function deriveWorkspaceRoadmap(
  onboarding: WorkspaceOnboardingState | null,
): WorkspaceRoadmapState {
  if (!onboarding) {
    return { status: 'unavailable', stages: [], reason: 'onboarding-unavailable' };
  }
  if (onboarding.status === 'empty') {
    return { status: 'empty', stages: [], reason: 'no-active-plan' };
  }
  return { status: 'ready', stages: onboarding.projection.roadmap };
}

export function deriveWorkspaceProgress(
  onboarding: WorkspaceOnboardingState | null,
): WorkspaceProgressState {
  if (!onboarding) {
    return { status: 'unavailable', summary: null, reason: 'onboarding-unavailable' };
  }
  if (onboarding.status === 'empty') return { status: 'empty', summary: null };
  const { progress, roadmap } = onboarding.projection;
  if (progress.percentComplete === null) {
    return { status: 'unavailable', summary: null, reason: 'no-progress-tasks' };
  }
  return {
    status: 'ready',
    summary: {
      completedTaskCount: progress.completedTaskCount,
      totalTaskCount: progress.totalTaskCount,
      percentComplete: progress.percentComplete,
      currentStage: roadmap.find((stage) => stage.id === progress.currentStageId) ?? null,
    },
  };
}

export function deriveUpcomingTasks(
  onboarding: WorkspaceOnboardingState | null,
): WorkspaceUpcomingTasksState {
  if (!onboarding) {
    return { status: 'unavailable', items: [], reason: 'onboarding-unavailable' };
  }
  if (onboarding.status === 'empty' || onboarding.projection.upcomingTasks.length === 0) {
    return { status: 'empty', items: [] };
  }
  return { status: 'ready', items: onboarding.projection.upcomingTasks };
}

export function deriveWorkspaceResources(graph: GuideGraph | null): WorkspaceResourcesState {
  if (!graph) {
    return { status: 'unavailable', items: [], reason: 'guide-unavailable' };
  }
  const displaySources = getDisplaySourceState(graph.sources);
  if (displaySources.status === 'error') {
    return { status: 'unavailable', items: [], reason: 'source-links-unavailable' };
  }
  if (displaySources.status === 'empty') return { status: 'empty', items: [] };
  return { status: 'ready', items: displaySources.links };
}
