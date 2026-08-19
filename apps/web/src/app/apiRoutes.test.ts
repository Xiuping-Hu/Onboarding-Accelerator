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
  const onboardingRoute = await import('./api/onboarding/route');
  const onboardingTaskRoute = await import('./api/onboarding/tasks/[taskId]/route');
  const onboardingNoticeRoute = await import('./api/onboarding/notices/[noticeId]/route');
  const legacyOnboardingRoute = await import('./api/sessions/[sessionId]/onboarding/route');
  const retiredOnboardingRoutes = [
    legacyOnboardingRoute.POST,
    (await import('./api/sessions/[sessionId]/onboarding/tasks/[taskId]/route')).PATCH,
    (await import('./api/sessions/[sessionId]/onboarding/generate/route')).POST,
    (await import('./api/sessions/[sessionId]/onboarding/commands/route')).POST,
    (await import('./api/sessions/[sessionId]/onboarding/commands/impact/route')).POST,
    (await import('./api/sessions/[sessionId]/onboarding/ai-proposals/route')).POST,
    (await import('./api/sessions/[sessionId]/onboarding/ai-proposals/[proposalId]/apply/route'))
      .POST,
    (await import('./api/sessions/[sessionId]/onboarding/ai-proposals/[proposalId]/dismiss/route'))
      .POST,
    (await import('./api/sessions/[sessionId]/onboarding/cancellation-impact/route')).POST,
    (await import('./api/sessions/[sessionId]/onboarding/cancel/route')).POST,
    (await import('./api/sessions/[sessionId]/onboarding/history/route')).GET,
  ];
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
    new NextRequest('http://localhost/api/onboarding', {
      headers: { 'x-user-id': 'api-test-user' },
    }),
  );
  assert.equal(emptyOnboardingResponse.status, 200);
  assert.deepEqual(await emptyOnboardingResponse.json(), {
    status: 'empty',
    message: 'Roadmap is being prepared from the latest knowledge base.',
    newestUnreadNotice: null,
    unreadNoticeCount: 0,
  });

  const missingTaskId = '9f158f5e-5333-4dba-a4bd-0ea3f9700435';
  const invalidTaskTransition = await onboardingTaskRoute.PATCH(
    jsonRequest(
      `http://localhost/api/onboarding/tasks/${missingTaskId}`,
      {
        status: 'completed',
        expectedTaskRevision: 0,
        expectedStateRevision: 0,
        clientRequestId: 'invalid-definition-edit',
        title: 'Forbidden client definition field',
      },
      'PATCH',
    ),
    { params: Promise.resolve({ taskId: missingTaskId }) },
  );
  assert.equal(invalidTaskTransition.status, 400);

  const missingTaskTransition = await onboardingTaskRoute.PATCH(
    jsonRequest(
      `http://localhost/api/onboarding/tasks/${missingTaskId}`,
      {
        status: 'completed',
        expectedTaskRevision: 0,
        expectedStateRevision: 0,
        clientRequestId: 'missing-task',
      },
      'PATCH',
    ),
    { params: Promise.resolve({ taskId: missingTaskId }) },
  );
  assert.equal(missingTaskTransition.status, 404);

  const missingNoticeId = '136a07cb-80a1-4fc9-94c4-512d94003398';
  const invalidNoticeAcknowledgement = await onboardingNoticeRoute.PATCH(
    jsonRequest(
      `http://localhost/api/onboarding/notices/${missingNoticeId}`,
      { read: false },
      'PATCH',
    ),
    { params: Promise.resolve({ noticeId: missingNoticeId }) },
  );
  assert.equal(invalidNoticeAcknowledgement.status, 400);

  const missingNoticeAcknowledgement = await onboardingNoticeRoute.PATCH(
    jsonRequest(
      `http://localhost/api/onboarding/notices/${missingNoticeId}`,
      { read: true },
      'PATCH',
    ),
    { params: Promise.resolve({ noticeId: missingNoticeId }) },
  );
  assert.equal(missingNoticeAcknowledgement.status, 404);

  for (const retiredRoute of retiredOnboardingRoutes) {
    const retiredResponse = await retiredRoute(
      jsonRequest(
        `http://localhost/api/sessions/${created.session.id}/onboarding/retired`,
        'invalid request bodies are deliberately not parsed',
      ),
      {
        params: Promise.resolve({
          sessionId: created.session.id,
          proposalId: 'not-parsed',
        }),
      },
    );
    assert.equal(retiredResponse.status, 410);
    assert.match(
      ((await retiredResponse.json()) as { error: string }).error,
      /session-scoped roadmap endpoint is gone/i,
    );
  }

  const legacyOnboardingReloadResponse = await legacyOnboardingRoute.GET(
    new NextRequest(`http://localhost/api/sessions/${created.session.id}/onboarding`, {
      headers: { 'x-user-id': 'api-test-user' },
    }),
    { params: Promise.resolve({ sessionId: created.session.id }) },
  );
  assert.equal(legacyOnboardingReloadResponse.status, 200);
  assert.deepEqual(await legacyOnboardingReloadResponse.json(), {
    status: 'empty',
    reason: 'no-active-plan',
  });

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
  const onboardingRoute = await import('./api/onboarding/route');
  const retiredOnboardingRoute = await import('./api/sessions/[sessionId]/onboarding/route');
  const response = await meRoute.GET(new NextRequest('http://localhost/api/auth/me'));

  assert.equal(response.status, 401);
  const body = (await response.json()) as { error: string; requestId?: string };
  assert.equal(body.error, 'Authentication required');
  assert.match(body.requestId ?? '', /.+/);

  const onboardingResponse = await onboardingRoute.GET(
    new NextRequest('http://localhost/api/onboarding'),
  );
  assert.equal(onboardingResponse.status, 401);

  const retiredResponse = await retiredOnboardingRoute.POST(
    new NextRequest('http://localhost/api/sessions/session-a/onboarding', { method: 'POST' }),
    { params: Promise.resolve({ sessionId: 'session-a' }) },
  );
  assert.equal(retiredResponse.status, 401);
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
