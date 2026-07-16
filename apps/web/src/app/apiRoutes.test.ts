import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';
import type {
  AdminActivityResponse,
  AdminAuditResponse,
  AiFeeSummaryResponse,
  ChatResponse,
  CreateSessionResponse,
  GenerateGuideRootResponse,
} from '@onboarding/shared';
import { FileLogService } from '../server/logService';
import { resetServerServicesForTests } from '../server/services';

void test('Next API handlers create sessions, generate guides, chat, and expose logs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'onboarding-next-api-'));
  process.env.AUTH_DISABLED = 'true';
  delete process.env.DATABASE_URL;
  process.env.SESSION_STORE_PATH = join(directory, 'sessions.json');
  process.env.LOG_STORE_PATH = join(directory, 'events.jsonl');
  process.env.OPENAI_API_KEY = '';
  resetServerServicesForTests();

  const sessionsRoute = await import('./api/sessions/route');
  const guideRootRoute = await import('./api/sessions/[sessionId]/guide/root/route');
  const chatRoute = await import('./api/sessions/[sessionId]/chat/route');
  const logsRoute = await import('./api/logs/recent/route');
  const meRoute = await import('./api/auth/me/route');

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
  assert.match(chat.message.content, /onboarding/i);

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
  resetServerServicesForTests();

  const meRoute = await import('./api/auth/me/route');
  const response = await meRoute.GET(new NextRequest('http://localhost/api/auth/me'));

  assert.equal(response.status, 401);
  const body = (await response.json()) as { error: string; requestId?: string };
  assert.equal(body.error, 'Authentication required');
  assert.match(body.requestId ?? '', /.+/);
});

void test('no public registration routes exist', async () => {
  const { access } = await import('node:fs/promises');
  const missingPaths = [
    join(process.cwd(), 'src/app/register/page.tsx'),
    join(process.cwd(), 'src/app/api/auth/register/route.ts'),
  ];

  for (const path of missingPaths) {
    await assert.rejects(() => access(path));
  }
});

