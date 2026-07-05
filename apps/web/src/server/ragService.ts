import type { SourceProvenance } from '@onboarding/shared';
import { retrieveKnowledge } from './knowledgeBase';
import type { RagInputAdapter } from './ragAdapters/types';
import { mergeAndRerankSources } from './sourceMerger';
import type { WebSearchProvider } from './webSearchProvider';

export interface RetrievalOptions {
  webSearchEnabled: boolean;
}

export interface RetrievalContext {
  query: string;
  sources: SourceProvenance[];
  knowledgeBaseSources: SourceProvenance[];
  webSources: SourceProvenance[];
}

export class RagService {
  constructor(
    private readonly webSearchProvider: WebSearchProvider,
    private readonly inputAdapters: RagInputAdapter[] = [],
  ) {}

  async retrieve(query: string, options: RetrievalOptions): Promise<RetrievalContext> {
    const seedKnowledgeSources = await retrieveKnowledge(query);
    const adapterSources = (
      await Promise.all(this.inputAdapters.map((adapter) => retrieveFromAdapter(adapter, query)))
    ).flat();
    const knowledgeBaseSources = [
      ...seedKnowledgeSources,
      ...adapterSources.filter((source) => source.sourceType !== 'web'),
    ];
    const websiteSources = adapterSources.filter((source) => source.sourceType === 'web');
    const searchSources = options.webSearchEnabled
      ? await this.webSearchProvider.search(query)
      : [];
    const webSources = [...websiteSources, ...searchSources];
    const sources = mergeAndRerankSources(knowledgeBaseSources, webSources);

    return {
      query,
      sources,
      knowledgeBaseSources,
      webSources,
    };
  }
}

async function retrieveFromAdapter(
  adapter: RagInputAdapter,
  query: string,
): Promise<SourceProvenance[]> {
  try {
    return await adapter.retrieve(query);
  } catch (error) {
    console.error(`RAG input adapter failed: ${adapter.id}`, error);
    return [];
  }
}
