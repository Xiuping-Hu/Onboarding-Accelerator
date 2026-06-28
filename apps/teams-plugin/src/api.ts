import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  ExpandStepRequest,
  ExpandGuideStepResponse,
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
  OnboardingSession,
} from '@onboarding/shared';

const viteEnv = import.meta.env ?? {};
const apiBaseUrl = viteEnv.VITE_API_BASE_URL ?? 'http://localhost:3978';
const useMockApi = (viteEnv.VITE_USE_MOCK_API ?? 'false').toLocaleLowerCase() === 'true';

declare global {
  interface Window {
    __ONBOARDING_AUTH_TOKEN__?: string;
  }
}

const now = () => new Date().toISOString();
const id = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
const mockMaxDepth = 2;

const emptyLogSummary: LogSummaryResponse = {
  eventsTotal: 0,
  requestsTotal: 0,
  errorsTotal: 0,
  aiUsage: {
    model: 'all',
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedFeeUsd: 0,
    byModel: {},
  },
};

const mockRecentLogs: LogEventsResponse = {
  events: [
    {
      id: 'mock-log-ai',
      timestamp: now(),
      level: 'info',
      type: 'ai_usage',
      operation: 'chat',
      sessionId: 'session-first-week',
      usage: {
        model: 'mock-assistant',
        inputTokens: 812,
        outputTokens: 128,
        totalTokens: 940,
        estimatedFeeUsd: 0,
      },
    },
    {
      id: 'mock-log-request',
      timestamp: now(),
      level: 'info',
      type: 'request',
      method: 'POST',
      path: '/api/sessions/session-first-week/chat',
      statusCode: 200,
      durationMs: 48,
    },
  ],
};

function emptyGuide() {
  return {
    rootNodeIds: [],
    nodes: {},
    expandedNodeIds: [],
  };
}

const sourceLibrary: KnowledgeSource[] = [
  {
    id: 'kb-benefits',
    title: 'Benefits onboarding handbook',
    excerpt:
      'New hires should enroll in benefits during their first month and review coverage options with HR.',
    uri: 'https://contoso.example/handbook/benefits',
    kind: 'knowledge-base',
  },
  {
    id: 'kb-teams',
    title: 'Teams workspace setup guide',
    excerpt:
      'Join your department team, pin onboarding channels, and validate notifications for priority channels.',
    uri: 'https://contoso.example/it/teams-setup',
    kind: 'knowledge-base',
  },
  {
    id: 'web-security',
    title: 'Microsoft security training guidance',
    excerpt:
      'Security awareness programs should include phishing, device hygiene, data handling, and reporting practices.',
    uri: 'https://learn.microsoft.com/security/',
    kind: 'web',
  },
];

let mockSessions: OnboardingSession[] = [
  {
    id: 'session-first-week',
    title: 'First week path',
    createdAt: now(),
    updatedAt: now(),
    settings: { webSearchEnabled: false },
    chatHistory: [],
    guide: emptyGuide(),
  },
];

const mockGraphs = new Map<string, GuideGraph>();

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
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

  return (await response.json()) as T;
}

function shouldMock(error: unknown) {
  if (!useMockApi) {
    throw error;
  }
}

function getAuthHeaders(): Record<string, string> {
  const token =
    window.__ONBOARDING_AUTH_TOKEN__ ?? window.sessionStorage.getItem('onboardingAuthToken');
  const userId = window.sessionStorage.getItem('onboardingUserId');
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(userId ? { 'X-User-ID': userId } : {}),
  };
}

