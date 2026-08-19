import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { createStaticRoadmapCronController } from './staticRoadmapCron.controller';

const secret = 'cron-secret';
const bootstrapRequestId = 'bootstrap-2026-08-16';
const noRefresh = { processed: false } as const;
const noUserSyncs = {
  processed: 0,
  applied: 0,
  retryable: 0,
  failed: 0,
  superseded: 0,
} as const;

void test('cron omits bootstrap work when the temporary request ID is absent', async () => {
  const calls: string[] = [];
  const controller = createStaticRoadmapCronController({
    enabled: true,
    secret,
    service: {
      async bootstrap() {
        throw new Error('bootstrap must not run');
      },
      async processNextRefresh() {
        calls.push('refresh');
        return noRefresh;
      },
      async processUserSyncs() {
        calls.push('sync');
        return noUserSyncs;
      },
    },
  });

  const result = await controller.run(context());

  assert.equal(result.status, 200);
  assert.deepEqual(calls, ['refresh', 'sync']);
  assert.equal(result.kind, 'json');
  assert.deepEqual((result.body as { bootstrap: unknown }).bootstrap, {
    kind: 'not_configured',
  });
});

void test('cron retries a waiting bootstrap before running both workers', async () => {
  const calls: string[] = [];
  const requestIds: string[] = [];
  const controller = createStaticRoadmapCronController({
    enabled: true,
    secret,
    bootstrapRequestId,
    service: {
      async bootstrap(input) {
        calls.push('bootstrap');
        requestIds.push(typeof input === 'string' ? input : input.requestId);
        return {
          kind: 'waiting_for_source',
          reason: 'authoritative_source_not_published',
        } as const;
      },
      async processNextRefresh() {
        calls.push('refresh');
        return noRefresh;
      },
      async processUserSyncs() {
        calls.push('sync');
        return noUserSyncs;
      },
    },
  });

  const result = await controller.run(context());

  assert.equal(result.status, 200);
  assert.deepEqual(calls, ['bootstrap', 'refresh', 'sync']);
  assert.deepEqual(requestIds, [bootstrapRequestId]);
  assert.equal(result.kind, 'json');
  assert.deepEqual((result.body as { bootstrap: unknown }).bootstrap, {
    kind: 'waiting_for_source',
    reason: 'authoritative_source_not_published',
  });
});

void test('repeated cron invocations pass the same durable bootstrap idempotency key', async () => {
  const requestIds: string[] = [];
  let invocation = 0;
  const controller = createStaticRoadmapCronController({
    enabled: true,
    secret,
    bootstrapRequestId,
    service: {
      async bootstrap(input) {
        requestIds.push(typeof input === 'string' ? input : input.requestId);
        invocation += 1;
        return invocation === 1
          ? ({ kind: 'enqueued', jobId: 'job-1', refreshSequence: '1' } as const)
          : ({
              kind: 'duplicate',
              jobId: 'job-1',
              refreshSequence: '1',
              jobStatus: 'queued',
            } as const);
      },
      async processNextRefresh() {
        return noRefresh;
      },
      async processUserSyncs() {
        return noUserSyncs;
      },
    },
  });

  const first = await controller.run(context());
  const second = await controller.run(context());

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(requestIds, [bootstrapRequestId, bootstrapRequestId]);
  assert.equal(first.kind, 'json');
  assert.equal(second.kind, 'json');
  assert.deepEqual((first.body as { bootstrap: unknown }).bootstrap, {
    kind: 'enqueued',
    jobId: 'job-1',
    refreshSequence: '1',
  });
  assert.deepEqual((second.body as { bootstrap: unknown }).bootstrap, {
    kind: 'duplicate',
    jobId: 'job-1',
    refreshSequence: '1',
    jobStatus: 'queued',
  });
});

void test('hard bootstrap failures remain observable without starving either worker or leaking the ID', async () => {
  const calls: string[] = [];
  const logs: string[] = [];
  const originalInfo = console.info;
  const originalError = console.error;
  console.info = (...values: unknown[]) => logs.push(values.map(String).join(' '));
  console.error = (...values: unknown[]) => logs.push(values.map(String).join(' '));
  try {
    const controller = createStaticRoadmapCronController({
      enabled: true,
      secret,
      bootstrapRequestId,
      service: {
        async bootstrap() {
          calls.push('bootstrap');
          throw new Error(`failure for ${bootstrapRequestId}`);
        },
        async processNextRefresh() {
          calls.push('refresh');
          return noRefresh;
        },
        async processUserSyncs() {
          calls.push('sync');
          return noUserSyncs;
        },
      },
    });

    const result = await controller.run(context());

    assert.equal(result.status, 500);
    assert.deepEqual(calls, ['bootstrap', 'refresh', 'sync']);
    assert.equal(result.kind, 'json');
    assert.deepEqual((result.body as { bootstrap: unknown }).bootstrap, {
      kind: 'failed',
      error: 'Static roadmap bootstrap failed.',
    });
    assert.doesNotMatch(JSON.stringify(result), new RegExp(bootstrapRequestId));
    assert.doesNotMatch(logs.join('\n'), new RegExp(bootstrapRequestId));
  } finally {
    console.info = originalInfo;
    console.error = originalError;
  }
});

void test('cron authorization rejects callers before bootstrap or worker execution', async () => {
  let called = false;
  const controller = createStaticRoadmapCronController({
    enabled: true,
    secret,
    bootstrapRequestId,
    service: {
      async bootstrap() {
        called = true;
        return { kind: 'ignored' } as const;
      },
      async processNextRefresh() {
        called = true;
        return noRefresh;
      },
      async processUserSyncs() {
        called = true;
        return noUserSyncs;
      },
    },
  });

  const result = await controller.run(
    context(new NextRequest('https://example.com/api/internal/static-roadmap/cron')),
  );

  assert.equal(result.status, 401);
  assert.equal(called, false);
});

function context(request = authorizedRequest()) {
  return { request, params: {}, requestId: 'request-1' };
}

function authorizedRequest(): NextRequest {
  return new NextRequest('https://example.com/api/internal/static-roadmap/cron', {
    headers: { authorization: `Bearer ${secret}` },
  });
}
