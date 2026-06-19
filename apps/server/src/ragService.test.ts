import assert from 'node:assert/strict';
import test from 'node:test';
import type { SourceProvenance } from '@onboarding/shared';
import { RagService } from './ragService.js';
import type { RagInputAdapter } from './ragAdapters/types.js';
import type { WebSearchProvider } from './webSearchProvider.js';

void test('RagService merges seed knowledge, adaptor results, and web search results', async () => {
  const adapterSource: SourceProvenance = {
    id: 'shared:first-week-plan',
    title: 'Shared first week plan',
    excerpt: 'Shared directory plan names the onboarding buddy and first week checklist.',
    uri: 'file:///shared/first-week.md',
    sourceType: 'knowledge_base',
    score: 0.9,
  };
  const webSearchSource: SourceProvenance = {
    id: 'web:policy',
    title: 'Policy search result',
    excerpt: 'Search result for current policy.',
    uri: 'https://example.com/policy',
    sourceType: 'web',
    score: 0.6,
  };
  const adapter = {
    id: 'test-adapter',
    sourceKind: 'shared_directory_document',
    canHandle: () => true,
    load: async () => [],
    retrieve: async () => [adapterSource],
  } satisfies RagInputAdapter;
  const webSearchProvider = {
    search: async () => [webSearchSource],
  } satisfies WebSearchProvider;
  const rag = new RagService(webSearchProvider, [adapter]);

  const retrieval = await rag.retrieve('first week onboarding policy', { webSearchEnabled: true });

  assert.ok(retrieval.knowledgeBaseSources.some((source) => source.id === 'first-week'));
  assert.ok(retrieval.knowledgeBaseSources.some((source) => source.id === adapterSource.id));
  assert.ok(retrieval.webSources.some((source) => source.id === webSearchSource.id));
  assert.ok(retrieval.sources.some((source) => source.id === adapterSource.id));
});
