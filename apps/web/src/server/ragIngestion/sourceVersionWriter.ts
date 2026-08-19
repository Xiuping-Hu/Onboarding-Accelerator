import { randomUUID } from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';
import type { PrismaDatabase } from '../infrastructure/prisma/prismaTypes';
import { enqueueStaticRoadmapRefreshForPublication } from '../modules/static-roadmap/publicationHook';
import {
  staticRoadmapPublicationConfigFromEnv,
  suspendStaticRoadmapForSourceGovernance,
} from '../modules/static-roadmap/publicationHook';
import { chunkerVersion } from './chunker';
import { defaultConnectorKind } from './sourceRegistry';
import type {
  CanonicalManifest,
  IngestionDocument,
  IngestionSource,
  PreviousSourceDocument,
} from './types';

export interface CurrentSourceState {
  sourceVersionId?: string;
  manifestHash?: string;
  documentCount: number;
  characterCount: number;
  documents: PreviousSourceDocument[];
}

export async function ensureKnowledgeSource(
  db: PrismaDatabase,
  source: IngestionSource,
): Promise<void> {
  if ('$transaction' in db) {
    await db.$transaction((transaction) => ensureKnowledgeSourceRecord(transaction, source));
    return;
  }
  await ensureKnowledgeSourceRecord(db, source);
}

async function ensureKnowledgeSourceRecord(
  db: Prisma.TransactionClient,
  source: IngestionSource,
): Promise<void> {
  const connectorConfig = jsonValue({
    legacyKind: source.kind,
    path: source.path,
    reviewed: source.reviewed,
    metadata: source.metadata,
    sharepoint: source.sharepoint,
    website: source.website,
    validation: source.validation,
  });
  const stored = await db.knowledgeSource.upsert({
    where: { id: source.id },
    create: {
      id: source.id,
      uri: source.uri,
      title: source.title ?? source.id,
      owner: source.owner,
      accessScope: source.accessScope,
      refreshCadence: source.refreshCadence ?? 'manual',
      connectorKind: source.connectorKind ?? defaultConnectorKind(source.kind),
      connectorConfig,
      allowedContentTypes: jsonValue(source.allowedContentTypes ?? []),
      allowedTriggers: jsonValue(source.allowedTriggers ?? ['manual']),
      credentialRef: source.credentialRef,
      publicationPolicy: source.publicationPolicy ?? 'auto_after_validation',
      enabled: source.enabled !== false,
      validationConfig: jsonValue(source.validation ?? {}),
    },
    update: {
      uri: source.uri,
      title: source.title ?? source.id,
      owner: source.owner,
      accessScope: source.accessScope,
      refreshCadence: source.refreshCadence ?? 'manual',
      connectorKind: source.connectorKind ?? defaultConnectorKind(source.kind),
      connectorConfig,
      allowedContentTypes: jsonValue(source.allowedContentTypes ?? []),
      allowedTriggers: jsonValue(source.allowedTriggers ?? ['manual']),
      credentialRef: source.credentialRef,
      publicationPolicy: source.publicationPolicy ?? 'auto_after_validation',
      enabled: source.enabled !== false,
      validationConfig: jsonValue(source.validation ?? {}),
      updatedAt: new Date(),
    },
  });
  const roadmapConfig = staticRoadmapPublicationConfigFromEnv();
  if (
    roadmapConfig.enabled &&
    stored.id === roadmapConfig.authoritativeSourceId &&
    (!stored.enabled || stored.accessScope !== 'all_users')
  ) {
    const root = await db.onboardingRoadmap.upsert({
      where: { key: 'default' },
      create: { id: randomUUID(), key: 'default' },
      update: {},
    });
    await suspendStaticRoadmapForSourceGovernance(db, {
      roadmapId: root.id,
      sourceId: stored.id,
      enabled: stored.enabled,
      accessScope: stored.accessScope,
    });
  }
}

export async function loadCurrentSourceState(
  db: PrismaDatabase,
  sourceId: string,
): Promise<CurrentSourceState> {
  const source = await db.knowledgeSource.findUnique({
    where: { id: sourceId },
    select: {
      currentVersionId: true,
      currentVersion: {
        select: {
          manifestHash: true,
          contentHash: true,
          documents: {
            select: {
              documentKey: true,
              canonicalUri: true,
              contentHash: true,
              etag: true,
              upstreamUpdatedAt: true,
              content: true,
            },
          },
        },
      },
    },
  });
  const documents = source?.currentVersion?.documents ?? [];
  return {
    sourceVersionId: source?.currentVersionId ?? undefined,
    manifestHash:
      source?.currentVersion?.manifestHash ?? source?.currentVersion?.contentHash ?? undefined,
    documentCount: documents.length,
    characterCount: documents.reduce((total, document) => total + document.content.length, 0),
    documents: documents.map((document) => ({
      documentKey: document.documentKey,
      canonicalUri: document.canonicalUri,
      contentHash: document.contentHash,
      etag: document.etag ?? undefined,
      upstreamUpdatedAt: document.upstreamUpdatedAt?.toISOString(),
    })),
  };
}

