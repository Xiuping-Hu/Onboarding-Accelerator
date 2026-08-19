import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { AppError } from '../../core/errors/appError';
import type { ControllerContext } from '../../core/http/controller';
import type { HttpResult } from '../../core/http/httpResult';
import {
  createStaticRoadmapController,
  type StaticRoadmapServiceContract,
} from './staticRoadmap.controller';

const taskId = '9f158f5e-5333-4dba-a4bd-0ea3f9700435';
const noticeId = '136a07cb-80a1-4fc9-94c4-512d94003398';

void test('static roadmap read is scoped to the authenticated owner', async () => {
  const calls: string[] = [];
  const view = {
    status: 'empty',
    message: 'Roadmap is being prepared from the latest knowledge base.',
    newestUnreadNotice: null,
    unreadNoticeCount: 0,
  } as const;
  const controller = createStaticRoadmapController(
    serviceStub({
      getForUser: async (ownerId) => {
        calls.push(ownerId);
        return view;
      },
    }),
  );

  const result = await controller.get(context('GET', undefined, {}, 'owner-a'));

  assert.deepEqual(calls, ['owner-a']);
  assert.deepEqual(jsonBody(result), view);
});

void test('task transition accepts only the personal-progress contract and maps replay state', async () => {
  const calls: unknown[] = [];
  const controller = createStaticRoadmapController(
    serviceStub({
      transitionTask: async (ownerId, receivedTaskId, input) => {
        calls.push({ ownerId, taskId: receivedTaskId, input });
        return {
          kind: 'replay',
          task: {
            taskInstanceId: receivedTaskId,
            canonicalItemId: 'canonical-task-a',
            stableKey: 'task-a',
            status: input.status,
            taskRevision: 4,
          },
          taskRevision: 4,
          stateRevision: 9,
        };
      },
    }),
  );
  const body = {
    status: 'completed' as const,
    expectedTaskRevision: 3,
    expectedStateRevision: 8,
    clientRequestId: 'complete-task-once',
  };

  const result = await controller.transitionTask(context('PATCH', body, { taskId }, 'owner-a'));

  assert.deepEqual(calls, [{ ownerId: 'owner-a', taskId, input: body }]);
  assert.deepEqual(jsonBody(result), {
    task: {
      taskInstanceId: taskId,
      canonicalItemId: 'canonical-task-a',
      stableKey: 'task-a',
      status: 'completed',
      taskRevision: 4,
    },
    taskRevision: 4,
    stateRevision: 9,
  });
});

void test('task transition rejects definition fields before calling the service', async () => {
  let calls = 0;
  const controller = createStaticRoadmapController(
    serviceStub({
      transitionTask: async () => {
        calls += 1;
        return { kind: 'not_found' };
      },
    }),
  );

  await assert.rejects(
    async () =>
      await controller.transitionTask(
        context(
          'PATCH',
          {
            status: 'completed',
            expectedTaskRevision: 3,
            expectedStateRevision: 8,
            clientRequestId: 'forbidden-definition-edit',
            title: 'A user-controlled title',
          },
          { taskId },
          'owner-a',
        ),
      ),
    ZodError,
  );
  assert.equal(calls, 0);
});

void test('task transition returns the latest owner-scoped view on revision conflict', async () => {
  const latest = {
    status: 'empty',
    message: 'Roadmap is being prepared from the latest knowledge base.',
    newestUnreadNotice: null,
    unreadNoticeCount: 0,
  } as const;
  const controller = createStaticRoadmapController(
    serviceStub({
      transitionTask: async () => ({ kind: 'conflict', latest }),
    }),
  );

  const result = await controller.transitionTask(
    context(
      'PATCH',
      {
        status: 'blocked',
        expectedTaskRevision: 1,
        expectedStateRevision: 2,
        clientRequestId: 'stale-update',
      },
      { taskId },
      'owner-a',
    ),
  );

  assert.equal(result.status, 409);
  assert.deepEqual(jsonBody(result), {
    error: 'Roadmap progress changed. Reload the latest state and try again.',
    latest,
  });
});

