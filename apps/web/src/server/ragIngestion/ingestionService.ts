import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { EmbeddingProvider } from '../embeddingService';
import { buildCanonicalManifest } from './canonicalManifest';
import { validateCandidate } from './candidateValidator';
import { chunkDocument } from './chunker';
import { acquireAndExtractSources, type SharePointCredentials } from './extractors';
import {
  embedKnowledgeChunks,
  loadReusableEmbeddings,
  writeKnowledgeChunks,
} from './knowledgeChunkWriter';
import {
  ensureKnowledgeSource,
  holdSourceVersionForReview,
  loadCurrentSourceState,
  publishSourceVersion,
  rejectSourceVersion,
  stageSourceVersion,
} from './sourceVersionWriter';
import type { ConnectorRuntimeOptions } from './sourceConnectors';
import type { IngestionReport, IngestionSource } from './types';

export interface IngestionExecutionOptions {
  runId?: string;
  connectorOptions?: ConnectorRuntimeOptions;
}

export class RagIngestionService {
  constructor(
    private readonly db: PrismaClient | undefined,
    private readonly embeddings: EmbeddingProvider,
    private readonly sharePointCredentials: SharePointCredentials,
    private readonly allowedAccessScopes: string[],
    private readonly embeddingProfile: string,
    // Retained for constructor compatibility. Source versioning is now a baseline ingestion
    // invariant whenever a database is available.
    private readonly _legacySourceVersioningEnabled = false,
    private readonly connectorOptions: ConnectorRuntimeOptions = {},
  ) {}

  async ingest(
    source: IngestionSource,
    dryRun: boolean,
    execution: IngestionExecutionOptions = {},
  ): Promise<IngestionReport> {
    if (!source.enabled) {
      await this.skipRun(execution.runId, 'source_disabled');
      return {
        sourceId: source.id,
        status: 'skipped',
        chunkCount: 0,
        warnings: ['Source is disabled.'],
      };
    }
    if (!this.allowedAccessScopes.includes(source.accessScope)) {
      await this.skipRun(execution.runId, 'access_scope_not_enabled');
      return {
        sourceId: source.id,
        status: 'skipped',
        chunkCount: 0,
        warnings: [`Access scope ${source.accessScope} is not enabled for retrieval.`],
      };
    }

    let candidateVersionId: string | undefined;
    try {
      if (this.db) await ensureKnowledgeSource(this.db, source);
      const previous = this.db
        ? await loadCurrentSourceState(this.db, source.id)
        : {
            documentCount: 0,
            characterCount: 0,
            documents: [],
          };
      const { acquisition, documents } = await acquireAndExtractSources(
        source,
        this.sharePointCredentials,
        { previousDocuments: previous.documents },
        execution.connectorOptions ?? this.connectorOptions,
      );

      if (acquisition.status === 'unchanged') {
        await this.completeUnchangedRun(execution.runId, previous.manifestHash);
        return {
          sourceId: source.id,
          status: 'unchanged',
          chunkCount: 0,
          documentCount: previous.documentCount,
          characterCount: previous.characterCount,
          manifestHash: previous.manifestHash,
          sourceVersionId: previous.sourceVersionId,
          warnings: acquisition.warnings,
        };
      }

      const manifest = buildCanonicalManifest(documents);
      if (
        acquisition.complete &&
        previous.manifestHash &&
        previous.manifestHash === manifest.hash
      ) {
        await this.completeUnchangedRun(execution.runId, manifest.hash);
        return {
          sourceId: source.id,
          status: 'unchanged',
          chunkCount: 0,
          documentCount: manifest.documentCount,
          characterCount: manifest.characterCount,
          manifestHash: manifest.hash,
          sourceVersionId: previous.sourceVersionId,
          warnings: acquisition.warnings,
        };
      }

      const chunks = manifest.documents.flatMap((document) => chunkDocument(document));
      const warnings = [...acquisition.warnings];
      if (documents.length > 1) warnings.push(`Acquired ${documents.length} source documents.`);
      if (!chunks.length) warnings.push('No indexable text was extracted.');

      const validation = validateCandidate(
        source,
        manifest,
        chunks,
        previous,
        acquisition.complete,
      );
      if (dryRun) {
        return {
          sourceId: source.id,
          status: validation.outcome === 'requires_review' ? 'requires_review' : 'dry_run',
          chunkCount: chunks.length,
          documentCount: manifest.documentCount,
          characterCount: manifest.characterCount,
          manifestHash: manifest.hash,
          warnings: [...warnings, ...validation.reasons],
        };
      }

      if (!this.db) throw new Error('DATABASE_URL is required for ingestion writes.');
      candidateVersionId = await stageSourceVersion(this.db, source, manifest, execution.runId);
      await this.updateRunProgress(execution.runId, {
        candidateVersionId,
        documentCount: manifest.documentCount,
        characterCount: manifest.characterCount,
        chunkCount: chunks.length,
        validationSummary: jsonValue(validation.summary),
      });

      if (validation.outcome === 'invalid') {
        await rejectSourceVersion(this.db, candidateVersionId, validation.summary);
        throw new IngestionFailure('validation_failed', validation.reasons.join(', '));
      }

      const reusableEmbeddings = await loadReusableEmbeddings(
        this.db,
        this.embeddingProfile,
        chunks,
      );
      const embeddedChunks = await embedKnowledgeChunks(this.embeddings, chunks, {
        reusableEmbeddings,
        concurrency: 4,
      });
      const embeddingCount = chunks.filter(
        (chunk) => !reusableEmbeddings.has(String(chunk.metadata.contentHash ?? '')),
      ).length;
      await writeKnowledgeChunks(
        this.db,
        this.embeddingProfile,
        source.id,
        embeddedChunks,
        candidateVersionId,
      );
      await this.updateRunProgress(execution.runId, { embeddingCount });

      if (validation.outcome === 'requires_review') {
        await holdSourceVersionForReview(
          this.db,
          candidateVersionId,
          validation.summary,
          execution.runId,
        );
        return {
          sourceId: source.id,
          status: 'requires_review',
          chunkCount: chunks.length,
          documentCount: manifest.documentCount,
          characterCount: manifest.characterCount,
          manifestHash: manifest.hash,
          sourceVersionId: candidateVersionId,
          warnings: [...warnings, ...validation.reasons],
        };
      }

      await publishSourceVersion(
        this.db,
        source.id,
        candidateVersionId,
        validation.summary,
        execution.runId,
      );
      return {
        sourceId: source.id,
        status: 'indexed',
        chunkCount: chunks.length,
        documentCount: manifest.documentCount,
        characterCount: manifest.characterCount,
        manifestHash: manifest.hash,
        sourceVersionId: candidateVersionId,
        warnings,
      };
    } catch (error) {
      if (this.db && candidateVersionId) {
        await rejectSourceVersion(this.db, candidateVersionId, {
          outcome: 'invalid',
          reasons: [safeErrorCode(error)],
        }).catch(() => undefined);
      }
      await this.failRun(execution.runId, error);
      return {
        sourceId: source.id,
        status: 'failed',
        chunkCount: 0,
        warnings: [],
        error: error instanceof Error ? error.message : 'Unknown ingestion error',
      };
    }
  }

