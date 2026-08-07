'use client';

import type {
  GuideGraph,
  KnowledgeSource,
  OnboardingTaskMutationSource,
  OnboardingTaskStatus,
  OnboardingPlanRevisionEvent,
  RoadmapChangeProposal,
  RoadmapCommand,
  WorkspaceOnboardingState,
} from '@onboarding/shared';
import { createContext, useContext, type ReactNode } from 'react';

export interface WorkspaceRouteState {
  apiError: string | null;
  graph: GuideGraph | null;
  isGuideEmpty: boolean;
  isLoading: boolean;
  knowledgeMapEnabled: boolean;
  onboarding: WorkspaceOnboardingState | null;
  onboardingIsLoading: boolean;
  pendingTaskIds: string[];
  roadmapHistory: OnboardingPlanRevisionEvent[];
  roadmapIsMutating: boolean;
  roadmapProposal: RoadmapChangeProposal | null;
  onReferenceStep: (stepId: string) => void;
  onRetry: () => void;
  onCreateRoadmap: (title: string) => Promise<void>;
  onGenerateRoadmap: (goal: string, role?: string) => Promise<void>;
  onRoadmapCommand: (command: RoadmapCommand) => Promise<void>;
  onProposeRoadmapChange: (instruction: string, selectedStageKey?: string) => Promise<void>;
  onApplyRoadmapProposal: () => Promise<void>;
  onDismissRoadmapProposal: () => Promise<void>;
  onCancelRoadmap: (reason: string) => Promise<void>;
  onTransitionTask: (
    taskId: string,
    status: OnboardingTaskStatus,
    expectedRevision: number,
    source: OnboardingTaskMutationSource,
  ) => Promise<void>;
  sources: KnowledgeSource[];
}

const WorkspaceRouteContext = createContext<WorkspaceRouteState | null>(null);

export function WorkspaceRouteProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: WorkspaceRouteState;
}) {
  return <WorkspaceRouteContext.Provider value={value}>{children}</WorkspaceRouteContext.Provider>;
}

export function useWorkspaceRoute() {
  const value = useContext(WorkspaceRouteContext);
  if (!value) {
    throw new Error('Workspace route content must be rendered inside WorkspaceRouteProvider.');
  }
  return value;
}
