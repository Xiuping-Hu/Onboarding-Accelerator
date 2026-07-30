'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import type {
  ChatMessage,
  GuideGraph,
  KnowledgeSource,
  OnboardingSession,
} from '@onboarding/shared';
import {
  type AccountSession,
  createSession,
  deleteSession,
  getRootGuide,
  listSessions,
  sendChat,
} from '@/features/workspace/api';
import { getAssistantDrawerToggleLabel } from '@/features/workspace/workspaceModel';
import {
  appendSessionMessage,
  indexSessionMessages,
  mergeSources,
  mergeSourcesForActiveSession,
  removeSessionMessages,
  replaceSessionMessages,
} from '@/features/workspace/workspaceThreadModel';
import { ConfirmDialog } from '@/components/common/dialogs/ConfirmDialog';
import { AgentChatDrawer } from './assistant/AgentChatDrawer';
import { WorkspaceAssistantRuntimeProvider } from './assistant/WorkspaceAssistantRuntimeProvider';
import { WorkspaceNavigation } from './navigation/WorkspaceNavigation';
import { WorkspaceRouteProvider } from './WorkspaceRouteContext';

type DeleteError = { message: string; sessionId: string } | null;

function formatError(error: unknown, fallback: string): string {
  return error instanceof Error ? `${fallback} ${error.message}` : fallback;
}

function formatAccountRole(role: string | undefined) {
  return role === 'admin' ? 'Administrator' : 'Member';
}

