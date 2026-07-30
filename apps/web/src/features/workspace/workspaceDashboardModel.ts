import type { GuideGraph } from '@onboarding/shared';
import { getDisplaySourceState, type DisplaySourceLink } from './sourceLinks';

export type WorkspaceRoadmapStageStatus =
  | 'completed'
  | 'in-progress'
  | 'upcoming'
  | 'status-unavailable';

export interface WorkspaceRoadmapStage {
  id: string;
  position: number;
  title: string;
  description: string;
  status: WorkspaceRoadmapStageStatus;
}

export type WorkspaceRoadmapState =
  | {
      status: 'unavailable';
      stages: WorkspaceRoadmapStage[];
      reason: 'guide-unavailable' | 'invalid-roadmap';
    }
  | {
      status: 'empty';
      stages: WorkspaceRoadmapStage[];
      reason: 'not-created' | 'no-stages';
    }
  | {
      status: 'partial';
      stages: WorkspaceRoadmapStage[];
      missingStageCount: number;
    }
  | { status: 'ready'; stages: WorkspaceRoadmapStage[] };

export interface WorkspaceProgressSummary {
  completedStageCount: number;
  totalStageCount: number;
  percentComplete: number;
  currentStage: WorkspaceRoadmapStage | null;
}

export type WorkspaceProgressState =
  | {
      status: 'unavailable';
      summary: null;
      reason:
        | 'guide-unavailable'
        | 'invalid-roadmap'
        | 'partial-roadmap'
        | 'progress-contract-unavailable';
    }
  | { status: 'empty'; summary: null }
  | { status: 'ready'; summary: WorkspaceProgressSummary };

export interface WorkspaceUpcomingTasksState {
  status: 'unavailable';
  items: [];
  reason: 'task-contract-unavailable';
}

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

/**
 * Builds only the dashboard data supported by today's guide contract. In particular, guide nodes
 * are not treated as tasks and graph sources are not exposed until their links pass the existing
 * source-link normalization policy.
 */
export function createWorkspaceDashboardModel(graph: GuideGraph | null): WorkspaceDashboardModel {
  const roadmap = deriveWorkspaceRoadmap(graph);

  return {
    roadmap,
    progress: deriveWorkspaceProgress(roadmap),
    upcomingTasks: getUnavailableUpcomingTasks(),
    resources: deriveWorkspaceResources(graph),
  };
}

export function deriveWorkspaceRoadmap(graph: GuideGraph | null): WorkspaceRoadmapState {
  if (!graph) {
    return { status: 'unavailable', stages: [], reason: 'guide-unavailable' };
  }

  if (graph.emptyReason === 'not_created') {
    return { status: 'empty', stages: [], reason: 'not-created' };
  }

  if (graph.steps.length === 0) {
    return { status: 'empty', stages: [], reason: 'no-stages' };
  }

  const root = graph.steps.find((step) => step.id === graph.rootId);
  if (!root) {
    return { status: 'unavailable', stages: [], reason: 'invalid-roadmap' };
  }

  if (root.childIds.length === 0) {
    return { status: 'empty', stages: [], reason: 'no-stages' };
  }

  const stepById = new Map(graph.steps.map((step) => [step.id, step]));
  const seenStageIds = new Set<string>();
  const stages: WorkspaceRoadmapStage[] = [];
  let missingStageCount = 0;

  for (const stageId of root.childIds) {
    const step = stepById.get(stageId);
    if (!step || step.id === root.id || seenStageIds.has(step.id)) {
      missingStageCount += 1;
      continue;
    }

    seenStageIds.add(step.id);
    stages.push({
      id: step.id,
      position: stages.length + 1,
      title: step.title,
      description: step.summary,
      status: 'status-unavailable',
    });
  }

  if (missingStageCount > 0) {
    return { status: 'partial', stages, missingStageCount };
  }

  return { status: 'ready', stages };
}

export function deriveWorkspaceProgress(roadmap: WorkspaceRoadmapState): WorkspaceProgressState {
  if (roadmap.status === 'unavailable') {
    return { status: 'unavailable', summary: null, reason: roadmap.reason };
  }

  if (roadmap.status === 'partial') {
    return { status: 'unavailable', summary: null, reason: 'partial-roadmap' };
  }

  if (roadmap.status === 'empty') {
    return { status: 'empty', summary: null };
  }

  return {
    status: 'unavailable',
    summary: null,
    reason: 'progress-contract-unavailable',
  };
}

export function getUnavailableUpcomingTasks(): WorkspaceUpcomingTasksState {
  return { status: 'unavailable', items: [], reason: 'task-contract-unavailable' };
}

export function deriveWorkspaceResources(graph: GuideGraph | null): WorkspaceResourcesState {
  if (!graph) {
    return { status: 'unavailable', items: [], reason: 'guide-unavailable' };
  }

  const displaySources = getDisplaySourceState(graph.sources);
  if (displaySources.status === 'error') {
    return { status: 'unavailable', items: [], reason: 'source-links-unavailable' };
  }

  if (displaySources.status === 'empty') {
    return { status: 'empty', items: [] };
  }

  return { status: 'ready', items: displaySources.links };
}
