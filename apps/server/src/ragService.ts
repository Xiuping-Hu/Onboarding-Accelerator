import type { SourceProvenance } from '@onboarding/shared';
import { retrieveKnowledge } from './knowledgeBase.js';
import { mergeAndRerankSources } from './sourceMerger.js';
import type { WebSearchProvider } from './webSearchProvider.js';

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
  constructor(private readonly webSearchProvider: WebSearchProvider) {}

  async retrieve(query: string, options: RetrievalOptions): Promise<RetrievalContext> {
    const knowledgeBaseSources = await retrieveKnowledge(query);
    const webSources = options.webSearchEnabled ? await this.webSearchProvider.search(query) : [];
    const sources = mergeAndRerankSources(knowledgeBaseSources, webSources);

    return {
      query,
      sources,
      knowledgeBaseSources,
      webSources,
    };
  }
}