void test('cross-owner task and notice identifiers remain indistinguishable from missing IDs', async () => {
  const controller = createStaticRoadmapController(
    serviceStub({
      transitionTask: async () => ({ kind: 'not_found' }),
      acknowledgeNotice: async () => ({ kind: 'not_found' }),
    }),
  );

  await assert.rejects(
    async () =>
      await controller.transitionTask(
        context(
          'PATCH',
          {
            status: 'in_progress',
            expectedTaskRevision: 0,
            expectedStateRevision: 0,
            clientRequestId: 'unknown-task',
          },
          { taskId },
          'other-owner',
        ),
      ),
    (error: unknown) => error instanceof AppError && error.status === 404,
  );
  await assert.rejects(
    async () =>
      await controller.acknowledgeNotice(
        context('PATCH', { read: true }, { noticeId }, 'other-owner'),
      ),
    (error: unknown) => error instanceof AppError && error.status === 404,
  );
});

void test('notice acknowledgement requires strict read true and returns 204', async () => {
  const owners: string[] = [];
  const controller = createStaticRoadmapController(
    serviceStub({
      acknowledgeNotice: async (ownerId) => {
        owners.push(ownerId);
        return { kind: 'acknowledged' };
      },
    }),
  );

  const result = await controller.acknowledgeNotice(
    context('PATCH', { read: true }, { noticeId }, 'owner-a'),
  );
  assert.equal(result.kind, 'empty');
  assert.equal(result.status, 204);
  assert.deepEqual(owners, ['owner-a']);

  await assert.rejects(
    async () =>
      await controller.acknowledgeNotice(
        context('PATCH', { read: false }, { noticeId }, 'owner-a'),
      ),
    ZodError,
  );
  await assert.rejects(
    async () =>
      await controller.acknowledgeNotice(
        context('PATCH', { read: true, versionId: 'client-selected' }, { noticeId }, 'owner-a'),
      ),
    ZodError,
  );
  assert.deepEqual(owners, ['owner-a']);
});

void test('roadmap evidence is owner-scoped and rendered without exposing unsafe markup', async () => {
  const calls: unknown[] = [];
  const controller = createStaticRoadmapController(
    serviceStub({
      resolveEvidenceForUser: async (ownerId, evidenceId) => {
        calls.push({ ownerId, evidenceId });
        return { title: '<Policy>', excerpt: '<script>alert(1)</script>' };
      },
    }),
  );

  const result = await controller.openEvidence(
    context('GET', undefined, { evidenceId: 'snapshot:evidence:q0' }, 'owner-a'),
  );

  assert.deepEqual(calls, [{ ownerId: 'owner-a', evidenceId: 'snapshot:evidence:q0' }]);
  assert.equal(result.kind, 'text');
  if (result.kind !== 'text') return;
  assert.match(result.body, /&lt;Policy&gt;/);
  assert.doesNotMatch(result.body, /<script>/);
  assert.equal(result.headers?.['cache-control'], 'private, no-store');
});

function serviceStub(
  overrides: Partial<StaticRoadmapServiceContract> = {},
): StaticRoadmapServiceContract {
  return {
    getForUser: async () => ({
      status: 'empty',
      message: 'Roadmap is being prepared from the latest knowledge base.',
      newestUnreadNotice: null,
      unreadNoticeCount: 0,
    }),
    transitionTask: async () => ({ kind: 'not_found' }),
    acknowledgeNotice: async () => ({ kind: 'not_found' }),
    resolveEvidenceForUser: async () => null,
    ...overrides,
  };
}

function context(
  method: string,
  body?: unknown,
  params: Record<string, string> = {},
  ownerId = 'owner-a',
): ControllerContext {
  return {
    request: new NextRequest('http://localhost/api/onboarding', {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }),
    }),
    params,
    requestId: 'test-request',
    user: { id: ownerId },
  };
}

function jsonBody(result: HttpResult): object {
  assert.equal(result.kind, 'json');
  if (result.kind !== 'json') throw new Error('Expected a JSON result');
  return result.body;
}
