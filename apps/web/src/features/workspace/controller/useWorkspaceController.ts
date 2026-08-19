'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
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
  const router = useRouter();
  const headingRef = useWorkspaceRouteFocus(pathname);
  const [isAssistantMinimized, setIsAssistantMinimized] = useState(false);
  const [isViewingRoadmapNotice, setIsViewingRoadmapNotice] = useState(false);
  const viewingRoadmapNotice = useRef(false);

  const activeSessionId = sessions.state.activeSessionId;
  const onboarding = useWorkspaceOnboarding();
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
      noticeActionPending: isViewingRoadmapNotice || onboarding.pendingNoticeId !== null,
      noticeError: onboarding.noticeError,
      pendingTaskIds: onboarding.pendingTaskIds,
      meta: getWorkspacePageMeta(pathname, account.displayName),
      onDismissRoadmapNotice: onboarding.acknowledgeNotice,
      onRetry() {
        guide.retry();
        void onboarding.reload();
      },
      async onViewRoadmapNotice() {
        if (viewingRoadmapNotice.current || onboarding.pendingNoticeId) return;
        viewingRoadmapNotice.current = true;
        setIsViewingRoadmapNotice(true);
        onboarding.clearNoticeError();
        try {
          const refreshed = await onboarding.reload();
          if (refreshed?.status !== 'ready' || !refreshed.newestUnreadNotice) return;

          const notice = refreshed.newestUnreadNotice;
          if (
            refreshed.roadmap.versionId !== notice.roadmapVersionId ||
            refreshed.userState.appliedVersionId !== notice.roadmapVersionId
          ) {
            onboarding.reportNoticeError(
              'The latest roadmap is still syncing. Try viewing it again in a moment.',
            );
            return;
          }

          router.push('/workspace#onboarding-roadmap');
          try {
            const heading = await waitForRoadmapVersion(notice.roadmapVersionId);
            const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            heading.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
            heading.focus({ preventScroll: true });
          } catch {
            onboarding.reportNoticeError(
              'The latest roadmap could not be opened. Try viewing it again.',
            );
            return;
          }
          await onboarding.acknowledgeNotice(notice.id);
        } finally {
          viewingRoadmapNotice.current = false;
          setIsViewingRoadmapNotice(false);
        }
      },
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

function waitForRoadmapVersion(versionId: string): Promise<HTMLElement> {
  const findHeading = () => {
    const heading = document.getElementById('onboarding-roadmap');
    return heading?.dataset.roadmapVersionId === versionId ? heading : null;
  };
  const existing = findHeading();
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => {
      const heading = findHeading();
      if (!heading) return;
      window.clearTimeout(timeout);
      observer.disconnect();
      resolve(heading);
    });
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error('Roadmap version did not render in time.'));
    }, 5_000);
    observer.observe(document.body, { childList: true, subtree: true });
    const rendered = findHeading();
    if (rendered) {
      window.clearTimeout(timeout);
      observer.disconnect();
      resolve(rendered);
    }
  });
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
