import type { PrismaClient } from '@/generated/prisma/client';
import type { EmbeddingProvider } from '../embeddingService';
import { chunkDocument } from './chunker';
import { extractSources, type SharePointCredentials } from './extractors';
import { embedKnowledgeChunks, writeKnowledgeChunks } from './knowledgeChunkWriter';
import { registerSourceVersion } from './sourceVersionWriter';
import type { IngestionReport, IngestionSource } from './types';

export class RagIngestionService {
  constructor(
    private readonly db: PrismaClient | undefined,
    private readonly embeddings: EmbeddingProvider,
    private readonly sharePointCredentials: SharePointCredentials,
    private readonly allowedAccessScopes: string[],
    private readonly embeddingProfile: string,
    private readonly sourceVersioningEnabled = false,
  ) {}

  async ingest(source: IngestionSource, dryRun: boolean): Promise<IngestionReport> {
    if (!source.enabled)
      return {
        sourceId: source.id,
        status: 'skipped',
        chunkCount: 0,
        warnings: ['Source is disabled.'],
      };
    if (!this.allowedAccessScopes.includes(source.accessScope)) {
      return {
        sourceId: source.id,
        status: 'skipped',
        chunkCount: 0,
        warnings: [`Access scope ${source.accessScope} is not enabled for retrieval.`],
      };
    }

    try {
      const documents = await extractSources(source, this.sharePointCredentials);
      const chunks = documents.flatMap(chunkDocument);
      const warnings = chunks.length ? [] : ['No indexable text was extracted.'];
      if (documents.length > 1) warnings.push(`Crawled ${documents.length} SharePoint pages.`);
      if (dryRun || !chunks.length) {
        return {
          sourceId: source.id,
          status: dryRun ? 'dry_run' : 'skipped',
          chunkCount: chunks.length,
          warnings,
        };
      }

      if (!this.db) throw new Error('DATABASE_URL is required for ingestion writes.');
      const embeddedChunks = await embedKnowledgeChunks(this.embeddings, chunks);
      if (this.sourceVersioningEnabled) {
        await this.db.$transaction(async (db) => {
          const sourceVersionId = await registerSourceVersion(db, source, documents);
          await writeKnowledgeChunks(
            db,
            this.embeddingProfile,
            source.id,
            embeddedChunks,
            sourceVersionId,
          );
        });
      } else {
        await writeKnowledgeChunks(this.db, this.embeddingProfile, source.id, embeddedChunks);
      }
      return { sourceId: source.id, status: 'indexed', chunkCount: chunks.length, warnings };
    } catch (error) {
      return {
        sourceId: source.id,
        status: 'failed',
        chunkCount: 0,
        warnings: [],
        error: error instanceof Error ? error.message : 'Unknown ingestion error',
      };
    }
  }
}
