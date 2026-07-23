import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ChatMessage,
  GuideGraph,
  GuideStep,
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
import {
  getAssistantDrawerToggleLabel,
  getVisibleGraph,
} from '@/features/workspace/workspaceModel';
import {
  appendSessionMessage,
  indexSessionMessages,
  removeSessionMessages,
  replaceSessionMessages,
} from '@/features/workspace/workspaceThreadModel';
import { GuideCanvas } from './guide/GuideCanvas';
import { AgentChatDrawer } from './assistant/AgentChatDrawer';
import { PlanThreadList } from './assistant/PlanThreadList';
import { WorkspaceAssistantRuntimeProvider } from './assistant/WorkspaceAssistantRuntimeProvider';

function mergeSources(existing: KnowledgeSource[], incoming: KnowledgeSource[]) {
  const byId = new Map(existing.map((source) => [source.id, source]));
  for (const source of incoming) {
    byId.set(source.id, source);
  }
  return [...byId.values()];
}

function getBreadcrumbs(graph: GuideGraph | null, selectedStepId: string | null) {
  if (!graph || !selectedStepId) {
    return [];
  }

  const stepsById = new Map(graph.steps.map((step) => [step.id, step]));
  const breadcrumbs: GuideStep[] = [];
  let current = stepsById.get(selectedStepId);

  while (current) {
    breadcrumbs.unshift(current);
    current = current.parentId ? stepsById.get(current.parentId) : undefined;
  }

  return breadcrumbs;
}

function formatError(error: unknown, fallback: string): string {
  return error instanceof Error ? `${fallback} ${error.message}` : fallback;
}

function formatAccountRole(role: string | undefined) {
  if (role === 'admin') {
    return 'Administrator';
  }

  return 'Member';
}

