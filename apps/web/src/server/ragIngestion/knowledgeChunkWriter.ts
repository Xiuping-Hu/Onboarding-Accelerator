import { Prisma } from '@/generated/prisma/client';
import type { EmbeddingProvider } from '../embeddingService';
import type { PrismaDatabase } from '../infrastructure/prisma/prismaTypes';
import { formatVector } from '../pgvectorKnowledgeBase';
import type { IngestionChunk } from './types';

export async function writeKnowledgeChunks(
  db: PrismaDatabase,
  embeddingProfile: string,
  rootSourceId: string,
  chunks: EmbeddedKnowledgeChunk[],
  sourceVersionId?: string,
): Promise<void> {
  for (const { chunk, embedding } of chunks) {
    const metadata = JSON.stringify({ ...chunk.metadata, embeddingProfile, sourceVersionId });
    const vector = formatVector(embedding);
    if (sourceVersionId) {
      await db.$executeRaw(Prisma.sql`insert into knowledge_chunks (
         id, embedding_profile, title, excerpt, uri, source_type, metadata, embedding,
         source_id, source_version_id, section_key, updated_at
       ) values (${chunk.id}, ${embeddingProfile}, ${chunk.title}, ${chunk.text}, ${chunk.uri},
         'knowledge_base', ${metadata}::jsonb, ${vector}::vector, ${rootSourceId},
         ${sourceVersionId}, ${String(chunk.metadata.section ?? chunk.metadata.chunkIndex ?? '')}, now())
       on conflict (id, embedding_profile) do update set
         title = excluded.title,
         excerpt = excluded.excerpt,
         uri = excluded.uri,
         source_type = excluded.source_type,
         metadata = excluded.metadata,
         embedding = excluded.embedding,
         source_id = excluded.source_id,
         source_version_id = excluded.source_version_id,
         section_key = excluded.section_key,
         updated_at = excluded.updated_at`);
    } else {
      await db.$executeRaw(Prisma.sql`insert into knowledge_chunks (
           id, embedding_profile, title, excerpt, uri, source_type, metadata, embedding, updated_at
         ) values (${chunk.id}, ${embeddingProfile}, ${chunk.title}, ${chunk.text}, ${chunk.uri},
           'knowledge_base', ${metadata}::jsonb, ${vector}::vector, now())
         on conflict (id, embedding_profile) do update set
           title = excluded.title,
           excerpt = excluded.excerpt,
           uri = excluded.uri,
           source_type = excluded.source_type,
           metadata = excluded.metadata,
           embedding = excluded.embedding,
           updated_at = excluded.updated_at`);
    }
  }

  if (sourceVersionId) {
    await db.$executeRaw(Prisma.sql`delete from knowledge_chunks
       where source_version_id = ${sourceVersionId}
         and embedding_profile = ${embeddingProfile}
         and id not in (${Prisma.join(chunks.map(({ chunk }) => chunk.id))})`);
  } else {
    await db.$executeRaw(Prisma.sql`delete from knowledge_chunks
       where metadata->>'rootSourceId' = ${rootSourceId}
         and embedding_profile = ${embeddingProfile}
         and id not in (${Prisma.join(chunks.map(({ chunk }) => chunk.id))})`);
  }
}

export interface EmbeddedKnowledgeChunk {
  chunk: IngestionChunk;
  embedding: number[];
}

export async function embedKnowledgeChunks(
  embeddings: EmbeddingProvider,
  chunks: IngestionChunk[],
  options: {
    reusableEmbeddings?: Map<string, number[]>;
    concurrency?: number;
  } = {},
): Promise<EmbeddedKnowledgeChunk[]> {
  return mapWithConcurrency(chunks, options.concurrency ?? 4, async (chunk) => {
    const contentHash = String(chunk.metadata.contentHash ?? '');
    const reused = contentHash ? options.reusableEmbeddings?.get(contentHash) : undefined;
    const embedding = reused ?? (await embeddings.embed(chunk.text));
    if (!embedding?.length) {
      throw new Error('Embedding generation returned no vector; check the embedding provider.');
    }
    return { chunk, embedding };
  });
}

export async function loadReusableEmbeddings(
  db: PrismaDatabase,
  embeddingProfile: string,
  chunks: IngestionChunk[],
): Promise<Map<string, number[]>> {
  const contentHashes = [
    ...new Set(chunks.map((chunk) => String(chunk.metadata.contentHash ?? '')).filter(Boolean)),
  ];
  if (!contentHashes.length) return new Map();

  const rows = await db.$queryRaw<Array<{ content_hash: string; embedding: string }>>(Prisma.sql`
    select distinct on (metadata->>'contentHash')
           metadata->>'contentHash' as content_hash,
           embedding::text as embedding
      from knowledge_chunks
     where embedding_profile = ${embeddingProfile}
       and metadata->>'contentHash' in (${Prisma.join(contentHashes)})
     order by metadata->>'contentHash', updated_at desc`);
  return new Map(
    rows
      .map((row) => [row.content_hash, parseVector(row.embedding)] as const)
      .filter((entry) => entry[1].length > 0),
  );
}

function parseVector(value: string): number[] {
  return value
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((entry) => Number(entry))
    .filter(Number.isFinite);
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), Math.max(1, values.length)) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        const value = values[index];
        if (value !== undefined) results[index] = await operation(value);
      }
    },
  );
  await Promise.all(workers);
  return results;
}
