import type { SourceProvenance } from '@onboarding/shared';

export function mergeAndRerankSources(
  knowledgeBaseSources: SourceProvenance[],
  webSources: SourceProvenance[],
  limit = 6,
): SourceProvenance[] {
  const byId = new Map<string, SourceProvenance>();

  for (const source of [...knowledgeBaseSources, ...webSources]) {
    const existing = byId.get(source.id);
    if (!existing || sourceWeight(source) > sourceWeight(existing)) {
      byId.set(source.id, source);
    }
  }

  return [...byId.values()].sort((a, b) => sourceWeight(b) - sourceWeight(a)).slice(0, limit);
}

function sourceWeight(source: SourceProvenance): number {
  const retrievalScore = source.score ?? source.confidence ?? 0;
  const knowledgeBaseBoost = source.sourceType === 'knowledge_base' ? 0.2 : 0;

  return retrievalScore + knowledgeBaseBoost;
}
