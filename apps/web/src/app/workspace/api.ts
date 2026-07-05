import type {
  CurrentUserResponse,
  ChatRequest,
  ChatResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  ExpandGuideStepResponse,
  ExpandStepRequest,
  GenerateGuideRootResponse,
  GuideGraph,
  GuideGraphState,
  GuideNode,
  GuideRequest,
  GuideResponse,
  GuideStep,
  KnowledgeSource,
  ListSessionsResponse,
  LoginRequest,
  LoginResponse,
  LogEventsResponse,
  LogSummaryResponse,
} from '@onboarding/shared';

export interface AccountSession {
  userId: string;
  tenantId?: string;
  token?: string;
}

const authTokenKey = 'onboardingAuthToken';
const authUserIdKey = 'onboardingUserId';
const authTenantIdKey = 'onboardingTenantId';

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
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

function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') {
    return {};
  }

  const token = window.sessionStorage.getItem(authTokenKey);
  const userId = window.sessionStorage.getItem(authUserIdKey);
  const tenantId = window.sessionStorage.getItem(authTenantIdKey);
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(userId ? { 'X-User-ID': userId } : {}),
    ...(tenantId ? { 'X-Tenant-ID': tenantId } : {}),
  };
}

export function getStoredAccountSession(): AccountSession | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const token = window.sessionStorage.getItem(authTokenKey) ?? undefined;
  const userId = window.sessionStorage.getItem(authUserIdKey) ?? undefined;
  const tenantId = window.sessionStorage.getItem(authTenantIdKey) ?? undefined;

  if (!token && !userId) {
    return null;
  }

  return {
    userId: userId ?? 'local-dev-user',
    ...(tenantId ? { tenantId } : {}),
    ...(token ? { token } : {}),
  };
}

export async function loginAccount(payload: LoginRequest): Promise<AccountSession> {
  const response = await requestJson<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: {},
  });
  const account = {
    userId: response.user.id,
    ...(response.user.tenantId ? { tenantId: response.user.tenantId } : {}),
    ...(response.authToken ? { token: response.authToken } : {}),
  };
  storeAccountSession(account);
  return account;
}

export async function getCurrentAccount(): Promise<AccountSession> {
  const response = await requestJson<CurrentUserResponse>('/api/auth/me');
  const stored = getStoredAccountSession();
  const account = {
    userId: response.user.id,
    ...(response.user.tenantId ? { tenantId: response.user.tenantId } : {}),
    ...(stored?.token ? { token: stored.token } : {}),
  };
  storeAccountSession(account);
  return account;
}

export function logoutAccount(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(authTokenKey);
  window.sessionStorage.removeItem(authUserIdKey);
  window.sessionStorage.removeItem(authTenantIdKey);
}

function storeAccountSession(account: AccountSession): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(authUserIdKey, account.userId);
  if (account.token) {
    window.sessionStorage.setItem(authTokenKey, account.token);
  } else {
    window.sessionStorage.removeItem(authTokenKey);
  }
  if (account.tenantId) {
    window.sessionStorage.setItem(authTenantIdKey, account.tenantId);
  } else {
    window.sessionStorage.removeItem(authTenantIdKey);
  }
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
    focusStepId: `${response.session.id}-guide-root`,
  };
}

export async function expandStep(payload: ExpandStepRequest): Promise<GuideResponse> {
  const response = await requestJson<ExpandGuideStepResponse>(
    `/api/sessions/${encodeURIComponent(payload.sessionId)}/guide/expand`,
    {
      method: 'POST',
      body: JSON.stringify({
        nodeId: payload.stepId,
        webSearchEnabled: payload.webSearchEnabled,
      }),
    },
  );
  return {
    graph: toGuideGraph(response.session.guide, response.sources, response.session.id),
    focusStepId: response.childNodeIds[0] ?? response.parentNodeId,
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
