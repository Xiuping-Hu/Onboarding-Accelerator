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
} from '@onboarding/shared';

void test('Next API handlers create sessions, generate guides, chat, and expose logs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'onboarding-next-api-'));
  process.env.AUTH_DISABLED = 'true';
  process.env.SESSION_STORE_PATH = join(directory, 'sessions.json');
  process.env.LOG_STORE_PATH = join(directory, 'events.jsonl');
  process.env.OPENAI_API_KEY = '';

  const sessionsRoute = await import('./api/sessions/route');
  const guideRootRoute = await import('./api/sessions/[sessionId]/guide/root/route');
  const chatRoute = await import('./api/sessions/[sessionId]/chat/route');
  const logsRoute = await import('./api/logs/recent/route');
  const loginRoute = await import('./api/auth/login/route');
  const meRoute = await import('./api/auth/me/route');

  const loginResponse = await loginRoute.POST(
    jsonRequest('http://localhost/api/auth/login', {
      userId: 'api-test-user',
      tenantId: 'test-tenant',
    }),
  );
  assert.equal(loginResponse.status, 200);
  assert.deepEqual(await loginResponse.json(), {
    user: { id: 'api-test-user', tenantId: 'test-tenant' },
  });

  const meResponse = await meRoute.GET(
    new NextRequest('http://localhost/api/auth/me', {
      headers: { 'x-user-id': 'api-test-user' },
    }),
  );
  assert.equal(meResponse.status, 200);
  assert.deepEqual(await meResponse.json(), { user: { id: 'api-test-user' } });

  const createdResponse = await sessionsRoute.POST(
    jsonRequest('http://localhost/api/sessions', {
      title: 'API route smoke',
    }),
  );
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()) as CreateSessionResponse;
  assert.equal(created.session.title, 'API route smoke');

  const rootResponse = await guideRootRoute.POST(
    jsonRequest(`http://localhost/api/sessions/${created.session.id}/guide/root`, {}),
    { params: Promise.resolve({ sessionId: created.session.id }) },
  );
  assert.equal(rootResponse.status, 200);
  const root = (await rootResponse.json()) as GenerateGuideRootResponse;
  assert.ok(root.rootNodeIds.length > 0);

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
  assert.match(chat.message.content, /onboarding/i);

  const logsResponse = await logsRoute.GET(
    new NextRequest('http://localhost/api/logs/recent?limit=10', {
      headers: { 'x-user-id': 'api-test-user' },
    }),
  );
  assert.equal(logsResponse.status, 200);
  assert.ok(((await logsResponse.json()) as { events: unknown[] }).events.length >= 3);
});

function jsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-user-id': 'api-test-user',
    },
    body: JSON.stringify(body),
  });
}
