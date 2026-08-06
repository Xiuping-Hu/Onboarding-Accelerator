import assert from 'node:assert/strict';
import test from 'node:test';
import type { RagRuntime } from './runtime';
import { authorizeVercelCron, runVercelCronHeartbeat } from './vercelCron';

void test('Vercel cron authorization requires an exact bearer secret', () => {
  const authorized = new Request('https://example.com/api/internal/rag/cron', {
    headers: { Authorization: 'Bearer correct-secret' },
  });
  const unauthorized = new Request('https://example.com/api/internal/rag/cron', {
    headers: { Authorization: 'Bearer incorrect-secret' },
  });

  assert.equal(authorizeVercelCron(authorized, undefined), 'missing_secret');
  assert.equal(authorizeVercelCron(unauthorized, 'correct-secret'), 'unauthorized');
  assert.equal(authorizeVercelCron(authorized, 'correct-secret'), 'authorized');
});

void test('Vercel cron heartbeat dispatches before processing one queued run', async () => {
  const calls: string[] = [];
  const runtime = {} as Pick<RagRuntime, 'database' | 'service'>;
  const result = await runVercelCronHeartbeat(runtime, {
    dispatch: async () => {
      calls.push('dispatch');
      return { dispatched: 2, duplicate: 1 };
    },
    processNext: async (_runtime, options) => {
      calls.push('process');
      assert.match(options.workerId, /^vercel:/);
      assert.equal(options.leaseSeconds, 360);
      return {
        processed: true,
        runId: 'run-1',
        sourceId: 'source-1',
        attempt: 1,
        status: 'indexed',
        chunkCount: 4,
      };
    },
  });

  assert.deepEqual(calls, ['dispatch', 'process']);
  assert.deepEqual(result.dispatch, { dispatched: 2, duplicate: 1 });
  assert.equal(result.worker.processed, true);
});