export function WorkspaceShell({
  account,
  children,
  isSigningOut,
  logoutError,
  onLogout,
}: {
  account: AccountSession;
  children: ReactNode;
  isSigningOut: boolean;
  logoutError: string | null;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const [sessions, setSessions] = useState<OnboardingSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [guideSessionId, setGuideSessionId] = useState<string | null>(null);
  const [graph, setGraph] = useState<GuideGraph | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [knowledgeMapEnabled, setKnowledgeMapEnabled] = useState(false);
  const [referencedStepId, setReferencedStepId] = useState<string | null>(null);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [messagesBySessionId, setMessagesBySessionId] = useState<Record<string, ChatMessage[]>>({});
  const [isNavigationCollapsed, setIsNavigationCollapsed] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(true);
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const [isAssistantMinimized, setIsAssistantMinimized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [runningSessionIds, setRunningSessionIds] = useState<string[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<DeleteError>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const guideSessionIdRef = useRef<string | null>(null);
  const guideLoadRequestRef = useRef(0);
  const mobileNavigationToggleRef = useRef<HTMLButtonElement | null>(null);
  const navigationPreferenceTouchedRef = useRef(false);
  const pageHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const previousPathnameRef = useRef(pathname);

  const selectedStep = useMemo(
    () => graph?.steps.find((step) => step.id === selectedStepId) ?? null,
    [graph, selectedStepId],
  );
  const referenceCandidate = selectedStep?.id === graph?.rootId ? null : selectedStep;
  const activeMessages = activeSessionId ? (messagesBySessionId[activeSessionId] ?? []) : [];
  const referencedStep = useMemo(
    () => graph?.steps.find((step) => step.id === referencedStepId) ?? null,
    [graph, referencedStepId],
  );
  const isChatLoading = activeSessionId ? runningSessionIds.includes(activeSessionId) : false;
  const accountLabel = account.displayName ?? account.email ?? account.userId;
  const pageMeta = getWorkspacePageMeta(pathname, account.displayName);
  const effectiveNavigationCollapsed = isNavigationCollapsed && !isMobileNavigationOpen;
  const isMobileNavigationModalOpen = isMobileViewport && isMobileNavigationOpen;

  useEffect(() => {
    const tabletQuery = window.matchMedia('(min-width: 768px) and (max-width: 1023px)');

    function syncTabletNavigation() {
      if (!navigationPreferenceTouchedRef.current) {
        setIsNavigationCollapsed(tabletQuery.matches);
      }
    }

    syncTabletNavigation();
    tabletQuery.addEventListener('change', syncTabletNavigation);
    return () => tabletQuery.removeEventListener('change', syncTabletNavigation);
  }, []);

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 767px)');

    function syncMobileViewport() {
      setIsMobileViewport(mobileQuery.matches);
      if (!mobileQuery.matches) setIsMobileNavigationOpen(false);
    }

    syncMobileViewport();
    mobileQuery.addEventListener('change', syncMobileViewport);
    return () => mobileQuery.removeEventListener('change', syncMobileViewport);
  }, []);

  useEffect(() => {
    const previousPathname = previousPathnameRef.current;
    previousPathnameRef.current = pathname;
    if (previousPathname === pathname) return;

    const frame = window.requestAnimationFrame(() => {
      pageHeadingRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  useEffect(() => {
    guideSessionIdRef.current = guideSessionId;
  }, [guideSessionId]);

  useEffect(() => {
    if (!isMobileNavigationOpen) return;

    const navigation = document.getElementById('workspace-primary-navigation-content');
    const navigationToggle = mobileNavigationToggleRef.current;
    const previousOverflow = document.body.style.overflow;
    const focusable = navigation
      ? Array.from(
          navigation.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex="0"]',
          ),
        ).filter((element) => element.getClientRects().length > 0)
      : [];
    const frame = window.requestAnimationFrame(() => focusable[0]?.focus());

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsMobileNavigationOpen(false);
        return;
      }
      if (event.key !== 'Tab' || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      navigationToggle?.focus();
    };
  }, [isMobileNavigationOpen]);

  const loadGuide = useCallback(async (sessionId: string) => {
    const requestId = ++guideLoadRequestRef.current;
    setIsLoading(true);
    try {
      setApiError(null);
      const response = await getRootGuide({ sessionId, webSearchEnabled: false });
      if (requestId !== guideLoadRequestRef.current || guideSessionIdRef.current !== sessionId) {
        return;
      }
      setKnowledgeMapEnabled(response.knowledgeMapEnabled === true);
      setGraph(response.graph);
      setSources((current) => mergeSources(current, response.graph.sources));
      const focusId = response.focusStepId ?? response.graph.rootId;
      setSelectedStepId(response.graph.emptyReason === 'not_created' ? null : focusId);
    } catch (error) {
      if (requestId !== guideLoadRequestRef.current || guideSessionIdRef.current !== sessionId) {
        return;
      }
      setApiError(formatError(error, 'Could not load the onboarding roadmap.'));
    } finally {
      if (requestId === guideLoadRequestRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      try {
        setApiError(null);
        const response = await listSessions();
        let nextSessions = response.sessions;
        if (nextSessions.length === 0) {
          const created = await createSession({ title: 'Chat 1' });
          nextSessions = [created.session];
        }
        setSessions(nextSessions);
        setMessagesBySessionId(indexSessionMessages(nextSessions));
        const initialSessionId = nextSessions[0]?.id ?? null;
        setActiveSessionId(initialSessionId);
        setGuideSessionId(initialSessionId);
      } catch (error) {
        setApiError(formatError(error, 'Could not load chat sessions.'));
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!guideSessionId) return;
    setGraph(null);
    setSelectedStepId(null);
    setReferencedStepId(null);
    setSources([]);
    void loadGuide(guideSessionId);
  }, [guideSessionId, loadGuide]);

  async function handleCreateSession() {
    try {
      setApiError(null);
      const created = await createSession({ title: `Chat ${sessions.length + 1}` });
      setSessions((current) => [created.session, ...current]);
      setMessagesBySessionId((current) => ({ ...current, [created.session.id]: [] }));
      setActiveSessionId(created.session.id);
    } catch (error) {
      setApiError(formatError(error, 'Could not create a new chat session.'));
    }
  }

  async function handleDeleteSession(sessionId: string) {
    if (sessions.length <= 1 || deletingSessionId !== null) return;
    try {
      setDeletingSessionId(sessionId);
      setDeleteError(null);
      await deleteSession(sessionId);
      const remaining = sessions.filter((session) => session.id !== sessionId);
      setSessions(remaining);
      setMessagesBySessionId((current) => removeSessionMessages(current, sessionId));
      setRunningSessionIds((current) => current.filter((id) => id !== sessionId));
      if (activeSessionId === sessionId) setActiveSessionId(remaining[0]?.id ?? null);
      if (guideSessionId === sessionId) setGuideSessionId(remaining[0]?.id ?? null);
    } catch (error) {
      setDeleteError({
        message: formatError(error, 'Could not delete the chat session.'),
        sessionId,
      });
    } finally {
      setDeletingSessionId(null);
    }
  }

  async function handleSendMessage(message: string) {
    const sessionId = activeSessionId;
    if (!sessionId || message.trim().length === 0) return;

    const reference = referencedStepId && referencedStep ? referencedStep : null;
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message.trim(),
      createdAt: new Date().toISOString(),
      ...(reference
        ? {
            guideNodeIds: [reference.id],
            roadmapReferences: [
              { nodeId: reference.id, title: reference.title, summary: reference.summary },
            ],
          }
        : {}),
    };

    setMessagesBySessionId((current) => appendSessionMessage(current, sessionId, userMessage));
    setRunningSessionIds((current) => [...new Set([...current, sessionId])]);
    setReferencedStepId(null);

    try {
      setApiError(null);
      const response = await sendChat({
        sessionId,
        message: userMessage.content,
        webSearchEnabled: false,
        referencedNodeId: reference?.id,
      });
      if (response.session) {
        setSessions((current) =>
          current.map((session) => (session.id === sessionId ? response.session! : session)),
        );
        setMessagesBySessionId((current) =>
          replaceSessionMessages(
            current,
            sessionId,
            response.session?.chatHistory ?? current[sessionId] ?? [],
          ),
        );
      } else {
        setMessagesBySessionId((current) =>
          appendSessionMessage(current, sessionId, response.message),
        );
      }
      setSources((current) =>
        mergeSourcesForActiveSession(
          current,
          response.sources,
          activeSessionIdRef.current,
          sessionId,
        ),
      );
      if (
        activeSessionIdRef.current === sessionId &&
        response.focusStepIds &&
        response.focusStepIds.length > 0
      ) {
        setSelectedStepId(response.focusStepIds[0] ?? selectedStepId);
      }
    } catch (error) {
      setMessagesBySessionId((current) =>
        appendSessionMessage(current, sessionId, {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: formatError(error, "I couldn't complete that request. Please try again."),
          createdAt: new Date().toISOString(),
        }),
      );
    } finally {
      setRunningSessionIds((current) => current.filter((id) => id !== sessionId));
    }
  }

  function handleReferenceStep(stepId: string) {
    if (!graph?.steps.some((step) => step.id === stepId)) return;
    setSelectedStepId(stepId);
    setReferencedStepId(stepId);
    setIsAssistantMinimized(false);
  }

  function handleSelectSession(sessionId: string) {
    setActiveSessionId(sessionId);
    setReferencedStepId(null);
  }

  function handleRetry() {
    if (guideSessionId) void loadGuide(guideSessionId);
    else window.location.reload();
  }

  return (
    <div
      className="app-shell"
      data-assistant-minimized={isAssistantMinimized ? 'true' : 'false'}
      data-mobile-navigation-open={isMobileNavigationOpen ? 'true' : 'false'}
      data-navigation-collapsed={isNavigationCollapsed ? 'true' : 'false'}
    >
      <WorkspaceAssistantRuntimeProvider
        activeSessionId={activeSessionId}
        isLoading={isLoading}
        isRunning={isChatLoading}
        messages={activeMessages}
        onCreatePlan={handleCreateSession}
        onDeletePlan={handleDeleteSession}
        onSelectPlan={(sessionId) => {
          handleSelectSession(sessionId);
          return Promise.resolve();
        }}
        onSendMessage={handleSendMessage}
        sessions={sessions}
      >
        <div className="workspace-navigation-layer">
          <WorkspaceNavigation
            className="workspace-primary-navigation"
            collapsed={effectiveNavigationCollapsed}
            inactive={isMobileViewport && !isMobileNavigationOpen}
            navigationId="workspace-primary-navigation-content"
            onCollapsedChange={(collapsed) => {
              navigationPreferenceTouchedRef.current = true;
              setIsNavigationCollapsed(collapsed);
            }}
            onDismiss={isMobileViewport ? () => setIsMobileNavigationOpen(false) : undefined}
            onNavigate={() => setIsMobileNavigationOpen(false)}
            onSignOut={onLogout}
            pathname={pathname}
            signOutDisabled={isSigningOut}
          />
          {isMobileNavigationOpen ? (
            <button
              aria-hidden="true"
              aria-label="Close navigation"
              className="workspace-navigation-backdrop"
              onClick={() => setIsMobileNavigationOpen(false)}
              tabIndex={-1}
              type="button"
            />
          ) : null}
        </div>

        <div
          aria-hidden={isMobileNavigationModalOpen || undefined}
          className="workspace-dashboard-surface"
          inert={isMobileNavigationModalOpen || undefined}
        >
          <header className="workspace-dashboard-header">
            <button
              aria-controls="workspace-primary-navigation-content"
              aria-expanded={isMobileNavigationOpen}
              aria-label={isMobileNavigationOpen ? 'Close navigation' : 'Open navigation'}
              className="mobile-navigation-toggle"
              onClick={() => setIsMobileNavigationOpen((current) => !current)}
              ref={mobileNavigationToggleRef}
              type="button"
            >
              <MenuIcon open={isMobileNavigationOpen} />
            </button>
            <div className="workspace-heading-copy">
              <h1 ref={pageHeadingRef} tabIndex={-1}>
                {pageMeta.title}
                {pageMeta.showWave ? (
                  <span aria-hidden="true" className="welcome-wave">
                    {'\u{1F44B}'}
                  </span>
                ) : null}
              </h1>
              <p>{pageMeta.subtitle}</p>
            </div>
            <div className="workspace-header-actions">
              <span
                aria-label={`${accountLabel}, ${formatAccountRole(account.role)}`}
                className="workspace-avatar"
                role="img"
                title={`${accountLabel} - ${formatAccountRole(account.role)}`}
              >
                {getAccountInitials(accountLabel)}
              </span>
            </div>
          </header>

          {isSigningOut ? (
            <div className="workspace-alert" role="status">
              <span>Signing you out…</span>
            </div>
          ) : logoutError || apiError ? (
            <div className="workspace-alert" role="alert">
              <span>{logoutError ?? apiError}</span>
              <button onClick={logoutError ? onLogout : handleRetry} type="button">
                Try again
              </button>
            </div>
          ) : null}

          <WorkspaceRouteProvider
            value={{
              apiError,
              graph,
              isGuideEmpty: graph?.emptyReason === 'not_created',
              isLoading,
              knowledgeMapEnabled,
              onReferenceStep: handleReferenceStep,
              onRetry: handleRetry,
              sources,
            }}
          >
            <div className="workspace-dashboard-grid">
              <main
                aria-busy={isLoading}
                className="workspace-route-content"
                id="workspace-content"
              >
                {children}
              </main>
              <aside
                aria-label="Onboarding assistant"
                className="assistant-panel"
                data-minimized={isAssistantMinimized ? 'true' : 'false'}
              >
                {isAssistantMinimized ? (
                  <button
                    aria-controls="onboarding-assistant-content"
                    aria-expanded="false"
                    aria-label={getAssistantDrawerToggleLabel(true)}
                    className="assistant-restore-button"
                    onClick={() => setIsAssistantMinimized(false)}
                    type="button"
                  >
                    <SparklesIcon />
                  </button>
                ) : null}
                <div
                  className="assistant-panel-content"
                  hidden={isAssistantMinimized}
                  id="onboarding-assistant-content"
                >
                  {!isAssistantMinimized ? (
                    <>
                      <WorkspaceSessionTabs
                        activeSessionId={activeSessionId}
                        deleteError={deleteError}
                        deletingSessionId={deletingSessionId}
                        onCreate={handleCreateSession}
                        onDelete={handleDeleteSession}
                        onSelect={handleSelectSession}
                        sessions={sessions}
                      />
                      <div
                        aria-labelledby={
                          activeSessionId ? `workspace-session-tab-${activeSessionId}` : undefined
                        }
                        className="assistant-session-content"
                        id="assistant-session-content"
                        role="tabpanel"
                      >
                        <AgentChatDrawer
                          canSend={Boolean(activeSessionId)}
                          isRunning={isChatLoading}
                          messages={activeMessages}
                          onAddReference={() => {
                            if (referenceCandidate) setReferencedStepId(referenceCandidate.id);
                          }}
                          onMinimize={() => setIsAssistantMinimized(true)}
                          onRemoveReference={() => setReferencedStepId(null)}
                          onSendSuggestion={handleSendMessage}
                          referenceCandidate={referenceCandidate}
                          referencedStep={referencedStep}
                          userLabel={accountLabel}
                        />
                      </div>
                    </>
                  ) : null}
                </div>
              </aside>
            </div>
          </WorkspaceRouteProvider>
        </div>
      </WorkspaceAssistantRuntimeProvider>
    </div>
  );
}

function WorkspaceSessionTabs({
  activeSessionId,
  deleteError,
  deletingSessionId,
  onCreate,
  onDelete,
  onSelect,
  sessions,
}: {
  activeSessionId: string | null;
  deleteError: DeleteError;
  deletingSessionId: string | null;
  onCreate: () => Promise<void>;
  onDelete: (sessionId: string) => Promise<void>;
  onSelect: (sessionId: string) => void;
  sessions: OnboardingSession[];
}) {
  const [sessionPendingDelete, setSessionPendingDelete] = useState<OnboardingSession | null>(null);

  useEffect(() => {
    if (
      sessionPendingDelete &&
      !sessions.some((session) => session.id === sessionPendingDelete.id)
    ) {
      setSessionPendingDelete(null);
    }
  }, [sessionPendingDelete, sessions]);

  const isDeleting = deletingSessionId === sessionPendingDelete?.id;
  const deleteDialogError =
    deleteError && sessionPendingDelete && deleteError.sessionId === sessionPendingDelete.id
      ? deleteError.message
      : null;

  function handleTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % sessions.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + sessions.length) % sessions.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = sessions.length - 1;
    if (nextIndex === null) return;

    const nextSession = sessions[nextIndex];
    if (!nextSession) return;
    event.preventDefault();
    onSelect(nextSession.id);
    document.getElementById(`workspace-session-tab-${nextSession.id}`)?.focus();
  }

  return (
    <>
      <div aria-label="Onboarding sessions" className="workspace-session-tabs" role="tablist">
        <div className="workspace-session-tabs__scroller">
          {sessions.map((session, index) => {
            const isActive = session.id === activeSessionId;
            return (
              <div
                className="workspace-session-tab"
                data-active={isActive ? 'true' : undefined}
                key={session.id}
                role="presentation"
              >
                <button
                  aria-controls="assistant-session-content"
                  aria-selected={isActive}
                  className="workspace-session-tab__select"
                  id={`workspace-session-tab-${session.id}`}
                  onClick={() => onSelect(session.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  role="tab"
                  tabIndex={isActive ? 0 : -1}
                  title={session.title}
                  type="button"
                >
                  {session.title}
                </button>
                {sessions.length > 1 ? (
                  <button
                    aria-label={`Delete ${session.title}`}
                    className="workspace-session-tab__delete"
                    disabled={deletingSessionId !== null}
                    onClick={() => setSessionPendingDelete(session)}
                    title={`Delete ${session.title}`}
                    type="button"
                  >
                    <CloseIcon />
                  </button>
                ) : null}
              </div>
            );
          })}
          <button
            aria-label="New session"
            className="workspace-session-tab workspace-session-tab--new"
            disabled={deletingSessionId !== null}
            onClick={() => void onCreate()}
            title="New session"
            type="button"
          >
            <PlusIcon />
          </button>
        </div>
      </div>
      <ConfirmDialog
        confirmLabel={`Delete ${sessionPendingDelete?.title ?? 'session'}`}
        description="This AI chat session and its conversation history will be permanently removed."
        error={deleteDialogError}
        onCancel={() => setSessionPendingDelete(null)}
        onConfirm={() => {
          if (sessionPendingDelete) void onDelete(sessionPendingDelete.id);
        }}
        open={sessionPendingDelete !== null}
        pending={isDeleting}
        pendingLabel="Deleting session…"
        title={`Delete “${sessionPendingDelete?.title ?? 'this session'}”?`}
        tone="danger"
      />
    </>
  );
}

function getWorkspacePageMeta(pathname: string, displayName: string | undefined) {
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

function getAccountInitials(label: string) {
  const parts = label.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return (parts[0]?.[0] ?? 'U').toUpperCase();
  return `${parts[0]?.[0] ?? ''}${parts.at(-1)?.[0] ?? ''}`.toUpperCase();
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d={open ? 'm6 6 12 12M18 6 6 18' : 'M4.5 7h15M4.5 12h15M4.5 17h15'}
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path
        d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3L12 3ZM18.5 13l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2ZM6 13l.9 2.6 2.6.9-2.6.9L6 20l-.9-2.6-2.6-.9 2.6-.9L6 13Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
      <path d="M10 4v12M4 10h12" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 16 16">
      <path
        d="m4.5 4.5 7 7m0-7-7 7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}
