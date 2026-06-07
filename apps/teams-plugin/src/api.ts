import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  ExpandStepRequest,
  GuideGraph,
  GuideRequest,
  GuideResponse,
  GuideStep,
  KnowledgeSource,
  ListSessionsResponse,
  OnboardingSession,
} from '@onboarding/shared';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3978';
const useMockApi =
  (import.meta.env.VITE_USE_MOCK_API ?? 'true').toLocaleLowerCase() !== 'false';

const now = () => new Date().toISOString();
const id = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;

const sourceLibrary: KnowledgeSource[] = [
  {
    id: 'kb-benefits',
    title: 'Benefits onboarding handbook',
    excerpt: 'New hires should enroll in benefits during their first month and review coverage options with HR.',
    uri: 'https://contoso.example/handbook/benefits',
    kind: 'knowledge-base',
  },
  {
    id: 'kb-teams',
    title: 'Teams workspace setup guide',
    excerpt: 'Join your department team, pin onboarding channels, and validate notifications for priority channels.',
    uri: 'https://contoso.example/it/teams-setup',
    kind: 'knowledge-base',
  },
  {
    id: 'web-security',
    title: 'Microsoft security training guidance',
    excerpt: 'Security awareness programs should include phishing, device hygiene, data handling, and reporting practices.',
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
  },
];

const mockGraphs = new Map<string, GuideGraph>();

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
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
    },
    {
      id: `${sessionId}-access`,
      title: 'Set up access',
      summary: 'Validate identity, Teams, mail, devices, and required apps.',
      status: 'ready',
      depth: 1,
      parentId: rootId,
      detail: 'Confirm single sign-on, device compliance, and workspace membership before starting role-specific work.',
      childIds: [],
      sourceIds: ['kb-teams'],
    },
    {
      id: `${sessionId}-people`,
      title: 'Meet your network',
      summary: 'Find your manager, buddy, team channels, and support contacts.',
      status: 'ready',
      depth: 1,
      parentId: rootId,
      detail: 'Use Teams channels and org resources to understand who can unblock setup, benefits, security, and role questions.',
      childIds: [],
      sourceIds: ['kb-teams', 'kb-benefits'],
    },
    {
      id: `${sessionId}-learning`,
      title: 'Complete essentials',
      summary: 'Finish benefits, security, compliance, and role training.',
      status: 'locked',
      depth: 1,
      parentId: rootId,
      detail: 'This track expands into required learning based on role, location, and policy context.',
      childIds: [],
      sourceIds: ['kb-benefits', 'web-security'],
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

  if (!step || step.childIds.length > 0) {
    return { graph, focusStepId: stepId };
  }

  const nextDepth = step.depth + 1;
  const childTemplates = [
    ['Locate visual reference', 'Find the relevant Teams page, policy visual, or checklist artifact.'],
    ['Do the action', 'Complete the concrete task and capture anything that needs follow-up.'],
    ['Confirm with assistant', 'Ask for verification, risks, or a shorter explanation before moving on.'],
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
    };
  });

  step.childIds = children.map((child) => child.id);
  step.status = 'in-progress';
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

  return { graph: { ...graph, steps: [...graph.steps], edges: [...graph.edges] }, focusStepId: children[0]?.id };
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
    return await requestJson<GuideResponse>(
      `/api/sessions/${encodeURIComponent(payload.sessionId)}/guide`,
      {
        method: 'POST',
        body: JSON.stringify({ webSearchEnabled: payload.webSearchEnabled }),
      },
    );
  } catch (error) {
    shouldMock(error);
    const graph = getGraph(payload.sessionId);
    if (payload.webSearchEnabled && !graph.sources.some((source) => source.id === 'web-security')) {
      graph.sources.push(sourceLibrary[2] as KnowledgeSource);
    }
    return { graph: { ...graph, steps: [...graph.steps], edges: [...graph.edges] }, focusStepId: graph.rootId };
  }
}

export async function expandStep(payload: ExpandStepRequest): Promise<GuideResponse> {
  try {
    return await requestJson<GuideResponse>(
      `/api/sessions/${encodeURIComponent(payload.sessionId)}/guide/steps/${encodeURIComponent(
        payload.stepId,
      )}/expand`,
      {
        method: 'POST',
        body: JSON.stringify({ webSearchEnabled: payload.webSearchEnabled }),
      },
    );
  } catch (error) {
    shouldMock(error);
    return expandMockStep(payload);
  }
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
    };
    return {
      message,
      focusStepIds: message.focusStepIds,
      sources,
    };
  }
}
