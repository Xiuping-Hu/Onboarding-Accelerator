import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { FileLogService } from './logService';

void test('file log service summarizes requests, errors, and AI token usage', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'onboarding-logs-'));
  const storePath = join(directory, 'events.jsonl');

  try {
    const logs = new FileLogService(storePath);
    await logs.recordRequest({
      requestId: 'request-1',
      method: 'POST',
      path: '/api/sessions/session-1/chat',
      statusCode: 200,
      durationMs: 42,
      userId: 'owner-a',
    });
    await logs.recordError({
      requestId: 'request-2',
      method: 'GET',
      path: '/api/failing',
      message: 'Failure',
      userId: 'owner-a',
    });
    await logs.recordAiUsage({
      operation: 'chat',
      userId: 'owner-a',
      sessionId: 'session-1',
      usage: {
        model: 'test-model',
        inputTokens: 1_000,
        outputTokens: 500,
        totalTokens: 1_500,
      },
    });
    await logs.recordAiUsage({
      operation: 'ask',
      userId: 'owner-a',
      usage: {
        model: 'test-model',
        inputTokens: 500,
        outputTokens: 250,
        totalTokens: 750,
      },
    });

    const summary = await logs.summarize();

    assert.equal(summary.eventsTotal, 4);
    assert.equal(summary.requestsTotal, 1);
    assert.equal(summary.errorsTotal, 1);
    assert.equal(summary.aiUsage.requests, 2);
    assert.equal(summary.aiUsage.inputTokens, 1_500);
    assert.equal(summary.aiUsage.outputTokens, 750);
    assert.equal(summary.aiUsage.totalTokens, 2_250);
    assert.equal(summary.aiUsage.byModel['test-model']?.requests, 2);

    const recent = await logs.listRecent(2);

    assert.deepEqual(
      recent.events.map((event) => event.type),
      ['ai_usage', 'ai_usage'],
    );
    assert.equal(recent.events[0]?.usage?.totalTokens, 750);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
