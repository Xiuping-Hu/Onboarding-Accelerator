'use client';

import type {
  GuideGraph,
  KnowledgeSource,
  OnboardingTaskMutationSource,
  OnboardingTaskStatus,
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
  onReferenceStep: (stepId: string) => void;
  onRetry: () => void;
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