  private async completeUnchangedRun(
    runId: string | undefined,
    manifestHash?: string,
  ): Promise<void> {
    if (!this.db || !runId) return;
    const now = new Date();
    await this.db.$transaction([
      this.db.ingestionRun.update({
        where: { id: runId },
        data: {
          status: 'unchanged',
          completedAt: now,
          heartbeatAt: now,
          leaseExpiresAt: null,
          updatedAt: now,
        },
      }),
      this.db.ingestionRunEvent.create({
        data: {
          runId,
          eventType: 'source_unchanged',
          outputHash: manifestHash,
          metadata: {},
        },
      }),
    ]);
  }

  private async skipRun(runId: string | undefined, reasonCode: string): Promise<void> {
    if (!this.db || !runId) return;
    const now = new Date();
    await this.db.$transaction([
      this.db.ingestionRun.update({
        where: { id: runId },
        data: {
          status: 'cancelled',
          safeErrorCode: reasonCode,
          completedAt: now,
          leaseExpiresAt: null,
          heartbeatAt: now,
          updatedAt: now,
        },
      }),
      this.db.ingestionRunEvent.create({
        data: { runId, eventType: 'run_cancelled', reasonCode, metadata: {} },
      }),
    ]);
  }

  private async updateRunProgress(
    runId: string | undefined,
    data: Prisma.IngestionRunUpdateInput,
  ): Promise<void> {
    if (!this.db || !runId) return;
    await this.db.ingestionRun.update({ where: { id: runId }, data });
  }

  private async failRun(runId: string | undefined, error: unknown): Promise<void> {
    if (!this.db || !runId) return;
    const now = new Date();
    const code = safeErrorCode(error);
    const message =
      error instanceof Error ? error.message.slice(0, 500) : 'Unknown ingestion error';
    await this.db
      .$transaction([
        this.db.ingestionRun.update({
          where: { id: runId },
          data: {
            status: 'failed',
            safeErrorCode: code,
            safeErrorMessage: message,
            completedAt: now,
            leaseExpiresAt: null,
            heartbeatAt: now,
            updatedAt: now,
          },
        }),
        this.db.ingestionRunEvent.create({
          data: { runId, eventType: 'run_failed', reasonCode: code, metadata: {} },
        }),
      ])
      .catch(() => undefined);
  }
}

class IngestionFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function safeErrorCode(error: unknown): string {
  if (error instanceof IngestionFailure) return error.code;
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('status 429')) return 'upstream_rate_limited';
  if (/status 5\d\d/.test(message)) return 'upstream_unavailable';
  if (message.includes('timeout') || message.includes('abort')) return 'upstream_timeout';
  if (message.includes('credential') || message.includes('authentication'))
    return 'authentication_failed';
  if (message.includes('allowlist') || message.includes('public address'))
    return 'source_policy_rejected';
  if (message.includes('unsupported')) return 'unsupported_content';
  return 'ingestion_failed';
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
