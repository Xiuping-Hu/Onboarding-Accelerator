import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import type {
  ChatMessage,
  GuideEdge,
  GuideGraph,
  GuideStep,
  KnowledgeSource,
  LogEventRecord,
  LogSummaryResponse,
  OnboardingSession,
} from '@onboarding/shared';
import {
  createSession,
  deleteSession,
  expandStep,
  getRecentLogs,
  getRootGuide,
  getLogSummary,
  listSessions,
  sendChat,
} from './api.js';

type NodePoint = GuideStep & { x: number; y: number };
type HitTarget = { id: string; x: number; y: number; width: number; height: number };

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled Teams onboarding UI error', error.message, info.componentStack);
  }

  override render() {
    if (this.state.error) {
      return (
        <main className="fatal-error" role="alert">
          <h1>Something went wrong</h1>
          <p>The onboarding workspace could not recover. Refresh Teams and try again.</p>
        </main>
      );
    }

    return this.props.children;
  }
}

const statusLabel: Record<GuideStep['status'], string> = {
  locked: 'Locked',
  ready: 'Ready',
  'in-progress': 'In progress',
  complete: 'Complete',
};

const statusColor: Record<GuideStep['status'], string> = {
  locked: '#7a7a7a',
  ready: '#0f6cbd',
  'in-progress': '#6264a7',
  complete: '#107c10',
};

const emptyMessages: ChatMessage[] = [
  {
    id: 'assistant-welcome',
    role: 'assistant',
    content:
      'Tell me what you need to do next, or ask me to search for setup visuals. I can focus the map as I answer.',
    createdAt: new Date().toISOString(),
  },
];

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatTokens(value: number) {
  return new Intl.NumberFormat(undefined).format(value);
}

function formatUsd(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: value > 0 && value < 0.01 ? 6 : 2,
    maximumFractionDigits: 6,
  }).format(value);
}

function getLogTypeLabel(event: LogEventRecord) {
  if (event.type === 'ai_usage') {
    return 'AI usage';
  }

  if (event.type === 'request') {
    return 'Request';
  }

  return 'Error';
}

function getLogDetail(event: LogEventRecord) {
  if (event.type === 'ai_usage' && event.usage) {
    return `${event.operation ?? 'ai'} | ${event.usage.model} | ${formatTokens(
      event.usage.totalTokens,
    )} tokens | ${formatUsd(event.usage.estimatedFeeUsd)}`;
  }

  if (event.type === 'request') {
    const status = event.statusCode ? String(event.statusCode) : 'pending';
    const duration =
      typeof event.durationMs === 'number' ? `${event.durationMs}ms` : 'duration n/a';
    return `${event.method ?? 'HTTP'} ${event.path ?? 'unknown path'} | ${status} | ${duration}`;
  }

  return event.message ?? `${event.method ?? 'Error'} ${event.path ?? ''}`.trim();
}

function mergeSources(existing: KnowledgeSource[], incoming: KnowledgeSource[]) {
  const byId = new Map(existing.map((source) => [source.id, source]));
  for (const source of incoming) {
    byId.set(source.id, source);
  }
  return [...byId.values()];
}

export function getVisibleGraph(
  graph: GuideGraph | null,
  selectedStepId: string | null,
): GuideGraph | null {
  if (!graph || !selectedStepId) {
    return graph;
  }

  const stepsById = new Map(graph.steps.map((step) => [step.id, step]));
  const visibleIds = new Set<string>();
  let current = stepsById.get(selectedStepId);

  while (current) {
    visibleIds.add(current.id);
    current = current.parentId ? stepsById.get(current.parentId) : undefined;
  }

  const visitDescendants = (stepId: string) => {
    const step = stepsById.get(stepId);
    if (!step) {
      return;
    }

    for (const childId of step.childIds) {
      visibleIds.add(childId);
      visitDescendants(childId);
    }
  };

  visitDescendants(selectedStepId);

  if (selectedStepId === graph.rootId) {
    visibleIds.add(graph.rootId);
  }

  return {
    ...graph,
    steps: graph.steps.filter((step) => visibleIds.has(step.id)),
    edges: graph.edges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to)),
  };
}

