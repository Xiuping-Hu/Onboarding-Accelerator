import { randomUUID } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';
import type { ServerConfig } from '../../config';
import { embeddingProfileFor } from '../../embeddingProfile';
import type { PrismaTransaction } from '../../infrastructure/prisma/prismaTypes';
import { hashCanonical } from './canonical';
import { auditLegacyRoadmapIntegrity, parseLegacyPreflightContext } from './legacyPreflight';
import {
  DEFAULT_STATIC_ROADMAP_KEY,
  type EnqueueStaticRoadmapResult,
  type StaticRoadmapConfig,
  type StaticRoadmapInput,
} from './types';

export interface PublicationHookInput {
  sourceId: string;
  sourceVersionId: string;
  publicationEventId: string;
  ingestionRunId?: string;
  operatorRequestId?: string;
}

export function staticRoadmapConfigFromServerConfig(config: ServerConfig): StaticRoadmapConfig {
  return {
    enabled: config.staticRoadmapEnabled,
    refreshClaimsEnabled: config.staticRoadmapRefreshClaimsEnabled,
    authoritativeSourceId: config.staticRoadmapAuthoritativeSourceId,
    embeddingProfileId: config.embeddingProfile,
    retrievalLimitPerQuery: config.staticRoadmapRetrievalLimitPerQuery,
    userSyncBatchSize: config.staticRoadmapUserSyncBatchSize,
    maxRefreshAttempts: config.staticRoadmapMaxRefreshAttempts,
    maxUserSyncAttempts: config.staticRoadmapMaxUserSyncAttempts,
    leaseMs: config.staticRoadmapLeaseMs,
    retryBaseMs: config.staticRoadmapRetryBaseMs,
    objectiveVersion: config.staticRoadmapObjectiveVersion,
    retrievalConfigVersion: config.staticRoadmapRetrievalConfigVersion,
    retrievalQuerySetVersion: config.staticRoadmapRetrievalQuerySetVersion,
    generatorSchemaVersion: config.staticRoadmapGeneratorSchemaVersion,
    promptVersion: config.staticRoadmapPromptVersion,
    provider: config.aiProvider,
    model: config.aiProvider === 'deepseek' ? config.deepSeekModel : config.openAiModel,
    decodingConfigVersion: config.staticRoadmapDecodingConfigVersion,
  };
}