export async function stageSourceVersion(
  db: PrismaDatabase,
  source: IngestionSource,
  manifest: CanonicalManifest,
  producingRunId?: string,
): Promise<string> {
  await ensureKnowledgeSource(db, source);
  const versionId = randomUUID();
  await db.knowledgeSourceVersion.create({
    data: {
      id: versionId,
      sourceId: source.id,
      contentHash: manifest.hash,
      manifestHash: manifest.hash,
      status: 'candidate',
      producingRunId,
      connectorVersion: `${source.connectorKind ?? defaultConnectorKind(source.kind)}-v1`,
      extractorVersion: 'registry-v1',
      sanitizerVersion: 'deterministic-v1',
      chunkerVersion,
      upstreamUpdatedAt: new Date(latestUpdatedAt(manifest.documents)),
      metadata: jsonValue({
        documentCount: manifest.documentCount,
        characterCount: manifest.characterCount,
        sourceKind: source.kind,
      }),
      documents: {
        create: manifest.documents.map((document) => ({
          documentKey: document.documentKey ?? document.source.id,
          canonicalUri: document.canonicalUri ?? document.source.uri,
          title: document.title,
          mediaType: document.mediaType ?? 'text/plain',
          contentHash: document.contentHash ?? '',
          content: document.text,
          upstreamUpdatedAt: new Date(document.updatedAt),
          etag: document.etag,
          accessScope: source.accessScope,
          metadata: jsonValue(document.metadata ?? {}),
        })),
      },
    },
  });
  return versionId;
}

export async function publishSourceVersion(
  db: PrismaDatabase,
  sourceId: string,
  sourceVersionId: string,
  validationSummary: Record<string, unknown>,
  runId?: string,
): Promise<void> {
  const now = new Date();
  // A retried publish for the same durable ingestion occurrence must replay the same outbox row.
  // Rollback creates a fresh synthetic run, while direct/operator publications supply their own
  // occurrence identity or intentionally receive a new one.
  const publicationEventId = runId
    ? `ingestion:${runId}:${sourceVersionId}`
    : `publication:${randomUUID()}`;
  await db.$transaction(async (transaction) => {
    await transaction.knowledgeSourceVersion.updateMany({
      where: { sourceId, id: { not: sourceVersionId }, status: 'published' },
      data: { status: 'superseded' },
    });
    const published = await transaction.knowledgeSourceVersion.updateMany({
      where: { id: sourceVersionId, sourceId },
      data: {
        status: 'published',
        publishedAt: now,
        rejectedAt: null,
        validationSummary: jsonValue(validationSummary),
      },
    });
    if (published.count !== 1) {
      throw new Error(`Source version ${sourceVersionId} does not belong to source ${sourceId}.`);
    }
    await transaction.knowledgeSource.update({
      where: { id: sourceId },
      data: { currentVersionId: sourceVersionId, lastSuccessfulRunAt: now, updatedAt: now },
    });
    await enqueueStaticRoadmapRefreshForPublication(transaction, {
      sourceId,
      sourceVersionId,
      publicationEventId,
      ingestionRunId: runId,
    });
    if (runId) {
      await transaction.ingestionRun.update({
        where: { id: runId },
        data: {
          status: 'succeeded',
          candidateVersionId: sourceVersionId,
          validationSummary: jsonValue(validationSummary),
          completedAt: now,
          leaseExpiresAt: null,
          heartbeatAt: now,
          updatedAt: now,
        },
      });
      await transaction.ingestionRunEvent.create({
        data: {
          runId,
          eventType: 'version_published',
          outputHash: sourceVersionId,
          metadata: jsonValue({ ...validationSummary, publicationEventId }),
        },
      });
    }
  });
}

export async function holdSourceVersionForReview(
  db: PrismaDatabase,
  sourceVersionId: string,
  validationSummary: Record<string, unknown>,
  runId?: string,
): Promise<void> {
  const now = new Date();
  await db.knowledgeSourceVersion.update({
    where: { id: sourceVersionId },
    data: { status: 'candidate', validationSummary: jsonValue(validationSummary) },
  });
  if (runId) {
    await db.ingestionRun.update({
      where: { id: runId },
      data: {
        status: 'requires_review',
        candidateVersionId: sourceVersionId,
        validationSummary: jsonValue(validationSummary),
        completedAt: now,
        leaseExpiresAt: null,
        updatedAt: now,
      },
    });
    await db.ingestionRunEvent.create({
      data: {
        runId,
        eventType: 'review_required',
        outputHash: sourceVersionId,
        metadata: jsonValue(validationSummary),
      },
    });
  }
}

