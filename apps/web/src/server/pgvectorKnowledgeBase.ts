import type { SourceProvenance } from '@onboarding/shared';
import type { DatabaseClient } from './database';
import type { EmbeddingProvider } from './embeddingService';

interface KnowledgeChunkRow {
  id: string;
  title: string;
  excerpt: string;
  uri: string | null;
  source_type: SourceProvenance['sourceType'] | null;
  metadata: SourceProvenance['metadata'] | string | null;
  score: number | string;
}

export class PgvectorKnowledgeBase {
  constructor(
    private readonly db: DatabaseClient,
    private readonly embeddings: EmbeddingProvider,
    private readonly limit = 5,
  ) {}

  async retrieve(query: string): Promise<SourceProvenance[]> {
    const embedding = await this.embeddings.embed(query);
    if (!embedding?.length) {
      return [];
    }

    const result = await this.db.query<KnowledgeChunkRow>(
      `select id,
              title,
              excerpt,
              uri,
              source_type,
              metadata,
              greatest(0, 1 - (embedding <=> $1::vector)) as score
       from knowledge_chunks
       order by embedding <=> $1::vector
       limit $2`,
      [formatVector(embedding), this.limit],
    );

    return result.rows.map((row) => {
      const score = typeof row.score === 'number' ? row.score : Number.parseFloat(row.score);

      return {
        id: row.id,
        title: row.title,
        excerpt: row.excerpt,
        uri: row.uri ?? undefined,
        sourceType: row.source_type ?? 'knowledge_base',
        score,
        confidence: score,
        metadata: row.metadata ? parseMetadata(row.metadata) : undefined,
      };
    });
  }
}

export function formatVector(values: number[]): string {
  return `[${values.map((value) => Number(value).toString()).join(',')}]`;
}

function parseMetadata(
  metadata: SourceProvenance['metadata'] | string,
): SourceProvenance['metadata'] {
  return typeof metadata === 'string'
    ? (JSON.parse(metadata) as SourceProvenance['metadata'])
    : metadata;
}
