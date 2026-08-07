'use client';

import { useState } from 'react';
import { useWorkspaceChat } from './useWorkspaceChat';
import { useWorkspaceGuide } from './useWorkspaceGuide';
import { useWorkspaceNavigationState } from './useWorkspaceNavigationState';
import { useWorkspaceOnboarding } from './useWorkspaceOnboarding';
import { useWorkspaceRouteFocus } from './useWorkspaceRouteFocus';
import { useWorkspaceSessions } from './useWorkspaceSessions';
import type {
  WorkspaceController,
  WorkspaceControllerOptions,
  WorkspacePageMeta,
} from './workspaceController.types';

export function useWorkspaceController({
  account,
  pathname,
}: WorkspaceControllerOptions): WorkspaceController {
  const sessions = useWorkspaceSessions();
  const guide = useWorkspaceGuide({
    activeSessionId: sessions.state.activeSessionId,
    guideSessionId: sessions.state.guideSessionId,
  });
  const chat = useWorkspaceChat({
    clearApiError: sessions.clearApiError,
    clearReference: guide.clearReference,
    dispatch: sessions.dispatch,
    focusFromChat: guide.focusFromChat,
    mergeChatSources: guide.mergeChatSources,
    referencedStep: guide.referencedStep,
    state: sessions.state,
  });
  const navigation = useWorkspaceNavigationState();
  const headingRef = useWorkspaceRouteFocus(pathname);
  const [isAssistantMinimized, setIsAssistantMinimized] = useState(false);

  const activeSessionId = sessions.state.activeSessionId;
  const onboarding = useWorkspaceOnboarding(activeSessionId);
  const activeMessages = activeSessionId
    ? (sessions.state.messagesBySessionId[activeSessionId] ?? [])
    : [];
  const isRunning = activeSessionId
    ? sessions.state.runningSessionIds.includes(activeSessionId)
    : false;

  return {
    account: { label: account.displayName ?? account.email ?? account.userId },
    route: {
      apiError: sessions.apiError ?? guide.apiError ?? onboarding.error,
      graph: guide.graph,
      headingRef,
      isGuideEmpty: guide.isGuideEmpty,
      isLoading: sessions.isBootstrapping || guide.isLoading,
      knowledgeMapEnabled: guide.knowledgeMapEnabled,
      onboarding: onboarding.state,
      onboardingIsLoading: onboarding.isLoading,
      pendingTaskIds: onboarding.pendingTaskIds,
      roadmapHistory: onboarding.history,
      roadmapIsMutating: onboarding.isMutating,
      roadmapProposal: onboarding.proposal,
      meta: getWorkspacePageMeta(pathname, account.displayName),
      onReferenceStep(stepId) {
        guide.referenceStep(stepId);
        setIsAssistantMinimized(false);
      },
      onRetry() {
        guide.retry();
        void onboarding.reload();
      },
      onCreateRoadmap: onboarding.createManual,
      onGenerateRoadmap: onboarding.generate,
      onRoadmapCommand: onboarding.command,
      onProposeRoadmapChange: onboarding.propose,
      onApplyRoadmapProposal: onboarding.applyProposal,
      onDismissRoadmapProposal: onboarding.dismissProposal,
      onCancelRoadmap: onboarding.cancel,
      onTransitionTask: onboarding.transitionTask,
      sources: guide.sources,
    },
    navigation,
    assistant: {
      activeMessages,
      activeSessionId,
      deleteError: sessions.state.deleteError,
      deletingSessionId: sessions.state.deletingSessionId,
      isMinimized: isAssistantMinimized,
      isRunning,
      onAddReference: guide.selectReferenceCandidate,
      onCreateSession: sessions.createWorkspaceSession,
      onDeleteSession: sessions.deleteWorkspaceSession,
      onRemoveReference: guide.clearReference,
      onSelectSession: sessions.selectWorkspaceSession,
      onSendMessage: chat.sendWorkspaceMessage,
      referenceCandidate: guide.referenceCandidate,
      referencedStep: guide.referencedStep,
      sessions: sessions.state.sessions,
      setMinimized: setIsAssistantMinimized,
    },
  };
}

export function getWorkspacePageMeta(
  pathname: string,
  displayName: string | undefined,
): WorkspacePageMeta {
  if (pathname === '/workspace/tasks' || pathname.startsWith('/workspace/tasks/')) {
    return {
      title: 'Tasks',
      subtitle: 'Review the work assigned to your onboarding journey.',
      showWave: false,
    };
  }
  if (pathname === '/workspace/resources' || pathname.startsWith('/workspace/resources/')) {
    return {
      title: 'Resources',
      subtitle: 'Find authorized guides and references for your role.',
      showWave: false,
    };
  }
  return {
    title: displayName ? `Welcome back, ${displayName}` : 'Welcome back',
    subtitle: "Here's your onboarding overview",
    showWave: Boolean(displayName),
  };
}
