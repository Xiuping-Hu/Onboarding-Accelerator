import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaTransaction } from '../../infrastructure/prisma/prismaTypes';
import { enqueueStaticRoadmapRefreshForPublication } from './publicationHook';
import type { StaticRoadmapConfig, StaticRoadmapInput } from './types';

const sourceId = 'authoritative-source';
const sourceVersionId = '11111111-1111-4111-8111-111111111111';
const validOwner = '22222222-2222-4222-8222-222222222222';
const quarantinedOwner = '33333333-3333-4333-8333-333333333333';

const config: StaticRoadmapConfig = {
  enabled: true,
  refreshClaimsEnabled: true,
  authoritativeSourceId: sourceId,
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

void test('mixed legacy anomalies remain auditable while canonical v1 refresh is enqueued', async () => {
  let createdJob: { inputDescriptor: unknown } | undefined;
  const transaction = {
    knowledgeSource: {
      findUnique: async () => ({
        id: sourceId,
        enabled: true,
        accessScope: 'all_users',
        currentVersionId: sourceVersionId,
        currentVersion: {
          id: sourceVersionId,
          manifestHash: 'manifest-v1',
          contentHash: 'content-v1',
          status: 'published',
        },
      }),
    },
    onboardingRoadmap: {
      upsert: async () => ({
        id: '44444444-4444-4444-8444-444444444444',
        currentVersionId: null,
      }),
      update: async () => ({ latestRefreshSequence: 1n, currentVersionId: null }),
    },
    onboardingRoadmapRefreshJob: {
      findUnique: async () => null,
      updateMany: async () => ({ count: 0 }),
      create: async ({ data }: { data: { inputDescriptor: unknown } }) => {
        createdJob = data;
        return { id: '55555555-5555-4555-8555-555555555555', refreshSequence: 1n };
      },
    },
    onboardingRoadmapGovernanceEvent: {
      findFirst: async () => ({
        id: '66666666-6666-4666-8666-666666666666',
        details: {
          schemaVersion: 'legacy-roadmap-preflight-v1',
          fingerprint: 'full-preservation-fingerprint',
          collectionFingerprints: {
            journeyVersions: 'a',
            plans: 'b',
            taskInstances: 'c',
            taskEvents: 'd',
            revisionEvents: 'e',
            proposals: 'f',
          },
          counts: {
            journeyVersions: 1,
            plans: 2,
            activePlans: 2,
            taskInstances: 2,
            taskEvents: 0,
            revisionEvents: 0,
            proposals: 0,
          },
          errors: {
            duplicateActivePlans: [],
            duplicateActiveStableKeys: [],
            invalidOwners: [
              {
                ownerId: quarantinedOwner,
                planIds: ['invalid-plan'],
                reason: 'inactive_user',
              },
            ],
            invalidTaskStatuses: [],
          },
          quarantinedOwnerIds: [quarantinedOwner],
          canonicalV1MayProceed: true,
          passed: false,
        },
      }),
    },
  } as unknown as PrismaTransaction;

  const result = await enqueueStaticRoadmapRefreshForPublication(
    transaction,
    {
      sourceId,
      sourceVersionId,
      publicationEventId: 'publication-with-mixed-legacy-data',
      ingestionRunId: 'ingestion-1',
    },
    config,
  );

  assert.equal(result.kind, 'enqueued');
  assert.ok(createdJob);
  const descriptor = createdJob.inputDescriptor as StaticRoadmapInput;
  assert.equal(descriptor.legacyPreflightFingerprint, 'full-preservation-fingerprint');
  assert.deepEqual(descriptor.legacyQuarantinedOwnerIds, [quarantinedOwner]);
  assert.equal(descriptor.legacyQuarantinedOwnerIds.includes(validOwner), false);
});
