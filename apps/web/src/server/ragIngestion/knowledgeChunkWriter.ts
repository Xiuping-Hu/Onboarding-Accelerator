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
    const metadata = JSON.stringify({ ...chunk.metadata, embeddingProfile });
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

  await db.$executeRaw(Prisma.sql`delete from knowledge_chunks
     where metadata->>'rootSourceId' = ${rootSourceId}
       and embedding_profile = ${embeddingProfile}
       and id not in (${Prisma.join(chunks.map(({ chunk }) => chunk.id))})`);
}

export interface EmbeddedKnowledgeChunk {
  chunk: IngestionChunk;
  embedding: number[];
}

export async function embedKnowledgeChunks(
  embeddings: EmbeddingProvider,
  chunks: IngestionChunk[],
): Promise<EmbeddedKnowledgeChunk[]> {
  return Promise.all(
    chunks.map(async (chunk) => {
      const embedding = await embeddings.embed(chunk.text);
      if (!embedding?.length) {
        throw new Error('Embedding generation returned no vector; check the embedding provider.');
      }
      return { chunk, embedding };
    }),
  );
}