export function getNodeLayout(graph: GuideGraph | null): NodePoint[] {
  if (!graph) {
    return [];
  }

  const byDepth = new Map<number, GuideStep[]>();
  for (const step of graph.steps) {
    byDepth.set(step.depth, [...(byDepth.get(step.depth) ?? []), step]);
  }

  const nodes: NodePoint[] = [];
  for (const [depth, steps] of [...byDepth.entries()].sort(([a], [b]) => a - b)) {
    const laneHeight = Math.max(132, 520 / Math.max(steps.length, 1));
    steps.forEach((step, index) => {
      nodes.push({
        ...step,
        x: 150 + depth * 300,
        y: 120 + index * laneHeight + (depth % 2) * 34,
      });
    });
  }

  return nodes;
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

function GuideCanvas({
  graph,
  selectedStepId,
  focusStepIds,
  onSelectStep,
}: {
  graph: GuideGraph | null;
  selectedStepId: string | null;
  focusStepIds: string[];
  onSelectStep: (stepId: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const hitsRef = useRef<HitTarget[]>([]);
  const viewRef = useRef({ offsetX: 120, offsetY: 160, scale: 1, pulse: 0 });
  const targetViewRef = useRef({ offsetX: 120, offsetY: 160, scale: 1 });
  const nodes = useMemo(() => getNodeLayout(graph), [graph]);
  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) {
      return;
    }

    const resize = () => {
      const rect = wrapper.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const activeId = focusStepIds[0] ?? selectedStepId ?? graph?.rootId;
    const activeNode = activeId ? nodesById.get(activeId) : undefined;
    const rect = canvas.getBoundingClientRect();

    if (activeNode && rect.width > 0 && rect.height > 0) {
      targetViewRef.current = {
        scale: activeNode.depth > 1 ? 0.88 : 1,
        offsetX: rect.width / 2 - activeNode.x,
        offsetY: rect.height / 2 - activeNode.y,
      };
    }
  }, [focusStepIds, graph?.rootId, nodesById, selectedStepId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    let frame = 0;
    const draw = () => {
      frame = window.requestAnimationFrame(draw);
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const width = rect.width;
      const height = rect.height;

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const view = viewRef.current;
      const target = targetViewRef.current;
      view.offsetX += (target.offsetX - view.offsetX) * 0.08;
      view.offsetY += (target.offsetY - view.offsetY) * 0.08;
      view.scale += (target.scale - view.scale) * 0.08;
      view.pulse += 0.035;

      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#f8fbff');
      gradient.addColorStop(0.58, '#ffffff');
      gradient.addColorStop(1, '#f5f7fb');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      context.save();
      context.translate(view.offsetX, view.offsetY);
      context.scale(view.scale, view.scale);

      context.strokeStyle = 'rgba(98, 100, 167, 0.08)';
      context.lineWidth = 1;
      for (let x = -400; x < 2200; x += 40) {
        context.beginPath();
        context.moveTo(x, -400);
        context.lineTo(x, 1400);
        context.stroke();
      }
      for (let y = -400; y < 1400; y += 40) {
        context.beginPath();
        context.moveTo(-400, y);
        context.lineTo(2200, y);
        context.stroke();
      }

      const hitTargets: HitTarget[] = [];
      const edgeLookup = graph?.edges ?? [];
      for (const edge of edgeLookup) {
        drawEdge(context, edge, nodesById, view.pulse, focusStepIds.includes(edge.to));
      }

      for (const node of nodes) {
        const selected = node.id === selectedStepId;
        const focused = focusStepIds.includes(node.id);
        drawNode(context, node, selected, focused);
        hitTargets.push({
          id: node.id,
          x: node.x - 92,
          y: node.y - 38,
          width: 184,
          height: 76,
        });
      }

      hitsRef.current = hitTargets;
      context.restore();
    };

    draw();
    return () => window.cancelAnimationFrame(frame);
  }, [focusStepIds, graph?.edges, nodes, nodesById, selectedStepId]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const view = viewRef.current;
    const x = (event.clientX - rect.left - view.offsetX) / view.scale;
    const y = (event.clientY - rect.top - view.offsetY) / view.scale;
    const hit = hitsRef.current.find(
      (target) =>
        x >= target.x &&
        x <= target.x + target.width &&
        y >= target.y &&
        y <= target.y + target.height,
    );

    if (hit) {
      onSelectStep(hit.id);
    }
  };

  return (
    <div className="canvas-shell" ref={wrapperRef}>
      <canvas
        ref={canvasRef}
        aria-label="Interactive onboarding guidance map"
        className="guide-canvas"
        onPointerDown={handlePointerDown}
        role="img"
      />
      <div className="canvas-hint" aria-hidden="true">
        Click nodes to inspect or expand. Chat can focus the map.
      </div>
    </div>
  );
}

function drawEdge(
  context: CanvasRenderingContext2D,
  edge: GuideEdge,
  nodesById: Map<string, NodePoint>,
  pulse: number,
  highlighted: boolean,
) {
  const from = nodesById.get(edge.from);
  const to = nodesById.get(edge.to);
  if (!from || !to) {
    return;
  }

  const startX = from.x + 92;
  const startY = from.y;
  const endX = to.x - 92;
  const endY = to.y;
  const controlX = startX + (endX - startX) * 0.5;
  const alpha = highlighted ? 0.92 : 0.42;

  context.save();
  context.lineWidth = highlighted ? 4 : 2;
  context.strokeStyle = `rgba(98, 100, 167, ${alpha})`;
  context.setLineDash(highlighted ? [10, 8] : []);
  context.lineDashOffset = -pulse * 24;
  context.beginPath();
  context.moveTo(startX, startY);
  context.bezierCurveTo(controlX, startY, controlX, endY, endX, endY);
  context.stroke();

  context.fillStyle = highlighted ? '#6264a7' : '#8a8cc7';
  context.beginPath();
  context.moveTo(endX, endY);
  context.lineTo(endX - 12, endY - 6);
  context.lineTo(endX - 12, endY + 6);
  context.closePath();
  context.fill();

  if (edge.label) {
    context.font = '12px Segoe UI, sans-serif';
    context.fillStyle = '#4f52a3';
    context.fillText(edge.label, controlX - 14, (startY + endY) / 2 - 8);
  }
  context.restore();
}

function drawNode(
  context: CanvasRenderingContext2D,
  node: NodePoint,
  selected: boolean,
  focused: boolean,
) {
  const width = 184;
  const height = 76;
  const x = node.x - width / 2;
  const y = node.y - height / 2;
  const radius = 8;
  const accentColor = statusColor[node.status] ?? '#6264a7';

  context.save();
  context.fillStyle = selected || focused ? '#f7f8ff' : '#ffffff';
  roundRect(context, x, y, width, height, radius);
  context.fill();

  context.lineWidth = focused ? 3 : selected ? 2 : 1;
  context.strokeStyle = focused ? '#0f6cbd' : selected ? '#6264a7' : '#b8bfd6';
  roundRect(context, x, y, width, height, radius);
  context.stroke();

  context.fillStyle = accentColor;
  roundRect(context, x + 12, y + 12, 10, 38, 4);
  context.fill();

  context.fillStyle = '#1f1f1f';
  context.font = '650 15px Segoe UI, sans-serif';
  context.fillText(trimText(context, node.title, 138), x + 32, y + 26);
  context.fillStyle = '#424242';
  context.font = '12px Segoe UI, sans-serif';
  context.fillText(trimText(context, node.summary, 132), x + 32, y + 47);
  context.fillStyle = '#303030';
  context.font = '600 11px Segoe UI, sans-serif';
  context.fillText(`${statusLabel[node.status]} | ${node.childIds.length} sub`, x + 32, y + 64);
  context.restore();
}

function roundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
}