export async function rejectSourceVersion(
  db: PrismaDatabase,
  sourceVersionId: string,
  validationSummary: Record<string, unknown>,
): Promise<void> {
  await db.knowledgeSourceVersion.update({
    where: { id: sourceVersionId },
    data: {
      status: 'rejected',
      rejectedAt: new Date(),
      validationSummary: jsonValue(validationSummary),
    },
  });
}

export async function reviewSourceVersion(
  db: PrismaDatabase,
  input: { runId: string; approve: boolean; reviewedBy: string },
): Promise<void> {
  const run = await db.ingestionRun.findUnique({
    where: { id: input.runId },
    select: {
      id: true,
      sourceId: true,
      status: true,
      candidateVersionId: true,
      validationSummary: true,
    },
  });
  if (!run || run.status !== 'requires_review' || !run.candidateVersionId) {
    throw new Error(`Ingestion run ${input.runId} does not have a reviewable candidate.`);
  }
  const summary = {
    ...record(run.validationSummary),
    reviewedBy: input.reviewedBy,
    reviewDecision: input.approve ? 'approved' : 'rejected',
    reviewedAt: new Date().toISOString(),
  };
  if (input.approve) {
    await publishSourceVersion(db, run.sourceId, run.candidateVersionId, summary, run.id);
    return;
  }

  const now = new Date();
  await db.$transaction(async (transaction) => {
    await transaction.knowledgeSourceVersion.update({
      where: { id: run.candidateVersionId as string },
      data: {
        status: 'rejected',
        rejectedAt: now,
        validationSummary: jsonValue(summary),
      },
    });
    await transaction.ingestionRun.update({
      where: { id: run.id },
      data: {
        status: 'cancelled',
        validationSummary: jsonValue(summary),
        completedAt: now,
        updatedAt: now,
      },
    });
    await transaction.ingestionRunEvent.create({
      data: {
        runId: run.id,
        eventType: 'candidate_rejected',
        reasonCode: 'review_rejected',
        metadata: jsonValue({ reviewedBy: input.reviewedBy }),
      },
    });
  });
}

export async function rollbackSourceVersion(
  db: PrismaDatabase,
  input: { sourceId: string; sourceVersionId: string; actor: string; embeddingProfile: string },
): Promise<string> {
  const version = await db.knowledgeSourceVersion.findFirst({
    where: { id: input.sourceVersionId, sourceId: input.sourceId },
    select: { id: true, status: true, validationSummary: true },
  });
  if (!version || !['published', 'superseded'].includes(version.status)) {
    throw new Error(`Source version ${input.sourceVersionId} is not rollbackable.`);
  }
  const chunks = await db.knowledgeChunk.count({
    where: { sourceVersionId: version.id, embeddingProfile: input.embeddingProfile },
  });
  if (!chunks) {
    throw new Error(
      `Source version ${input.sourceVersionId} has no chunks for ${input.embeddingProfile}.`,
    );
  }
  const run = await db.ingestionRun.create({
    data: {
      sourceId: input.sourceId,
      triggerType: 'manual',
      triggerRef: `rollback:${input.sourceVersionId}`,
      requestedBy: input.actor,
      idempotencyKey: `rollback:${input.sourceId}:${input.sourceVersionId}:${randomUUID()}`,
      status: 'running',
      attempt: 1,
      startedAt: new Date(),
      candidateVersionId: input.sourceVersionId,
    },
    select: { id: true },
  });
  await db.ingestionRunEvent.create({
    data: {
      runId: run.id,
      eventType: 'rollback_requested',
      metadata: jsonValue({
        actor: input.actor,
        sourceVersionId: input.sourceVersionId,
        embeddingProfile: input.embeddingProfile,
      }),
    },
  });
  await publishSourceVersion(
    db,
    input.sourceId,
    input.sourceVersionId,
    {
      ...record(version.validationSummary),
      rollback: true,
      rollbackActor: input.actor,
      rollbackAt: new Date().toISOString(),
    },
    run.id,
  );
  return run.id;
}

// Compatibility helper retained for callers that only need a version identifier. New ingestion
// uses stageSourceVersion followed by explicit validation and publication.
export async function registerSourceVersion(
  db: PrismaDatabase,
  source: IngestionSource,
  documents: IngestionDocument[],
): Promise<string> {
  const { buildCanonicalManifest } = await import('./canonicalManifest');
  return stageSourceVersion(db, source, buildCanonicalManifest(documents));
}

function latestUpdatedAt(documents: IngestionDocument[]): string {
  return (
    documents
      .map((document) => document.updatedAt)
      .sort((left, right) => right.localeCompare(left))[0] ?? new Date().toISOString()
  );
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