function makeRootGraph(sessionId: string): GuideGraph {
  const rootId = `${sessionId}-root`;
  const steps: GuideStep[] = [
    {
      id: rootId,
      title: 'Begin onboarding',
      summary: 'Orient yourself, confirm access, and choose the next setup path.',
      status: 'in-progress',
      depth: 0,
      detail:
        'Start here to understand the onboarding map. Expand any step to reveal more precise actions from the knowledge base or web results.',
      childIds: [`${sessionId}-access`, `${sessionId}-people`, `${sessionId}-learning`],
      sourceIds: ['kb-teams'],
      canExpand: false,
      maxDepth: mockMaxDepth,
    },
    {
      id: `${sessionId}-access`,
      title: 'Set up access',
      summary: 'Validate identity, Teams, mail, devices, and required apps.',
      status: 'ready',
      depth: 1,
      parentId: rootId,
      detail:
        'Confirm single sign-on, device compliance, and workspace membership before starting role-specific work.',
      childIds: [],
      sourceIds: ['kb-teams'],
      canExpand: true,
      maxDepth: mockMaxDepth,
    },
    {
      id: `${sessionId}-people`,
      title: 'Meet your network',
      summary: 'Find your manager, buddy, team channels, and support contacts.',
      status: 'ready',
      depth: 1,
      parentId: rootId,
      detail:
        'Use Teams channels and org resources to understand who can unblock setup, benefits, security, and role questions.',
      childIds: [],
      sourceIds: ['kb-teams', 'kb-benefits'],
      canExpand: true,
      maxDepth: mockMaxDepth,
    },
    {
      id: `${sessionId}-learning`,
      title: 'Complete essentials',
      summary: 'Finish benefits, security, compliance, and role training.',
      status: 'locked',
      depth: 1,
      parentId: rootId,
      detail:
        'This track expands into required learning based on role, location, and policy context.',
      childIds: [],
      sourceIds: ['kb-benefits', 'web-security'],
      canExpand: true,
      maxDepth: mockMaxDepth,
    },
  ];

  return {
    rootId,
    steps,
    edges: [
      { id: `${rootId}-access`, from: rootId, to: `${sessionId}-access`, label: 'day 1' },
      { id: `${rootId}-people`, from: rootId, to: `${sessionId}-people`, label: 'week 1' },
      { id: `${rootId}-learning`, from: rootId, to: `${sessionId}-learning`, label: 'required' },
    ],
    sources: sourceLibrary.slice(0, 2),
  };
}

function getGraph(sessionId: string) {
  const existing = mockGraphs.get(sessionId);
  if (existing) {
    return existing;
  }

  const graph = makeRootGraph(sessionId);
  mockGraphs.set(sessionId, graph);
  return graph;
}

function expandMockStep({ sessionId, stepId, webSearchEnabled }: ExpandStepRequest): GuideResponse {
  const graph = getGraph(sessionId);
  const step = graph.steps.find((candidate) => candidate.id === stepId);

  if (!step || step.childIds.length > 0 || step.depth >= (step.maxDepth ?? mockMaxDepth)) {
    if (step) {
      step.canExpand = false;
    }
    return { graph, focusStepId: stepId };
  }

  const nextDepth = step.depth + 1;
  const childTemplates = [
    [
      'Locate visual reference',
      'Find the relevant Teams page, policy visual, or checklist artifact.',
    ],
    ['Do the action', 'Complete the concrete task and capture anything that needs follow-up.'],
    [
      'Confirm with assistant',
      'Ask for verification, risks, or a shorter explanation before moving on.',
    ],
  ] as const;

  const children = childTemplates.map(([title, summary], index): GuideStep => {
    const childId = `${stepId}-${index + 1}`;
    return {
      id: childId,
      title,
      summary,
      status: index === 0 ? 'ready' : 'locked',
      depth: nextDepth,
      parentId: stepId,
      detail: `${summary} This node can be expanded again when the server returns more detailed sub-steps.`,
      childIds: [],
      sourceIds: webSearchEnabled ? ['kb-teams', 'web-security'] : ['kb-teams'],
      canExpand: nextDepth < (step.maxDepth ?? mockMaxDepth),
      maxDepth: step.maxDepth ?? mockMaxDepth,
    };
  });

  step.childIds = children.map((child) => child.id);
  step.status = 'in-progress';
  step.canExpand = false;
  graph.steps.push(...children);
  graph.edges.push(
    ...children.map((child) => ({
      id: `${step.id}-${child.id}`,
      from: step.id,
      to: child.id,
      label: child.status === 'ready' ? 'next' : 'later',
    })),
  );

  if (webSearchEnabled && !graph.sources.some((source) => source.id === 'web-security')) {
    graph.sources.push(sourceLibrary[2] as KnowledgeSource);
  }

  return {
    graph: { ...graph, steps: [...graph.steps], edges: [...graph.edges] },
    focusStepId: children[0]?.id,
  };
}

