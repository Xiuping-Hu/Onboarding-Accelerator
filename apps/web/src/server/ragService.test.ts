import assert from 'node:assert/strict';
import test from 'node:test';
import type { SourceProvenance } from '@onboarding/shared';
import { RagService } from './ragService';
import type { RagInputAdapter } from './ragAdapters/types';
import type { WebSearchProvider } from './webSearchProvider';

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

void test('RagService plans agent retrieval steps and annotates source provenance', async () => {
  const adapterSource: SourceProvenance = {
    id: 'shared:benefits-owner',
    title: 'Benefits owner row',
    excerpt: 'Benefits checklist owner is the People Team.',
    uri: 'file:///shared/checklist.csv',
    sourceType: 'knowledge_base',
    score: 0.92,
  };
  const adapter = {
    id: 'test-sheet-adapter',
    sourceKind: 'shared_directory_sheet',
    canHandle: () => true,
    load: async () => [],
    retrieve: async () => [adapterSource],
  } satisfies RagInputAdapter;
  let webSearchCalls = 0;
  const webSearchProvider = {
    search: async () => {
      webSearchCalls += 1;
      return [];
    },
  } satisfies WebSearchProvider;
  const vectorKnowledgeBase = {
    retrieve: async (query: string) => [
      {
        id: `vector:${query}`,
        title: 'Vector benefits policy',
        excerpt: 'Semantic policy chunk for benefits ownership.',
        uri: 'db://knowledge_chunks/benefits-policy',
        sourceType: 'knowledge_base',
        score: 0.74,
      },
    ],
  };
  const rag = new RagService(webSearchProvider, [adapter], vectorKnowledgeBase);

  const retrieval = await rag.retrieve('Who owns benefits checklist rows?', {
    webSearchEnabled: false,
  });

  assert.equal(retrieval.agent?.strategy, 'agentic-rag-v1');
  assert.deepEqual(retrieval.agent?.subqueries, [
    'Who owns benefits checklist rows?',
    'owns benefits checklist rows',
  ]);
  assert.equal(webSearchCalls, 0);
  assert.ok(
    retrieval.agent?.steps.some((step) => step.tool === 'web_search' && step.status === 'skipped'),
  );
  assert.ok(
    retrieval.agent?.steps.some(
      (step) => step.tool === 'vector_knowledge' && step.status === 'completed',
    ),
  );
  assert.equal(
    retrieval.sources.find((source) => source.id === adapterSource.id)?.metadata?.retrievalTool,
    'input_adapter',
  );
});
