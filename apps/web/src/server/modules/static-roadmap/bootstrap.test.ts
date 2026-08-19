import assert from 'node:assert/strict';
import test from 'node:test';
import { StaticRoadmapPrismaRepository } from './repository';
import type { StaticRoadmapConfig } from './types';

const config: StaticRoadmapConfig = {
  enabled: true,
  refreshClaimsEnabled: true,
  authoritativeSourceId: 'authoritative-source',
  embeddingProfileId: 'embedding-profile-v1',
  retrievalLimitPerQuery: 5,
  userSyncBatchSize: 50,
  maxRefreshAttempts: 5,
  maxUserSyncAttempts: 8,
  leaseMs: 120_000,
  retryBaseMs: 5_000,
  objectiveVersion: 'objective-v1',
  retrievalConfigVersion: 'retrieval-v1',
  retrievalQuerySetVersion: 'queries-v1',
  generatorSchemaVersion: 'schema-v1',
  promptVersion: 'prompt-v1',
  provider: 'openai',
  model: 'model-v1',
  decodingConfigVersion: 'decoding-v1',
};

void test('bootstrap waits safely while the authoritative source record is absent', async () => {
  const repository = repositoryWithSource(null);

  assert.deepEqual(await repository.bootstrap('stable-bootstrap-id'), {
    kind: 'waiting_for_source',
    reason: 'authoritative_source_missing',
  });
});

void test('bootstrap waits safely until the authoritative source version is published', async () => {
  const repository = repositoryWithSource({
    id: config.authoritativeSourceId,
    enabled: true,
    accessScope: 'all_users',
    currentVersionId: 'source-version-1',
    currentVersion: { status: 'staging' },
  });

  assert.deepEqual(await repository.bootstrap('stable-bootstrap-id'), {
    kind: 'waiting_for_source',
    reason: 'authoritative_source_not_published',
  });
});

void test('concurrent bootstrap uniqueness races reload the durable job as a duplicate', async () => {
  const database = {
    $transaction: async () => {
      throw { code: 'P2002' };
    },
    onboardingRoadmap: {
      findUnique: async () => ({ id: 'roadmap-1' }),
    },
    onboardingRoadmapRefreshJob: {
      findUnique: async () => ({
        id: 'job-1',
        refreshSequence: 7n,
        status: 'failed',
      }),
    },
  };
  const repository = new StaticRoadmapPrismaRepository(database as never, {} as never, config);

  assert.deepEqual(await repository.bootstrap('stable-bootstrap-id'), {
    kind: 'duplicate',
    jobId: 'job-1',
    refreshSequence: '7',
    jobStatus: 'failed',
  });
});

function repositoryWithSource(source: unknown): StaticRoadmapPrismaRepository {
  const transaction = {
    knowledgeSource: { findUnique: async () => source },
  };
  const database = {
    $transaction: async (operation: (input: unknown) => Promise<unknown>) => operation(transaction),
  };
  return new StaticRoadmapPrismaRepository(database as never, {} as never, config);
}
