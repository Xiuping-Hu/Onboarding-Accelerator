import type { DatabaseClient } from '../database';
import type { EmbeddingProvider } from '../embeddingService';
import { formatVector } from '../pgvectorKnowledgeBase';
import type { IngestionChunk } from './types';

export async function writeKnowledgeChunks(
  db: DatabaseClient,
  embeddings: EmbeddingProvider,
  embeddingProfile: string,
  rootSourceId: string,
  chunks: IngestionChunk[],
): Promise<void> {
  for (const chunk of chunks) {
    const embedding = await embeddings.embed(chunk.text);
    if (!embedding?.length) {
      throw new Error('Embedding generation returned no vector; check the embedding provider.');
    }

    await db.query(
      `insert into knowledge_chunks (
         id, embedding_profile, title, excerpt, uri, source_type, metadata, embedding, updated_at
       ) values ($1, $2, $3, $4, $5, 'knowledge_base', $6::jsonb, $7::vector, now())
       on conflict (id, embedding_profile) do update set
         title = excluded.title,
         excerpt = excluded.excerpt,
         uri = excluded.uri,
         source_type = excluded.source_type,
         metadata = excluded.metadata,
         embedding = excluded.embedding,
         updated_at = excluded.updated_at`,
      [
        chunk.id,
        embeddingProfile,
        chunk.title,
        chunk.text,
        chunk.uri,
        JSON.stringify({ ...chunk.metadata, embeddingProfile }),
        formatVector(embedding),
      ],
    );
  }

  await db.query(
    `delete from knowledge_chunks
     where metadata->>'rootSourceId' = $1
       and embedding_profile = $2
       and id <> all($3::text[])`,
    [rootSourceId, embeddingProfile, chunks.map((chunk) => chunk.id)],
  );
}
