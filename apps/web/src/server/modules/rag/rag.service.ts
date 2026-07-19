import type { SourceProvenance } from '@onboarding/shared';
import { retrieveKnowledge } from '../../knowledgeBase';
import type { RagInputAdapter } from '../../ragAdapters/types';
import { mergeAndRerankSources } from '../../sourceMerger';
import type { WebSearchProvider } from '../../webSearchProvider';

export interface RetrievalOptions {
  webSearchEnabled: boolean;
}

export type RetrievalAgentTool =
  | 'seed_knowledge'
  | 'vector_knowledge'
  | 'input_adapter'
  | 'web_search';

export type RetrievalAgentStepStatus = 'completed' | 'skipped' | 'failed';

export interface RetrievalAgentStep {
  id: string;
  tool: RetrievalAgentTool;
  label: string;
  query: string;
  status: RetrievalAgentStepStatus;
  sourceCount: number;
  durationMs: number;
  reason?: string;
  error?: string;
}

export interface RetrievalAgentTrace {
  strategy: 'agentic-rag-v1';
  originalQuery: string;
  subqueries: string[];
  steps: RetrievalAgentStep[];
}

export interface RetrievalContext {
  query: string;
  sources: SourceProvenance[];
  knowledgeBaseSources: SourceProvenance[];
  webSources: SourceProvenance[];
  agent?: RetrievalAgentTrace;
}

export interface RagRetriever {
  retrieve(query: string, options: RetrievalOptions): Promise<RetrievalContext>;
}

export interface KnowledgeRetriever {
  retrieve(query: string): Promise<SourceProvenance[]>;
}

export class RagService implements RagRetriever {
  constructor(
    private readonly webSearchProvider: WebSearchProvider,
    private readonly inputAdapters: RagInputAdapter[] = [],
    private readonly vectorKnowledgeBase?: KnowledgeRetriever,
    private readonly seedKnowledgeEnabled = true,
  ) {}

  async retrieve(query: string, options: RetrievalOptions): Promise<RetrievalContext> {
    const agent = createAgentTrace(query);
    const knowledgeBaseSources: SourceProvenance[] = [];
    const webSources: SourceProvenance[] = [];

    for (const subquery of agent.subqueries) {
      addSources(
        await this.executeStep(agent, {
          tool: 'seed_knowledge',
          label: 'Built-in onboarding knowledge',
          query: subquery,
          skipReason: this.seedKnowledgeEnabled ? undefined : 'Seed knowledge is disabled.',
          run: () => retrieveKnowledge(subquery),
        }),
        knowledgeBaseSources,
        webSources,
      );

      addSources(
        await this.executeStep(agent, {
          tool: 'vector_knowledge',
          label: 'Pgvector knowledge chunks',
          query: subquery,
          skipReason: this.vectorKnowledgeBase ? undefined : 'Vector retrieval is not configured.',
          run: () => this.vectorKnowledgeBase?.retrieve(subquery) ?? Promise.resolve([]),
        }),
        knowledgeBaseSources,
        webSources,
      );

      for (const adapter of this.inputAdapters) {
        addSources(
          await this.executeStep(agent, {
            tool: 'input_adapter',
            label: `${adapter.sourceKind}:${adapter.id}`,
            query: subquery,
            run: () => adapter.retrieve(subquery),
          }),
          knowledgeBaseSources,
          webSources,
        );
      }

      addSources(
        await this.executeStep(agent, {
          tool: 'web_search',
          label: 'Policy-gated web search',
          query: subquery,
          skipReason: options.webSearchEnabled
            ? undefined
            : 'Web search is disabled for this request.',
          run: () => this.webSearchProvider.search(subquery),
        }),
        knowledgeBaseSources,
        webSources,
      );
    }

    const dedupedKnowledgeBaseSources = dedupeByBestScore(knowledgeBaseSources);
    const dedupedWebSources = dedupeByBestScore(webSources);
    const sources = mergeAndRerankSources(knowledgeBaseSources, webSources);

    return {
      query,
      sources,
      knowledgeBaseSources: dedupedKnowledgeBaseSources,
      webSources: dedupedWebSources,
      agent,
    };
  }