void test('admin APIs require admin role and manage activity logs and AI fees', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'onboarding-admin-api-'));
  process.env.AUTH_DISABLED = 'true';
  delete process.env.DATABASE_URL;
  process.env.SESSION_STORE_PATH = join(directory, 'sessions.json');
  process.env.LOG_STORE_PATH = join(directory, 'events.jsonl');
  process.env.ADMIN_AUDIT_STORE_PATH = join(directory, 'admin-audit.jsonl');
  process.env.AI_RATE_CARDS_STORE_PATH = join(directory, 'ai-rate-cards.json');
  process.env.AI_FEE_ADJUSTMENTS_STORE_PATH = join(directory, 'ai-fee-adjustments.jsonl');
  process.env.OPENAI_API_KEY = '';
  resetServerServicesForTests();

  const logs = new FileLogService(process.env.LOG_STORE_PATH);
  await logs.recordRequest({
    requestId: 'request-admin-1',
    method: 'POST',
    path: '/api/sessions/session-1/chat',
    statusCode: 200,
    durationMs: 12,
    userId: 'worker-1',
  });
  await logs.recordAiUsage({
    operation: 'chat',
    userId: 'worker-1',
    sessionId: 'session-1',
    usage: {
      model: 'gpt-test',
      inputTokens: 1_000,
      outputTokens: 500,
      totalTokens: 1_500,
    },
  });
  await logs.recordError({
    requestId: 'request-admin-error',
    method: 'GET',
    path: '/api/admin/failing',
    message: 'Admin test error',
    userId: 'worker-1',
  });

  const activityRoute = await import('./api/admin/activity/route');
  const exportRoute = await import('./api/admin/activity/export/route');
  const retentionRoute = await import('./api/admin/activity/retention/route');
  const ratesRoute = await import('./api/admin/ai-fees/rates/route');
  const adjustmentsRoute = await import('./api/admin/ai-fees/adjustments/route');
  const feesRoute = await import('./api/admin/ai-fees/summary/route');
  const recalculateRoute = await import('./api/admin/ai-fees/recalculate/route');
  const auditRoute = await import('./api/admin/audit/route');

  const deniedResponse = await activityRoute.GET(
    new NextRequest('http://localhost/api/admin/activity', {
      headers: { 'x-user-id': 'worker-1', 'x-user-role': 'user' },
    }),
  );
  assert.equal(deniedResponse.status, 403);

  const activityResponse = await activityRoute.GET(
    new NextRequest('http://localhost/api/admin/activity?eventType=ai_usage', {
      headers: adminHeaders(),
    }),
  );
  assert.equal(activityResponse.status, 200);
  const activity = (await activityResponse.json()) as AdminActivityResponse;
  assert.equal(activity.summary.aiRequestsTotal, 1);
  assert.equal(activity.events[0]?.usage?.totalTokens, 1_500);

  const rateResponse = await ratesRoute.POST(
    adminJsonRequest('http://localhost/api/admin/ai-fees/rates', {
      model: 'gpt-test',
      inputCostPer1MTokens: 2,
      outputCostPer1MTokens: 4,
      effectiveFrom: '2000-01-01T00:00:00.000Z',
    }),
  );
  assert.equal(rateResponse.status, 200);

  const feesResponse = await feesRoute.GET(
    new NextRequest('http://localhost/api/admin/ai-fees/summary', {
      headers: adminHeaders(),
    }),
  );
  assert.equal(feesResponse.status, 200);
  const fees = (await feesResponse.json()) as AiFeeSummaryResponse;
  assert.equal(fees.requests, 1);
  assert.equal(fees.estimatedFee, 0.004);

  const exportResponse = await exportRoute.POST(
    adminJsonRequest('http://localhost/api/admin/activity/export', {
      format: 'csv',
      query: { eventType: 'ai_usage' },
    }),
  );
  assert.equal(exportResponse.status, 200);
  assert.match(await exportResponse.text(), /gpt-test/);

  const retentionResponse = await retentionRoute.POST(
    adminJsonRequest('http://localhost/api/admin/activity/retention', {
      retentionDays: 90,
      reason: 'Policy test',
    }),
  );
  assert.equal(retentionResponse.status, 200);

  const recalculateResponse = await recalculateRoute.POST(
    adminJsonRequest('http://localhost/api/admin/ai-fees/recalculate', {
      query: {},
      reason: 'Rate correction test',
    }),
  );
  assert.equal(recalculateResponse.status, 200);

  const adjustmentResponse = await adjustmentsRoute.POST(
    adminJsonRequest('http://localhost/api/admin/ai-fees/adjustments', {
      usageEventId: activity.events[0]?.id,
      amount: -0.001,
      reason: 'Credit duplicate usage',
    }),
  );
  assert.equal(adjustmentResponse.status, 200);

  const deleteResponse = await activityRoute.DELETE(
    adminJsonRequest('http://localhost/api/admin/activity', {
      query: { eventType: 'error' },
      reason: 'Cleanup test errors',
    }),
  );
  assert.equal(deleteResponse.status, 200);
  assert.deepEqual(await deleteResponse.json(), { deletedCount: 1 });

  const auditResponse = await auditRoute.GET(
    new NextRequest('http://localhost/api/admin/audit?limit=10', {
      headers: adminHeaders(),
    }),
  );
  assert.equal(auditResponse.status, 200);
  const audit = (await auditResponse.json()) as AdminAuditResponse;
  assert.ok(audit.events.some((event) => event.action === 'ai_rate_card.create'));
  assert.ok(audit.events.some((event) => event.action === 'activity.export'));
  assert.ok(audit.events.some((event) => event.action === 'activity.retention.update'));
  assert.ok(audit.events.some((event) => event.action === 'ai_fees.recalculate'));
  assert.ok(audit.events.some((event) => event.action === 'ai_fee_adjustment.create'));
  assert.ok(audit.events.some((event) => event.action === 'activity.delete'));
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

function adminJsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...adminHeaders(),
    },
    body: JSON.stringify(body),
  });
}

function adminHeaders(): Record<string, string> {
  return {
    'x-user-id': 'admin-user',
    'x-user-role': 'admin',
  };
}
