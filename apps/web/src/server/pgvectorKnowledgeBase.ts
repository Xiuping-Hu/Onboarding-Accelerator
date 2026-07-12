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
    private readonly allowedAccessScopes: string[] = ['all_users'],
    private readonly embeddingProfile = 'openai:text-embedding-3-small',
  ) {}

  async retrieve(query: string): Promise<SourceProvenance[]> {
    const embedding = await this.embeddings.embed(query);
    if (!embedding?.length) {
      return [];
    }
    const isLocalProfile = this.embeddingProfile.startsWith('local:');
    const queryTerms = isLocalProfile ? keywordTerms(query) : [];

    const result = await this.db.query<KnowledgeChunkRow>(
      `select id,
              title,
              excerpt,
              uri,
              source_type,
              metadata,
              least(
                0.99,
                greatest(0, 1 - (embedding <=> $1::vector)) +
                  case when $5::boolean then
                    (select count(*)::float * 0.25
                     from unnest($6::text[]) as term
                     where lower(concat_ws(' ', title, excerpt)) like '%' || term || '%')
                  else 0 end
              ) as score
       from knowledge_chunks
       where embedding_profile = $2
         and coalesce(metadata->>'accessScope', 'all_users') = any($3::text[])
       order by score desc
       limit $4`,
      [
        formatVector(embedding),
        this.embeddingProfile,
        this.allowedAccessScopes,
        this.limit,
        isLocalProfile,
        queryTerms,
      ],
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

function keywordTerms(query: string): string[] {
  return [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])].filter(
    (term) => term.length > 2,
  );
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