export function WorkspaceShell({
  account,
  onLogout,
}: {
  account: AccountSession;
  onLogout: () => void;
}) {
  const [sessions, setSessions] = useState<OnboardingSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [graph, setGraph] = useState<GuideGraph | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [focusStepIds, setFocusStepIds] = useState<string[]>([]);
  const [knowledgeMapEnabled, setKnowledgeMapEnabled] = useState(false);
  const [referencedStepId, setReferencedStepId] = useState<string | null>(null);
  const [, setSources] = useState<KnowledgeSource[]>([]);
  const [messagesBySessionId, setMessagesBySessionId] = useState<Record<string, ChatMessage[]>>({});
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [runningSessionIds, setRunningSessionIds] = useState<string[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{
    message: string;
    sessionId: string;
  } | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const guideLoadRequestRef = useRef(0);

  const breadcrumbs = useMemo(() => getBreadcrumbs(graph, selectedStepId), [graph, selectedStepId]);
  const visibleGraph = useMemo(
    () => getVisibleGraph(graph, selectedStepId),
    [graph, selectedStepId],
  );
  const isGuideEmpty = graph?.emptyReason === 'not_created';
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

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  const loadGuide = useCallback(async (sessionId: string) => {
    const requestId = ++guideLoadRequestRef.current;
    setIsLoading(true);
    try {
      setApiError(null);
      const response = await getRootGuide({ sessionId, webSearchEnabled: false });
      if (requestId !== guideLoadRequestRef.current || activeSessionIdRef.current !== sessionId) {
        return;
      }
      setKnowledgeMapEnabled(response.knowledgeMapEnabled === true);
      setGraph(response.graph);
      setSources((current) => mergeSources(current, response.graph.sources));
      const focusId = response.focusStepId ?? response.graph.rootId;
      if (response.graph.emptyReason === 'not_created') {
        setSelectedStepId(null);
        setFocusStepIds([]);
        return;
      }
      setSelectedStepId(focusId);
      setFocusStepIds([focusId]);
    } catch (error) {
      if (requestId !== guideLoadRequestRef.current || activeSessionIdRef.current !== sessionId) {
        return;
      }
      setApiError(formatError(error, 'Could not load the guide from the onboarding service.'));
    } finally {
      if (requestId === guideLoadRequestRef.current) {
        setIsLoading(false);
      }
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
          const created = await createSession({ title: 'First-week plan' });
          nextSessions = [created.session];
        }

        setSessions(nextSessions);
        setMessagesBySessionId(indexSessionMessages(nextSessions));
        const firstSession = nextSessions[0];
        if (firstSession) {
          setActiveSessionId(firstSession.id);
        }
      } catch (error) {
        setApiError(formatError(error, 'Could not load onboarding sessions.'));
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (activeSessionId) {
      setGraph(null);
      setSelectedStepId(null);
      setFocusStepIds([]);
      setReferencedStepId(null);
      setSources([]);
      void loadGuide(activeSessionId);
    }
  }, [activeSessionId, loadGuide]);

  async function handleCreateSession() {
    try {
      setApiError(null);
      const created = await createSession({ title: `Onboarding plan ${sessions.length + 1}` });
      setSessions((current) => [created.session, ...current]);
      setActiveSessionId(created.session.id);
      setMessagesBySessionId((current) => ({ ...current, [created.session.id]: [] }));
      setSources([]);
    } catch (error) {
      setApiError(formatError(error, 'Could not create a new session.'));
    }
  }

  async function handleDeleteSession(sessionId: string) {
    if (sessions.length <= 1 || deletingSessionId !== null) {
      return;
    }

    try {
      setDeletingSessionId(sessionId);
      setDeleteError(null);
      await deleteSession(sessionId);
      const remaining = sessions.filter((session) => session.id !== sessionId);
      setSessions(remaining);
      setMessagesBySessionId((current) => removeSessionMessages(current, sessionId));
      setRunningSessionIds((current) => current.filter((id) => id !== sessionId));

      if (activeSessionId === sessionId) {
        const next = remaining[0] ?? null;
        setActiveSessionId(next?.id ?? null);
        setGraph(null);
        setSelectedStepId(null);
      }
    } catch (error) {
      setDeleteError({
        message: formatError(error, 'Could not delete the session.'),
        sessionId,
      });
    } finally {
      setDeletingSessionId(null);
    }
  }

  function handleSelectStep(stepId: string) {
    setSelectedStepId(stepId);
    setFocusStepIds([]);
  }

  function handleLocateStep(stepId: string) {
    setSelectedStepId(stepId);
    setFocusStepIds([stepId]);
  }

  async function handleSendMessage(message: string) {
    const sessionId = activeSessionId;
    if (!sessionId || message.trim().length === 0) {
      return;
    }

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
      setSources((current) => mergeSources(current, response.sources));
      if (
        activeSessionIdRef.current === sessionId &&
        response.focusStepIds &&
        response.focusStepIds.length > 0
      ) {
        setFocusStepIds(response.focusStepIds);
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

  return (
    <main
      className={[
        'app-shell',
        isLeftPanelCollapsed ? 'left-collapsed' : '',
        isRightPanelCollapsed ? 'right-collapsed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <WorkspaceAssistantRuntimeProvider
        activeSessionId={activeSessionId}
        isLoading={isLoading}
        isRunning={isChatLoading}
        messages={activeMessages}
        onCreatePlan={handleCreateSession}
        onDeletePlan={handleDeleteSession}
        onSelectPlan={async (sessionId) => setActiveSessionId(sessionId)}
        onSendMessage={handleSendMessage}
        sessions={sessions}
      >
        <aside className="session-rail" aria-label="Onboarding plans">
          <button
            aria-label={isLeftPanelCollapsed ? 'Expand plans sidebar' : 'Collapse plans sidebar'}
            className="panel-toggle"
            onClick={() => setIsLeftPanelCollapsed((current) => !current)}
            type="button"
          >
            {isLeftPanelCollapsed ? <>&rsaquo;</> : <>&lsaquo;</>}
          </button>
          <div className="panel-content">
            <div className="panel-branding">
              <p>Onboarding Accelerator</p>
              <h1>Your plans</h1>
            </div>
            <PlanThreadList
              canDelete={sessions.length > 1}
              deleteError={deleteError}
              deletingSessionId={deletingSessionId}
              onDelete={handleDeleteSession}
            />
            <div className="account-summary">
              <span>{accountLabel}</span>
              <small>{formatAccountRole(account.role)}</small>
            </div>
            <button className="ghost-button" onClick={onLogout} type="button">
              Sign out
            </button>
          </div>
        </aside>

        <section className="workspace" aria-busy={isLoading}>
          <header className="topbar">
            <div className="breadcrumbs" aria-label="Selected step breadcrumbs">
              {isGuideEmpty ? (
                <span>No map yet</span>
              ) : breadcrumbs.length === 0 ? (
                <span>Loading guide</span>
              ) : (
                breadcrumbs.map((crumb, index) => (
                  <button key={crumb.id} onClick={() => handleLocateStep(crumb.id)} type="button">
                    {index > 0 ? <span aria-hidden="true">/</span> : null}
                    {crumb.title}
                  </button>
                ))
              )}
            </div>
          </header>

          {apiError ? (
            <div className="app-error" role="alert">
              {apiError}
            </div>
          ) : null}
          {isLoading ? <div className="loading-state">Loading onboarding workspace...</div> : null}
          {isGuideEmpty && !isLoading ? (
            <div className="empty-map-state">
              <h2>Roadmap unavailable</h2>
              <p>
                {knowledgeMapEnabled
                  ? 'No published roadmap is available for your access scope. Ask an administrator to generate and publish one from reviewed RAG sources.'
                  : 'The database-backed roadmap is not enabled for this environment.'}
              </p>
            </div>
          ) : null}
          <GuideCanvas
            focusStepIds={focusStepIds}
            graph={visibleGraph}
            onSelectStep={handleSelectStep}
            sessionId={activeSessionId}
            selectedStepId={selectedStepId}
          />
        </section>

        <aside className="assistant-panel" aria-label="Onboarding assistant">
          <button
            aria-expanded={!isRightPanelCollapsed}
            aria-label={getAssistantDrawerToggleLabel(isRightPanelCollapsed)}
            className="panel-toggle"
            onClick={() => setIsRightPanelCollapsed((current) => !current)}
            type="button"
          >
            {isRightPanelCollapsed ? <>&lsaquo;</> : <>&rsaquo;</>}
          </button>
          <AgentChatDrawer
            isRunning={isChatLoading}
            messages={activeMessages}
            onAddReference={() => {
              if (referenceCandidate) setReferencedStepId(referenceCandidate.id);
            }}
            onRemoveReference={() => setReferencedStepId(null)}
            referenceCandidate={referenceCandidate}
            referencedStep={referencedStep}
            userLabel={accountLabel}
          />
        </aside>
      </WorkspaceAssistantRuntimeProvider>
    </main>
  );
}