export function staticRoadmapPublicationConfigFromEnv(): StaticRoadmapConfig {
  const embeddingProvider = process.env.EMBEDDING_PROVIDER === 'local' ? 'local' : 'openai';
  const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';
  const provider = process.env.AI_PROVIDER === 'deepseek' ? 'deepseek' : 'openai';
  return {
    enabled: process.env.STATIC_ROADMAP_ENABLED === 'true',
    refreshClaimsEnabled: process.env.STATIC_ROADMAP_REFRESH_CLAIMS_ENABLED !== 'false',
    authoritativeSourceId:
      process.env.STATIC_ROADMAP_AUTHORITATIVE_SOURCE_ID?.trim() || 'tax-consulting-sharepoint',
    embeddingProfileId: embeddingProfileFor(
      embeddingProvider,
      embeddingModel,
      process.env.EMBEDDING_PROFILE,
    ),
    retrievalLimitPerQuery: positiveInteger(
      process.env.STATIC_ROADMAP_RETRIEVAL_LIMIT_PER_QUERY,
      5,
    ),
    userSyncBatchSize: positiveInteger(process.env.STATIC_ROADMAP_USER_SYNC_BATCH_SIZE, 50),
    maxRefreshAttempts: positiveInteger(process.env.STATIC_ROADMAP_MAX_REFRESH_ATTEMPTS, 5),
    maxUserSyncAttempts: positiveInteger(process.env.STATIC_ROADMAP_MAX_USER_SYNC_ATTEMPTS, 8),
    leaseMs: positiveInteger(process.env.STATIC_ROADMAP_LEASE_MS, 120_000),
    retryBaseMs: positiveInteger(process.env.STATIC_ROADMAP_RETRY_BASE_MS, 5_000),
    objectiveVersion:
      process.env.STATIC_ROADMAP_OBJECTIVE_VERSION?.trim() || 'global-onboarding-v1',
    retrievalConfigVersion:
      process.env.STATIC_ROADMAP_RETRIEVAL_CONFIG_VERSION?.trim() || 'snapshot-pgvector-v1',
    retrievalQuerySetVersion:
      process.env.STATIC_ROADMAP_RETRIEVAL_QUERY_SET_VERSION?.trim() || 'onboarding-queries-v1',
    generatorSchemaVersion:
      process.env.STATIC_ROADMAP_GENERATOR_SCHEMA_VERSION?.trim() || 'static-roadmap-v1',
    promptVersion: process.env.STATIC_ROADMAP_PROMPT_VERSION?.trim() || 'static-roadmap-prompt-v1',
    provider,
    model:
      provider === 'deepseek'
        ? (process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash')
        : (process.env.OPENAI_MODEL ?? 'gpt-4o-mini'),
    decodingConfigVersion:
      process.env.STATIC_ROADMAP_DECODING_CONFIG_VERSION?.trim() || 'provider-default-v1',
  };
}

export async function enqueueStaticRoadmapRefreshForPublication(
  transaction: PrismaTransaction,
  input: PublicationHookInput,
  config = staticRoadmapPublicationConfigFromEnv(),
): Promise<EnqueueStaticRoadmapResult> {
  if (!config.enabled || input.sourceId !== config.authoritativeSourceId) {
    return { kind: 'ignored' };
  }

  const source = await transaction.knowledgeSource.findUnique({
    where: { id: input.sourceId },
    select: {
      id: true,
      enabled: true,
      accessScope: true,
      currentVersionId: true,
      currentVersion: { select: { id: true, manifestHash: true, contentHash: true, status: true } },
    },
  });
  if (!source || source.currentVersionId !== input.sourceVersionId) {
    throw new Error(
      'The authoritative source publication pointer is not current in this transaction.',
    );
  }

  const root = await transaction.onboardingRoadmap.upsert({
    where: { key: DEFAULT_STATIC_ROADMAP_KEY },
    create: { id: randomUUID(), key: DEFAULT_STATIC_ROADMAP_KEY },
    update: {},
  });
  if (!source.enabled || source.accessScope !== 'all_users') {
    await suspendStaticRoadmapForSourceGovernance(transaction, {
      roadmapId: root.id,
      sourceId: source.id,
      enabled: source.enabled,
      accessScope: source.accessScope,
    });
    return { kind: 'ignored' };
  }
  if (source.currentVersion?.status !== 'published') {
    throw new Error('Only a published authoritative source version can enqueue a roadmap refresh.');
  }

  const duplicate = await transaction.onboardingRoadmapRefreshJob.findUnique({
    where: {
      roadmapId_publicationEventId: {
        roadmapId: root.id,
        publicationEventId: input.publicationEventId,
      },
    },
    select: { id: true, refreshSequence: true, status: true },
  });
  if (duplicate) {
    return {
      kind: 'duplicate',
      jobId: duplicate.id,
      refreshSequence: duplicate.refreshSequence.toString(),
      jobStatus: duplicate.status as Extract<
        EnqueueStaticRoadmapResult,
        { kind: 'duplicate' }
      >['jobStatus'],
    };
  }

  let legacyPreflight: {
    auditEventId: string;
    fingerprint: string;
    quarantinedOwnerIds: string[];
  } | null = null;
  if (!root.currentVersionId) {
    if (input.operatorRequestId) {
      legacyPreflight = await auditLegacyRoadmapIntegrity(transaction, {
        roadmapId: root.id,
        sourceId: source.id,
        publicationEventId: input.publicationEventId,
      });
    } else {
      const approvedPreflight = await transaction.onboardingRoadmapGovernanceEvent.findFirst({
        where: {
          roadmapId: root.id,
          sourceId: source.id,
          eventType: 'legacy_integrity_preflight_completed',
          decisionStatus: 'approved',
        },
        select: { id: true, details: true },
        orderBy: { createdAt: 'desc' },
      });
      legacyPreflight = approvedPreflight
        ? parseLegacyPreflightContext(approvedPreflight.id, approvedPreflight.details)
        : null;
      if (!legacyPreflight) {
        await transaction.onboardingRoadmapGovernanceEvent.create({
          data: {
            id: randomUUID(),
            roadmapId: root.id,
            sourceId: source.id,
            eventType: 'legacy_integrity_bootstrap_required',
            decisionStatus: 'pending',
            details: toJson({ publicationEventId: input.publicationEventId }),
          },
        });
        return { kind: 'ignored' };
      }
    }
  }

  const advanced = await transaction.onboardingRoadmap.update({
    where: { id: root.id },
    data: {
      latestRefreshSequence: { increment: 1 },
      updatedAt: new Date(),
    },
  });
  const enqueuedAt = new Date();
  await transaction.onboardingRoadmapRefreshJob.updateMany({
    where: {
      roadmapId: root.id,
      refreshSequence: { lt: advanced.latestRefreshSequence },
      status: { in: ['queued', 'retryable'] },
    },
    data: {
      status: 'stale',
      completedAt: enqueuedAt,
      errorCode: 'SUPERSEDED_BEFORE_CLAIM',
      errorMessage: 'A newer authoritative publication superseded this unstarted refresh.',
      updatedAt: enqueuedAt,
    },
  });
  const lineage = advanced.currentVersionId
    ? await transaction.onboardingJourneyVersion.findUnique({
        where: { id: advanced.currentVersionId },
        select: { id: true, contentHash: true },
      })
    : null;
  const manifestHash = source.currentVersion.manifestHash ?? source.currentVersion.contentHash;
  const descriptor: StaticRoadmapInput = {
    publicationEventId: input.publicationEventId,
    ingestionRunId: input.ingestionRunId ?? null,
    refreshSequence: advanced.latestRefreshSequence.toString(),
    sourceId: source.id,
    sourceVersionId: source.currentVersion.id,
    sourceManifestHash: manifestHash,
    accessScope: 'all_users',
    embeddingProfileId: config.embeddingProfileId,
    retrievalConfigVersion: config.retrievalConfigVersion,
    retrievalQuerySetVersion: config.retrievalQuerySetVersion,
    objectiveVersion: config.objectiveVersion,
    generatorSchemaVersion: config.generatorSchemaVersion,
    promptVersion: config.promptVersion,
    provider: config.provider,
    model: config.model,
    decodingConfigVersion: config.decodingConfigVersion,
    lineageBaseCanonicalVersionId: lineage?.id ?? null,
    lineageBaseContentHash: lineage?.contentHash ?? null,
    legacyPreflightAuditEventId: legacyPreflight?.auditEventId ?? null,
    legacyPreflightFingerprint: legacyPreflight?.fingerprint ?? null,
    legacyQuarantinedOwnerIds: legacyPreflight?.quarantinedOwnerIds ?? [],
  };
  const knowledgeSnapshotHash = hashCanonical({
    sourceId: descriptor.sourceId,
    sourceVersionId: descriptor.sourceVersionId,
    sourceManifestHash: descriptor.sourceManifestHash,
    accessScope: descriptor.accessScope,
    embeddingProfileId: descriptor.embeddingProfileId,
    retrievalConfigVersion: descriptor.retrievalConfigVersion,
  });
  const artifactKey = hashCanonical({
    knowledgeSnapshotHash,
    retrievalQuerySetVersion: descriptor.retrievalQuerySetVersion,
    objectiveVersion: descriptor.objectiveVersion,
    generatorSchemaVersion: descriptor.generatorSchemaVersion,
    promptVersion: descriptor.promptVersion,
    provider: descriptor.provider,
    model: descriptor.model,
    decodingConfigVersion: descriptor.decodingConfigVersion,
    lineageBaseCanonicalVersionId: descriptor.lineageBaseCanonicalVersionId,
    lineageBaseContentHash: descriptor.lineageBaseContentHash,
  });
  const job = await transaction.onboardingRoadmapRefreshJob.create({
    data: {
      id: randomUUID(),
      roadmapId: root.id,
      publicationEventId: input.publicationEventId,
      operatorRequestId: input.operatorRequestId,
      refreshSequence: advanced.latestRefreshSequence,
      sourceId: descriptor.sourceId,
      sourceVersionId: descriptor.sourceVersionId,
      sourceManifestHash: descriptor.sourceManifestHash,
      accessScope: descriptor.accessScope,
      embeddingProfileId: descriptor.embeddingProfileId,
      retrievalConfigVersion: descriptor.retrievalConfigVersion,
      retrievalQuerySetVersion: descriptor.retrievalQuerySetVersion,
      objectiveVersion: descriptor.objectiveVersion,
      generatorSchemaVersion: descriptor.generatorSchemaVersion,
      promptVersion: descriptor.promptVersion,
      provider: descriptor.provider,
      model: descriptor.model,
      decodingConfigVersion: descriptor.decodingConfigVersion,
      lineageBaseVersionId: descriptor.lineageBaseCanonicalVersionId,
      lineageBaseContentHash: descriptor.lineageBaseContentHash,
      knowledgeSnapshotHash,
      artifactKey,
      inputDescriptor: toJson(descriptor),
    },
  });
  return {
    kind: 'enqueued',
    jobId: job.id,
    refreshSequence: job.refreshSequence.toString(),
  };
}

export async function suspendStaticRoadmapForSourceGovernance(
  transaction: PrismaTransaction,
  input: { roadmapId: string; sourceId: string; enabled: boolean; accessScope: string },
): Promise<void> {
  const now = new Date();
  const reason = !input.enabled
    ? 'authoritative_source_disabled'
    : `authoritative_source_scope_${input.accessScope}`;
  const current = await transaction.onboardingRoadmap.findUnique({
    where: { id: input.roadmapId },
    select: { suspendedAt: true, suspensionReason: true, latestRefreshSequence: true },
  });
  if (current?.suspendedAt && current.suspensionReason === reason) {
    const unfenced = await transaction.onboardingRoadmapRefreshJob.findFirst({
      where: {
        roadmapId: input.roadmapId,
        refreshSequence: { gte: current.latestRefreshSequence },
        status: { in: ['queued', 'running', 'retryable'] },
      },
      select: { id: true },
    });
    if (!unfenced) return;
  }
  const fenced = await transaction.onboardingRoadmap.update({
    where: { id: input.roadmapId },
    data: {
      suspendedAt: now,
      suspensionReason: reason,
      latestRefreshSequence: { increment: 1 },
      updatedAt: now,
    },
  });
  await transaction.onboardingRoadmapRefreshJob.updateMany({
    where: {
      roadmapId: input.roadmapId,
      refreshSequence: { lt: fenced.latestRefreshSequence },
      status: { in: ['queued', 'retryable'] },
    },
    data: {
      status: 'stale',
      completedAt: now,
      errorCode: 'SOURCE_GOVERNANCE_SUSPENDED',
      errorMessage: 'Source governance suspended this pre-existing refresh occurrence.',
      updatedAt: now,
    },
  });
  await transaction.onboardingRoadmapGovernanceEvent.create({
    data: {
      id: randomUUID(),
      roadmapId: input.roadmapId,
      sourceId: input.sourceId,
      eventType: 'derivation_suspended',
      details: toJson({
        enabled: input.enabled,
        accessScope: input.accessScope,
        reason,
        refreshFence: fenced.latestRefreshSequence.toString(),
      }),
    },
  });
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? String(fallback), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
