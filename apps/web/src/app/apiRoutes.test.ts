import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';
import type {
  ChatResponse,
  CreateSessionResponse,
  GenerateGuideRootResponse,
  GetSessionResponse,
  TransitionOnboardingTaskResponse,
  WorkspaceOnboardingState,
} from '@onboarding/shared';
import { resetAppContainerForTests } from '../server/bootstrap/appContainer';

void test('Next API handlers create sessions, generate guides, chat, and expose logs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'onboarding-next-api-'));
  process.env.AUTH_DISABLED = 'true';
  delete process.env.DATABASE_URL;
  process.env.SESSION_STORE_PATH = join(directory, 'sessions.json');
  process.env.LOG_STORE_PATH = join(directory, 'events.jsonl');
  process.env.OPENAI_API_KEY = '';
  process.env.RAG_SEED_KNOWLEDGE_ENABLED = 'true';
  resetAppContainerForTests();

  const sessionsRoute = await import('./api/sessions/route');
  const guideRootRoute = await import('./api/sessions/[sessionId]/guide/root/route');
  const chatRoute = await import('./api/sessions/[sessionId]/chat/route');
  const sessionRoute = await import('./api/sessions/[sessionId]/route');
  const sourceRoute = await import('./api/sources/[sourceId]/route');
  const onboardingRoute = await import('./api/sessions/[sessionId]/onboarding/route');
  const onboardingTaskRoute =
    await import('./api/sessions/[sessionId]/onboarding/tasks/[taskId]/route');
  const onboardingCommandRoute =
    await import('./api/sessions/[sessionId]/onboarding/commands/route');
  const onboardingHistoryRoute =
    await import('./api/sessions/[sessionId]/onboarding/history/route');
  const onboardingCancellationImpactRoute =
    await import('./api/sessions/[sessionId]/onboarding/cancellation-impact/route');
  const onboardingCancelRoute = await import('./api/sessions/[sessionId]/onboarding/cancel/route');
  const ragWorkflowRoute = await import('./api/sessions/[sessionId]/rag-workflows/route');
  const logsRoute = await import('./api/logs/recent/route');
  const meRoute = await import('./api/auth/me/route');

  const meResponse = await meRoute.GET(
    new NextRequest('http://localhost/api/auth/me', {
      headers: { 'x-user-id': 'api-test-user' },
    }),
  );
  assert.equal(meResponse.status, 200);
  assert.deepEqual(await meResponse.json(), { user: { id: 'api-test-user' } });

  const crossSiteMutation = await sessionsRoute.POST(
    jsonRequest('http://localhost/api/sessions', { title: 'Rejected cross-site request' }, 'POST', {
      origin: 'https://attacker.example',
      'sec-fetch-site': 'cross-site',
    }),
  );
  assert.equal(crossSiteMutation.status, 403);

  const createdResponse = await sessionsRoute.POST(
    jsonRequest('http://localhost/api/sessions', {
      title: 'API route smoke',
    }),
  );
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()) as CreateSessionResponse;
  assert.equal(created.session.title, 'API route smoke');

  const emptyOnboardingResponse = await onboardingRoute.GET(
    new NextRequest(`http://localhost/api/sessions/${created.session.id}/onboarding`, {
      headers: { 'x-user-id': 'api-test-user' },
    }),
    { params: Promise.resolve({ sessionId: created.session.id }) },
  );
  assert.equal(emptyOnboardingResponse.status, 200);
  assert.deepEqual(await emptyOnboardingResponse.json(), {
    status: 'empty',
    reason: 'no-active-plan',
  });

  const creationResponse = await onboardingRoute.POST(
    jsonRequest(`http://localhost/api/sessions/${created.session.id}/onboarding`, {
      clientRequestId: 'api-create-plan',
      title: 'API onboarding plan',
      startAt: '2026-08-05T12:00:00Z',
      stages: [
        {
          stableKey: 'orientation',
          title: 'Orientation',
          description: 'Learn the basics',
          position: 1,
          tasks: [{ stableKey: 'read-handbook', title: 'Read the handbook' }],
        },
      ],
    }),
    { params: Promise.resolve({ sessionId: created.session.id }) },
  );
  assert.equal(creationResponse.status, 201);
  const creation = (await creationResponse.json()) as TransitionOnboardingTaskResponse;
  assert.equal(creation.state.status, 'ready');
  if (creation.state.status !== 'ready') return;
  const onboardingTask = creation.state.projection.tasks[0]!;

  const transitionResponse = await onboardingTaskRoute.PATCH(
    jsonRequest(
      `http://localhost/api/sessions/${created.session.id}/onboarding/tasks/${onboardingTask.id}`,
      {
        status: 'completed',
        expectedRevision: onboardingTask.revision,
        idempotencyKey: 'api-complete-task',
        source: 'tasks_ui',
      },
      'PATCH',
    ),
    { params: Promise.resolve({ sessionId: created.session.id, taskId: onboardingTask.id }) },
  );
  assert.equal(transitionResponse.status, 200);
  const completed = (await transitionResponse.json()) as TransitionOnboardingTaskResponse;
  assert.equal(
    completed.state.status === 'ready' && completed.state.projection.progress.percentComplete,
    100,
  );
  if (completed.state.status !== 'ready') return;

  const commandResponse = await onboardingCommandRoute.POST(
    jsonRequest(`http://localhost/api/sessions/${created.session.id}/onboarding/commands`, {
      expectedPlanRevision: completed.state.projection.planRevision,
      idempotencyKey: 'api-update-roadmap-title',
      command: { type: 'set_metadata', title: 'Updated API onboarding plan' },
    }),
    { params: Promise.resolve({ sessionId: created.session.id }) },
  );
  assert.equal(commandResponse.status, 200);
  const commandResult = (await commandResponse.json()) as TransitionOnboardingTaskResponse;
  assert.equal(
    commandResult.state.status === 'ready' && commandResult.state.projection.title,
    'Updated API onboarding plan',
  );

  const historyResponse = await onboardingHistoryRoute.GET(
    new NextRequest(`http://localhost/api/sessions/${created.session.id}/onboarding/history`, {
      headers: { 'x-user-id': 'api-test-user' },
    }),
    { params: Promise.resolve({ sessionId: created.session.id }) },
  );
  assert.equal(historyResponse.status, 200);
  assert.deepEqual(
    ((await historyResponse.json()) as { events: Array<{ commandType: string }> }).events.map(
      (event) => event.commandType,
    ),
    ['set_metadata', 'create_plan'],
  );

  const onboardingReloadResponse = await onboardingRoute.GET(
    new NextRequest(`http://localhost/api/sessions/${created.session.id}/onboarding`, {
      headers: { 'x-user-id': 'api-test-user' },
    }),
    { params: Promise.resolve({ sessionId: created.session.id }) },
  );
  const onboardingReload = (await onboardingReloadResponse.json()) as WorkspaceOnboardingState;
  assert.equal(
    onboardingReload.status === 'ready' && onboardingReload.projection.progress.percentComplete,
    100,
  );

  const rootResponse = await guideRootRoute.POST(
    jsonRequest(`http://localhost/api/sessions/${created.session.id}/guide/root`, {}),
    { params: Promise.resolve({ sessionId: created.session.id }) },
  );
  assert.equal(rootResponse.status, 200);
  const root = (await rootResponse.json()) as GenerateGuideRootResponse;
  assert.deepEqual(root.rootNodeIds, []);

  const chatResponse = await chatRoute.POST(
    jsonRequest(`http://localhost/api/sessions/${created.session.id}/chat`, {
      message: 'What should I do next?',
      webSearchEnabled: false,
    }),
    { params: Promise.resolve({ sessionId: created.session.id }) },
  );
  assert.equal(chatResponse.status, 200);
  const chat = (await chatResponse.json()) as ChatResponse;
  assert.equal(chat.message.role, 'assistant');
  assert.match(chat.message.content, /onboarding|first week/i);
  const source = chat.message.sources?.[0];
  assert.ok(source?.href);

  const reloadedResponse = await sessionRoute.GET(
    new NextRequest(`http://localhost/api/sessions/${created.session.id}`, {
      headers: { 'x-user-id': 'api-test-user' },
    }),
    { params: Promise.resolve({ sessionId: created.session.id }) },
  );
  assert.equal(reloadedResponse.status, 200);
  const reloaded = (await reloadedResponse.json()) as GetSessionResponse;
  assert.equal(reloaded.chatHistory.at(-1)?.sources?.[0]?.href, source?.href);

  if (source?.href?.startsWith('/api/sources/')) {
    const sourceResponse = await sourceRoute.GET(
      new NextRequest(`http://localhost${source.href}`, {
        headers: { 'x-user-id': 'api-test-user' },
      }),
      { params: Promise.resolve({ sourceId: source.id }) },
    );
    assert.equal(sourceResponse.status, 200);
    assert.match(sourceResponse.headers.get('content-type') ?? '', /text\/html/);
    assert.doesNotMatch(await sourceResponse.text(), /kb:\/\//);
  }

  const disabledWorkflowResponse = await ragWorkflowRoute.POST(
    jsonRequest(`http://localhost/api/sessions/${created.session.id}/rag-workflows`, {
      message: 'What is the onboarding process?',
      clientRequestId: 'api-workflow-disabled',
    }),
    { params: Promise.resolve({ sessionId: created.session.id }) },
  );
  assert.equal(disabledWorkflowResponse.status, 404);
  assert.equal(
    ((await disabledWorkflowResponse.json()) as { error: string }).error,
    'Mastra RAG workflows are not enabled.',
  );

  const cancellationImpactResponse = await onboardingCancellationImpactRoute.POST(
    jsonRequest(
      `http://localhost/api/sessions/${created.session.id}/onboarding/cancellation-impact`,
      {},
    ),
    { params: Promise.resolve({ sessionId: created.session.id }) },
  );
  assert.equal(cancellationImpactResponse.status, 200);
  const cancellationImpact = (await cancellationImpactResponse.json()) as {
    planRevision: number;
    impactHash: string;
  };
  const cancellationResponse = await onboardingCancelRoute.POST(
    jsonRequest(`http://localhost/api/sessions/${created.session.id}/onboarding/cancel`, {
      expectedPlanRevision: cancellationImpact.planRevision,
      idempotencyKey: 'api-cancel-roadmap',
      impactHash: cancellationImpact.impactHash,
      reason: 'API lifecycle smoke test complete',
    }),
    { params: Promise.resolve({ sessionId: created.session.id }) },
  );
  assert.equal(cancellationResponse.status, 200);
  assert.deepEqual(await cancellationResponse.json(), {
    status: 'empty',
    reason: 'no-active-plan',
  });

  const logsResponse = await logsRoute.GET(
    new NextRequest('http://localhost/api/logs/recent?limit=10', {
      headers: { 'x-user-id': 'api-test-user' },
    }),
  );
  assert.equal(logsResponse.status, 200);
  assert.ok(((await logsResponse.json()) as { events: unknown[] }).events.length >= 3);
});