export async function listSessions(): Promise<ListSessionsResponse> {
  try {
    return await requestJson<ListSessionsResponse>('/api/sessions');
  } catch (error) {
    shouldMock(error);
    return { sessions: [...mockSessions] };
  }
}

export async function createSession(payload: CreateSessionRequest): Promise<CreateSessionResponse> {
  try {
    return await requestJson<CreateSessionResponse>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (error) {
    shouldMock(error);
    const session: OnboardingSession = {
      id: id('session'),
      title: payload.title?.trim() || `Onboarding path ${mockSessions.length + 1}`,
      createdAt: now(),
      updatedAt: now(),
      settings: { webSearchEnabled: payload.settings?.webSearchEnabled ?? false },
      chatHistory: [],
      guide: emptyGuide(),
    };
    mockSessions = [session, ...mockSessions];
    mockGraphs.set(session.id, makeRootGraph(session.id));
    return { session };
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  try {
    await requestJson<void>(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
  } catch (error) {
    shouldMock(error);
    mockSessions = mockSessions.filter((session) => session.id !== sessionId);
    mockGraphs.delete(sessionId);
  }
}

export async function getRootGuide(payload: GuideRequest): Promise<GuideResponse> {
  try {
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
  } catch (error) {
    shouldMock(error);
    const graph = getGraph(payload.sessionId);
    if (payload.webSearchEnabled && !graph.sources.some((source) => source.id === 'web-security')) {
      graph.sources.push(sourceLibrary[2] as KnowledgeSource);
    }
    return {
      graph: { ...graph, steps: [...graph.steps], edges: [...graph.edges] },
      focusStepId: graph.rootId,
    };
  }
}

export async function expandStep(payload: ExpandStepRequest): Promise<GuideResponse> {
  try {
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
  } catch (error) {
    shouldMock(error);
    return expandMockStep(payload);
  }
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
  try {
    return await requestJson<ChatResponse>(
      `/api/sessions/${encodeURIComponent(payload.sessionId)}/chat`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  } catch (error) {
    shouldMock(error);
    const targetStepId = payload.selectedStepId;
    const visualIntent = /visual|screenshot|image|locate|where/i.test(payload.message);
    const sources = payload.webSearchEnabled
      ? sourceLibrary
      : sourceLibrary.filter((source) => source.kind !== 'web');
    const message: ChatMessage = {
      id: id('assistant'),
      role: 'assistant',
      createdAt: now(),
      content: visualIntent
        ? 'I found the most relevant setup references and focused the matching step. Expand it to see the concrete visual-location tasks.'
        : 'Here is the next practical move: complete the highlighted step, then expand it if you need a more granular checklist.',
      sources,
      focusStepIds: targetStepId ? [targetStepId] : undefined,
      usage: {
        model: 'mock-assistant',
        inputTokens: 812,
        outputTokens: 128,
        totalTokens: 940,
        estimatedFeeUsd: 0,
      },
    };
    return {
      message,
      focusStepIds: message.focusStepIds,
      sources,
      usage: message.usage,
    };
  }
}

export async function getLogSummary(): Promise<LogSummaryResponse> {
  try {
    return await requestJson<LogSummaryResponse>('/api/logs/summary');
  } catch (error) {
    shouldMock(error);
    return emptyLogSummary;
  }
}

export async function getRecentLogs(limit = 10): Promise<LogEventsResponse> {
  try {
    return await requestJson<LogEventsResponse>(
      `/api/logs/recent?limit=${encodeURIComponent(String(limit))}`,
    );
  } catch (error) {
    shouldMock(error);
    return mockRecentLogs;
  }
}
