import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { DisabledStaticRoadmapService, StaticRoadmapService } from './service';

void test('disabled static roadmap service preserves the exact no-database API contract', async () => {
  const service = new DisabledStaticRoadmapService();
  assert.deepEqual(await service.getForUser('owner'), {
    status: 'empty',
    message: 'Roadmap is being prepared from the latest knowledge base.',
    newestUnreadNotice: null,
    unreadNoticeCount: 0,
  });
  assert.deepEqual(
    await service.transitionTask('owner', 'task', {
      status: 'completed',
      expectedTaskRevision: 0,
      expectedStateRevision: 0,
      clientRequestId: 'request',
    }),
    { kind: 'not_found' },
  );
  assert.deepEqual(await service.acknowledgeNotice('owner', 'notice'), {
    kind: 'not_found',
  });
  assert.equal(await service.resolveEvidenceForUser('owner', 'evidence'), null);
});

void test('database service safely ignores non-UUID development identities', async () => {
  const service = new StaticRoadmapService(
    {
      getForUser() {
        throw new Error('Repository must not receive a non-UUID owner.');
      },
    } as never,
    {} as never,
  );

  assert.deepEqual(await service.getForUser('local-dev-user'), {
    status: 'empty',
    message: 'Roadmap is being prepared from the latest knowledge base.',
    newestUnreadNotice: null,
    unreadNoticeCount: 0,
  });
  assert.deepEqual(
    await service.transitionTask('local-dev-user', randomUUID(), {
      status: 'completed',
      expectedTaskRevision: 0,
      expectedStateRevision: 0,
      clientRequestId: 'request',
    }),
    { kind: 'not_found' },
  );
  assert.deepEqual(await service.acknowledgeNotice('local-dev-user', randomUUID()), {
    kind: 'not_found',
  });
  assert.equal(await service.resolveEvidenceForUser('local-dev-user', 'evidence'), null);
});
