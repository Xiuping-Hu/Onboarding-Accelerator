import type {
  CurrentUserResponse,
  ChatRequest,
  ChatResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  GenerateGuideRootResponse,
  GuideGraph,
  GuideGraphState,
  GuideNode,
  GuideRequest,
  GuideResponse,
  GuideStep,
  KnowledgeSource,
  ListSessionsResponse,
  LogEventsResponse,
  LogSummaryResponse,
} from '@onboarding/shared';

export interface AccountSession {
  userId: string;
  email?: string;
  displayName?: string;
  role?: string;
  tenantId?: string;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Request to ${path} failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function getCurrentAccount(): Promise<AccountSession> {
  const response = await requestJson<CurrentUserResponse>('/api/auth/me');
  return toAccountSession(response.user);
}

export async function logoutAccount(): Promise<void> {
  await requestJson<void>('/api/auth/logout', { method: 'POST' });
}

function toAccountSession(user: CurrentUserResponse['user']): AccountSession {
  return {
    userId: user.id,
    ...(user.email ? { email: user.email } : {}),
    ...(user.displayName ? { displayName: user.displayName } : {}),
    ...(user.role ? { role: user.role } : {}),
    ...(user.tenantId ? { tenantId: user.tenantId } : {}),
  };
}

export async function listSessions(): Promise<ListSessionsResponse> {
  return requestJson<ListSessionsResponse>('/api/sessions');
}

export async function createSession(payload: CreateSessionRequest): Promise<CreateSessionResponse> {
  return requestJson<CreateSessionResponse>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteSession(sessionId: string): Promise<void> {
  await requestJson<void>(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
}

export async function getRootGuide(payload: GuideRequest): Promise<GuideResponse> {
  const response = await requestJson<GenerateGuideRootResponse>(
    `/api/sessions/${encodeURIComponent(payload.sessionId)}/guide/root`,
    {
      method: 'POST',
      body: JSON.stringify({ webSearchEnabled: payload.webSearchEnabled }),
    },
  );
  return {
    graph: toGuideGraph(response.session.guide, response.sources, response.session.id),
    focusStepId:
      response.session.guide.rootNodeIds.length > 0
        ? `${response.session.id}-guide-root`
        : undefined,
    knowledgeMapEnabled: response.knowledgeMapEnabled,
  };
}

function toGuideGraph(
  guide: GuideGraphState,
  sources: KnowledgeSource[],
  sessionId: string,
): GuideGraph {
  const rootId = `${sessionId}-guide-root`;
  const sourceById = new Map<string, KnowledgeSource>();

  for (const source of sources) {
    sourceById.set(source.id, source);
  }
  for (const node of Object.values(guide.nodes)) {
    for (const source of node.sources) {
      sourceById.set(source.id, source);
    }
  }

  if (guide.rootNodeIds.length === 0 && Object.keys(guide.nodes).length === 0) {
    return {
      rootId,
      steps: [],
      edges: [],
      sources: [...sourceById.values()],
      emptyReason: 'not_created',
    };
  }

  const steps: GuideStep[] = [
    {
      id: rootId,
      title: 'Begin onboarding',
      summary: 'Choose the next setup path.',
      status: 'in-progress',
      depth: 0,
      detail: 'Start here to focus the onboarding guide.',
      childIds: guide.rootNodeIds,
      sourceIds: [...sourceById.keys()],
      canExpand: false,
      maxDepth: Math.max(0, ...Object.values(guide.nodes).map((node) => node.maxDepth ?? 0)) + 1,
      childCount: guide.rootNodeIds.length,
      hasChildren: guide.rootNodeIds.length > 0,
    },
    ...Object.values(guide.nodes).map((node) => toGuideStep(node, rootId)),
  ];

  const edges = [
    ...guide.rootNodeIds.map((nodeId) => ({
      id: `${rootId}-${nodeId}`,
      from: rootId,
      to: nodeId,
      label: 'start',
    })),
    ...Object.values(guide.nodes).flatMap((node) =>
      node.children.map((childId) => ({
        id: `${node.id}-${childId}`,
        from: node.id,
        to: childId,
        label: node.canExpand ? 'next' : 'detail',
      })),
    ),
  ];

  return {
    rootId,
    steps,
    edges,
    sources: [...sourceById.values()],
  };
}

function toGuideStep(node: GuideNode, rootId: string): GuideStep {
  return {
    id: node.id,
    title: node.title,
    summary: node.summary,
    status: node.status === 'expanded' ? 'in-progress' : 'ready',
    depth: node.depth + 1,
    parentId: node.parentId ?? rootId,
    detail: node.detail,
    childIds: node.children,
    sourceIds: node.sources.map((source) => source.id),
    canExpand: node.canExpand,
    maxDepth: node.maxDepth + 1,
    childCount: node.children.length,
    hasChildren: node.children.length > 0,
  };
}

export async function sendChat(payload: ChatRequest): Promise<ChatResponse> {
  return requestJson<ChatResponse>(`/api/sessions/${encodeURIComponent(payload.sessionId)}/chat`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getLogSummary(): Promise<LogSummaryResponse> {
  return requestJson<LogSummaryResponse>('/api/logs/summary');
}

export async function getRecentLogs(limit = 10): Promise<LogEventsResponse> {
  return requestJson<LogEventsResponse>(
    `/api/logs/recent?limit=${encodeURIComponent(String(limit))}`,
  );
}