void test('protected API handlers reject unauthenticated requests when account auth is enabled', async () => {
  process.env.AUTH_DISABLED = 'false';
  process.env.DATABASE_URL = 'postgres://user:password@localhost:5432/onboarding';
  process.env.AUTH_MICROSOFT_TENANT_ID = 'e0bc1e92-f544-4358-8d5f-5aabe36f1df6';
  process.env.AUTH_MICROSOFT_CLIENT_ID = '00000000-0000-0000-0000-000000000001';
  process.env.AUTH_MICROSOFT_CLIENT_SECRET = 'test-client-secret';
  process.env.AUTH_MICROSOFT_REDIRECT_URI = 'http://localhost:3000/api/auth/microsoft/callback';
  resetAppContainerForTests();

  const meRoute = await import('./api/auth/me/route');
  const response = await meRoute.GET(new NextRequest('http://localhost/api/auth/me'));

  assert.equal(response.status, 401);
  const body = (await response.json()) as { error: string; requestId?: string };
  assert.equal(body.error, 'Authentication required');
  assert.match(body.requestId ?? '', /.+/);
});

void test('retired registration and admin routes do not exist', async () => {
  const { access } = await import('node:fs/promises');
  const missingPaths = [
    join(process.cwd(), 'src/app/register/page.tsx'),
    join(process.cwd(), 'src/app/api/auth/register/route.ts'),
    join(process.cwd(), 'src/app/admin'),
    join(process.cwd(), 'src/app/api/admin'),
  ];

  for (const path of missingPaths) {
    await assert.rejects(() => access(path));
  }
});

function jsonRequest(
  url: string,
  body: unknown,
  method = 'POST',
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-user-id': 'api-test-user',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