function trimText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (context.measureText(text).width <= maxWidth) {
    return text;
  }

  let next = text;
  while (next.length > 6 && context.measureText(`${next}...`).width > maxWidth) {
    next = next.slice(0, -1);
  }
  return `${next}...`;
}

function AppContent() {
  const [sessions, setSessions] = useState<OnboardingSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [graph, setGraph] = useState<GuideGraph | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [focusStepIds, setFocusStepIds] = useState<string[]>([]);
  const [, setSources] = useState<KnowledgeSource[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>(emptyMessages);
  const [logSummary, setLogSummary] = useState<LogSummaryResponse | null>(null);
  const [logEvents, setLogEvents] = useState<LogEventRecord[]>([]);
  const [expandedEvidenceIds, setExpandedEvidenceIds] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const breadcrumbs = useMemo(() => getBreadcrumbs(graph, selectedStepId), [graph, selectedStepId]);
  const visibleGraph = useMemo(
    () => getVisibleGraph(graph, selectedStepId),
    [graph, selectedStepId],
  );

  const refreshLogSummary = useCallback(async () => {
    try {
      const [summary, recentLogs] = await Promise.all([getLogSummary(), getRecentLogs(8)]);
      setLogSummary(summary);
      setLogEvents(recentLogs.events);
    } catch {
      setLogSummary(null);
      setLogEvents([]);
    }
  }, []);

  const loadGuide = useCallback(
    async (sessionId: string) => {
      setIsLoading(true);
      try {
        setApiError(null);
        const response = await getRootGuide({ sessionId, webSearchEnabled });
        setGraph(response.graph);
        setSources((current) => mergeSources(current, response.graph.sources));
        const focusId = response.focusStepId ?? response.graph.rootId;
        setSelectedStepId(focusId);
        setFocusStepIds([focusId]);
      } catch (error) {
        setApiError(formatError(error, 'Could not load the guide from the onboarding service.'));
      } finally {
        setIsLoading(false);
      }
    },
    [webSearchEnabled],
  );

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      try {
        setApiError(null);
        const response = await listSessions();
        let nextSessions = response.sessions;

        if (nextSessions.length === 0) {
          const created = await createSession({ title: 'First week path' });
          nextSessions = [created.session];
        }

        setSessions(nextSessions);
        const firstSession = nextSessions[0];
        if (firstSession) {
          setActiveSessionId(firstSession.id);
          await loadGuide(firstSession.id);
        }
      } catch (error) {
        setApiError(formatError(error, 'Could not load onboarding sessions.'));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [loadGuide]);

  useEffect(() => {
    void refreshLogSummary();
  }, [refreshLogSummary]);

  useEffect(() => {
    if (activeSessionId) {
      void loadGuide(activeSessionId);
    }
  }, [activeSessionId, loadGuide, webSearchEnabled]);

  async function handleCreateSession() {
    try {
      setApiError(null);
      const created = await createSession({ title: `Onboarding path ${sessions.length + 1}` });
      setSessions((current) => [created.session, ...current]);
      setActiveSessionId(created.session.id);
      setMessages(emptyMessages);
      setSources([]);
    } catch (error) {
      setApiError(formatError(error, 'Could not create a new session.'));
    }
  }

  async function handleDeleteSession(sessionId: string) {
    try {
      setApiError(null);
      await deleteSession(sessionId);
      const remaining = sessions.filter((session) => session.id !== sessionId);
      setSessions(remaining);

      if (activeSessionId === sessionId) {
        const next = remaining[0] ?? null;
        setActiveSessionId(next?.id ?? null);
        setGraph(null);
        setSelectedStepId(null);
        if (next) {
          await loadGuide(next.id);
        }
      }
    } catch (error) {
      setApiError(formatError(error, 'Could not delete the session.'));
    }
  }

  async function handleNavigateToStep(stepId: string) {
    setSelectedStepId(stepId);
    setFocusStepIds([stepId]);
    setIsRightPanelCollapsed(true);

    if (!activeSessionId) {
      return;
    }

    const step = graph?.steps.find((candidate) => candidate.id === stepId);
    if (!step || step.childIds.length > 0 || step.canExpand === false) {
      return;
    }

    try {
      setApiError(null);
      const response = await expandStep({
        sessionId: activeSessionId,
        stepId,
        webSearchEnabled,
      });
      setGraph(response.graph);
      setSources((current) => mergeSources(current, response.graph.sources));
      const focusId = response.focusStepId ?? stepId;
      setSelectedStepId(focusId);
      setFocusStepIds([focusId]);
    } catch (error) {
      setApiError(formatError(error, 'Could not expand that guide step.'));
    }
  }

  function handleLocateStep(stepId: string) {
    setSelectedStepId(stepId);
    setFocusStepIds([stepId]);
  }

  function toggleEvidence(messageId: string) {
    setExpandedEvidenceIds((current) =>
      current.includes(messageId)
        ? current.filter((id) => id !== messageId)
        : [...current, messageId],
    );
  }

  async function handleSendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeSessionId || draft.trim().length === 0) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: draft.trim(),
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, userMessage]);
    setDraft('');
    setIsChatLoading(true);

    try {
      setApiError(null);
      const response = await sendChat({
        sessionId: activeSessionId,
        message: userMessage.content,
        webSearchEnabled,
        selectedStepId: selectedStepId ?? undefined,
      });
      setMessages((current) => [...current, response.message]);
      setSources((current) => mergeSources(current, response.sources));
      if (response.focusStepIds && response.focusStepIds.length > 0) {
        setFocusStepIds(response.focusStepIds);
        setSelectedStepId(response.focusStepIds[0] ?? selectedStepId);
      }
      void refreshLogSummary();
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: formatError(error, 'The assistant could not answer right now.'),
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsChatLoading(false);
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
      <aside className="session-rail" aria-label="Onboarding sessions">
        <button
          aria-label={isLeftPanelCollapsed ? 'Expand sessions panel' : 'Collapse sessions panel'}
          className="panel-toggle"
          onClick={() => setIsLeftPanelCollapsed((current) => !current)}
          type="button"
        >
          {isLeftPanelCollapsed ? '>' : '<'}
        </button>
        <div className="panel-content">
          <div>
            <p className="eyebrow">Teams onboarding</p>
            <h1>Guidance workspace</h1>
          </div>
          <button className="primary-button" onClick={() => void handleCreateSession()}>
            + New session
          </button>
          <nav className="session-list">
            {sessions.map((session) => (
              <button
                className={session.id === activeSessionId ? 'session-item active' : 'session-item'}
                key={session.id}
                onClick={() => setActiveSessionId(session.id)}
              >
                <span>{session.title}</span>
                <small>{formatTime(session.updatedAt)}</small>
              </button>
            ))}
          </nav>
          <button
            className="ghost-button danger"
            disabled={!activeSessionId || sessions.length <= 1}
            onClick={() => activeSessionId && void handleDeleteSession(activeSessionId)}
          >
            Delete current
          </button>
        </div>
      </aside>

      <section className="workspace" aria-busy={isLoading}>
        <header className="topbar">
          <div className="breadcrumbs" aria-label="Selected step breadcrumbs">
            {breadcrumbs.length === 0 ? (
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
        <GuideCanvas
          focusStepIds={focusStepIds}
          graph={visibleGraph}
          onSelectStep={(stepId) => {
            void handleNavigateToStep(stepId);
          }}
          selectedStepId={selectedStepId}
        />
      </section>

      <aside className="assistant-panel" aria-label="Chat assistant and sources">
        <button
          aria-label={isRightPanelCollapsed ? 'Expand assistant panel' : 'Collapse assistant panel'}
          className="panel-toggle"
          onClick={() => setIsRightPanelCollapsed((current) => !current)}
          type="button"
        >
          {isRightPanelCollapsed ? '<' : '>'}
        </button>
        <section className="chat-panel">
          <div className="panel-heading">
            <p className="eyebrow">Assistant</p>
            <h2>Ask, locate, focus</h2>
          </div>
          {logSummary ? (
            <div className="usage-summary" aria-label="AI usage summary">
              <div className="usage-metric">
                <small>AI requests</small>
                <strong>{formatTokens(logSummary.aiUsage.requests)}</strong>
              </div>
              <div className="usage-metric">
                <small>Total tokens</small>
                <strong>{formatTokens(logSummary.aiUsage.totalTokens)}</strong>
              </div>
              <div className="usage-metric">
                <small>AI fee</small>
                <strong>{formatUsd(logSummary.aiUsage.estimatedFeeUsd)}</strong>
              </div>
            </div>
          ) : null}
          <section className="activity-log" aria-label="Recent log activity">
            <div className="activity-heading">
              <h3>Activity log</h3>
              <button onClick={() => void refreshLogSummary()} type="button">
                Refresh
              </button>
            </div>
            {logEvents.length > 0 ? (
              <div className="activity-list">
                {logEvents.map((event) => (
                  <article className={`log-entry ${event.level}`} key={event.id}>
                    <header>
                      <strong>{getLogTypeLabel(event)}</strong>
                      <small>{formatTime(event.timestamp)}</small>
                    </header>
                    <p>{getLogDetail(event)}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-log">No log events yet.</p>
            )}
          </section>
          <div className="message-list" role="log">
            {messages.map((message) => {
              const messageSources = message.sources ?? [];
              const evidenceExpanded = expandedEvidenceIds.includes(message.id);
              return (
                <article className={`message ${message.role}`} key={message.id}>
                  {message.focusStepIds?.length ? (
                    <div className="message-header">
                      <small>Focused matching guide step.</small>
                    </div>
                  ) : null}
                  <p>{message.content}</p>
                  {message.usage ? (
                    <div className="message-usage">
                      <span>{message.usage.model}</span>
                      <span>{formatTokens(message.usage.totalTokens)} tokens</span>
                      <span>{formatUsd(message.usage.estimatedFeeUsd)}</span>
                    </div>
                  ) : null}
                  {message.role === 'assistant' && messageSources.length > 0 ? (
                    <div className="message-evidence">
                      <button onClick={() => toggleEvidence(message.id)} type="button">
                        {evidenceExpanded
                          ? 'Hide sources'
                          : `${messageSources.length} source${
                              messageSources.length === 1 ? '' : 's'
                            } available`}
                      </button>
                      {evidenceExpanded ? (
                        <div className="evidence-list">
                          {messageSources.map((source) => (
                            <article className="evidence-item" key={source.id}>
                              <span>
                                {source.kind === 'web' || source.sourceType === 'web'
                                  ? 'Web'
                                  : 'Knowledge base'}
                              </span>
                              {source.uri ? (
                                <a href={source.uri} rel="noreferrer" target="_blank">
                                  {source.title}
                                </a>
                              ) : (
                                <strong>{source.title}</strong>
                              )}
                              <p>{source.excerpt}</p>
                            </article>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
            {isChatLoading ? <article className="message assistant">Thinking...</article> : null}
          </div>
          <form className="chat-form" onSubmit={(event) => void handleSendMessage(event)}>
            <textarea
              aria-label="Message assistant"
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask for the next action, visual location, or a plain-English answer."
              value={draft}
            />
            <button
              aria-pressed={webSearchEnabled}
              className={`web-search-button ${webSearchEnabled ? 'active' : ''}`}
              onClick={() => setWebSearchEnabled((current) => !current)}
              type="button"
            >
              Web
            </button>
            <button
              className="primary-button"
              disabled={draft.trim().length === 0 || isChatLoading}
            >
              Send
            </button>
          </form>
        </section>
      </aside>
    </main>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppContent />
    </AppErrorBoundary>
  );
}

function formatError(error: unknown, fallback: string): string {
  return error instanceof Error ? `${fallback} ${error.message}` : fallback;
}
