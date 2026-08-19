import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  TransitionOnboardingTaskResponse,
  WorkspaceOnboardingState,
} from '@onboarding/shared';
import { acknowledgeRoadmapNotice, getOnboardingState, transitionOnboardingTask } from './api';

void test('onboarding browser calls are user-scoped and send strict task/notice bodies', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ body: unknown; method: string; path: string }> = [];
  const empty: WorkspaceOnboardingState = {
    status: 'empty',
    message: 'Roadmap is being prepared from the latest knowledge base.',
    newestUnreadNotice: null,
    unreadNoticeCount: 0,
  };
  const transition: TransitionOnboardingTaskResponse = {
    task: {
      taskInstanceId: 'task-1',
      canonicalItemId: 'canonical-task-1',
      stableKey: 'meet-team',
      status: 'completed',
      taskRevision: 3,
    },
    taskRevision: 3,
    stateRevision: 8,
  };

  globalThis.fetch = (async (input, init) => {
    const path = input instanceof Request ? new URL(input.url).pathname : String(input);
    const method = init?.method ?? 'GET';
    requests.push({
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
      method,
      path,
    });
    if (path === '/api/onboarding') return jsonResponse(empty);
    if (path === '/api/onboarding/tasks/task-1') return jsonResponse(transition);
    if (path === '/api/onboarding/notices/notice-1') return new Response(null, { status: 204 });
    return jsonResponse({ error: 'not found' }, 404);
  }) as typeof fetch;

  try {
    assert.deepEqual(await getOnboardingState(), empty);
    assert.deepEqual(
      await transitionOnboardingTask('task-1', {
        status: 'completed',
        expectedTaskRevision: 2,
        expectedStateRevision: 7,
        clientRequestId: 'request-1',
      }),
      transition,
    );
    await acknowledgeRoadmapNotice('notice-1');
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requests, [
    { body: null, method: 'GET', path: '/api/onboarding' },
    {
      body: {
        status: 'completed',
        expectedTaskRevision: 2,
        expectedStateRevision: 7,
        clientRequestId: 'request-1',
      },
      method: 'PATCH',
      path: '/api/onboarding/tasks/task-1',
    },
    {
      body: { read: true },
      method: 'PATCH',
      path: '/api/onboarding/notices/notice-1',
    },
  ]);
});

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
