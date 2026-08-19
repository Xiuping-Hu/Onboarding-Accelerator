import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { retiredOnboardingRoute } from './retiredOnboarding.controller';

void test('retired onboarding routes return a side-effect-free Gone response', async () => {
  const result = await retiredOnboardingRoute({
    request: new NextRequest('http://localhost/api/sessions/session-a/onboarding', {
      method: 'POST',
      body: 'not-json-and-never-parsed',
    }),
    params: { sessionId: 'session-a' },
    requestId: 'test-request',
    user: { id: 'owner-a' },
  });

  assert.equal(result.status, 410);
  assert.equal(result.kind, 'json');
  assert.equal(result.headers?.['cache-control'], 'no-store');
  if (result.kind !== 'json') return;
  assert.deepEqual(result.body, {
    error:
      'This session-scoped roadmap endpoint is gone. Roadmaps now update from the knowledge base.',
  });
});
