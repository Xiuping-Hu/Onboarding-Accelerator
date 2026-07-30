'use client';

import type { GuideGraph, KnowledgeSource } from '@onboarding/shared';
import { createContext, useContext, type ReactNode } from 'react';

export interface WorkspaceRouteState {
  apiError: string | null;
  graph: GuideGraph | null;
  isGuideEmpty: boolean;
  isLoading: boolean;
  knowledgeMapEnabled: boolean;
  onReferenceStep: (stepId: string) => void;
  onRetry: () => void;
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