  private async executeStep(
    agent: RetrievalAgentTrace,
    step: PlannedRetrievalStep,
  ): Promise<SourceProvenance[]> {
    const id = `step-${agent.steps.length + 1}`;

    if (step.skipReason) {
      agent.steps.push({
        id,
        tool: step.tool,
        label: step.label,
        query: step.query,
        status: 'skipped',
        sourceCount: 0,
        durationMs: 0,
        reason: step.skipReason,
      });

      return [];
    }

    const startedAt = Date.now();

    try {
      const sources = await step.run();
      const annotatedSources = sources.map((source) => annotateSource(source, step, id));

      agent.steps.push({
        id,
        tool: step.tool,
        label: step.label,
        query: step.query,
        status: 'completed',
        sourceCount: annotatedSources.length,
        durationMs: Date.now() - startedAt,
      });

      return annotatedSources;
    } catch (error) {
      console.error(`RAG agent step failed: ${step.label}`, error);
      agent.steps.push({
        id,
        tool: step.tool,
        label: step.label,
        query: step.query,
        status: 'failed',
        sourceCount: 0,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'Unknown retrieval error',
      });

      return [];
    }
  }
}

interface PlannedRetrievalStep {
  tool: RetrievalAgentTool;
  label: string;
  query: string;
  skipReason?: string;
  run: () => Promise<SourceProvenance[]>;
}

function createAgentTrace(query: string): RetrievalAgentTrace {
  return {
    strategy: 'agentic-rag-v1',
    originalQuery: query,
    subqueries: createSubqueries(query),
    steps: [],
  };
}

function createSubqueries(query: string): string[] {
  const trimmedQuery = query.trim();
  const keywordQuery = significantTerms(trimmedQuery).join(' ');

  if (!keywordQuery || keywordQuery === trimmedQuery.toLowerCase()) {
    return [trimmedQuery];
  }

  return [trimmedQuery, keywordQuery];
}

function significantTerms(query: string): string[] {
  const seen = new Set<string>();

  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2 && !agentStopWords.has(term))
    .filter((term) => {
      if (seen.has(term)) {
        return false;
      }

      seen.add(term);
      return true;
    })
    .slice(0, 8);
}

const agentStopWords = new Set([
  'about',
  'after',
  'and',
  'are',
  'can',
  'for',
  'from',
  'has',
  'how',
  'into',
  'new',
  'our',
  'should',
  'that',
  'the',
  'their',
  'this',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'with',
]);

function annotateSource(
  source: SourceProvenance,
  step: PlannedRetrievalStep,
  stepId: string,
): SourceProvenance {
  return {
    ...source,
    metadata: {
      ...source.metadata,
      retrievalStrategy: 'agentic-rag-v1',
      retrievalTool: step.tool,
      retrievalStepId: stepId,
      retrievalQuery: step.query,
    },
  };
}

function addSources(
  sources: SourceProvenance[],
  knowledgeBaseSources: SourceProvenance[],
  webSources: SourceProvenance[],
): void {
  for (const source of sources) {
    if (source.sourceType === 'web') {
      webSources.push(source);
    } else {
      knowledgeBaseSources.push(source);
    }
  }
}

function dedupeByBestScore(sources: SourceProvenance[]): SourceProvenance[] {
  const byId = new Map<string, SourceProvenance>();

  for (const source of sources) {
    const existing = byId.get(source.id);
    if (!existing || sourceScore(source) > sourceScore(existing)) {
      byId.set(source.id, source);
    }
  }

  return [...byId.values()].sort((a, b) => sourceScore(b) - sourceScore(a));
}

function sourceScore(source: SourceProvenance): number {
  return source.score ?? source.confidence ?? 0;
}
