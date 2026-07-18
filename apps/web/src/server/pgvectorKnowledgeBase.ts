import type { SourceProvenance } from '@onboarding/shared';
import { Prisma } from '@/generated/prisma/client';
import type { EmbeddingProvider } from './embeddingService';
import type { PrismaDatabase } from './infrastructure/prisma/prismaTypes';

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
    private readonly db: PrismaDatabase,
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

    const vector = formatVector(embedding);
    const terms = queryTerms.length
      ? Prisma.sql`array[${Prisma.join(queryTerms)}]::text[]`
      : Prisma.sql`array[]::text[]`;
    const result = await this.db.$queryRaw<KnowledgeChunkRow[]>(Prisma.sql`
       select id,
              title,
              excerpt,
              uri,
              source_type,
              metadata,
              least(
                0.99,
                greatest(0, 1 - (embedding <=> ${vector}::vector)) +
                  case when ${isLocalProfile}::boolean then
                    (select count(*)::float * 0.25
                     from unnest(${terms}) as term
                     where lower(concat_ws(' ', title, excerpt)) like '%' || term || '%')
                  else 0 end
              ) as score
       from knowledge_chunks
       where embedding_profile = ${this.embeddingProfile}
         and coalesce(metadata->>'accessScope', 'all_users') in (${Prisma.join(this.allowedAccessScopes)})
       order by score desc
       limit ${this.limit}`);

    return result.map((row) => {
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
