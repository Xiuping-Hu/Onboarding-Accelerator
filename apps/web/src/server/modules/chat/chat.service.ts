import { randomUUID } from 'node:crypto';
import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  GuideNode,
  OnboardingSession,
  RoadmapNodeReference,
  SourceProvenance,
} from '@onboarding/shared';
import type { RagRetriever } from '../rag/rag.service';
import type { AnswerProvider } from '../../core/ports/answerProvider';
import { NoopLogService, type LogService } from '../../logService';
import type { SessionRepository } from '../../sessionRepository';
import { touchSession } from '../../sessionRepository';
import type { KnowledgeMapService } from '../knowledge-maps/knowledgeMap.application.service';

export class ChatService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly rag: RagRetriever,
    private readonly answers: AnswerProvider,
    private readonly logs: LogService = new NoopLogService(),
    private readonly knowledgeMaps?: KnowledgeMapService,
  ) {}

  async chat(sessionId: string, request: ChatRequest, ownerId: string): Promise<ChatResponse> {
    const session = await this.sessions.get(sessionId, ownerId);
    const webSearchEnabled = request.webSearchEnabled ?? session.settings.webSearchEnabled;
    const retrieval = await this.rag.retrieve(request.message, { webSearchEnabled });
    const roadmapReference = await this.resolveRoadmapReference(
      session,
      request.referencedNodeId,
      ownerId,
    );
    if (roadmapReference.sources.length) {
      retrieval.sources = dedupeSources([...roadmapReference.sources, ...retrieval.sources]);
    }
    const guideNodeIds = unique([
      ...(roadmapReference.reference ? [roadmapReference.reference.nodeId] : []),
      ...findRelevantGuideNodeIds(session, request.message),
    ]);
    const now = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: 'user',
      content: request.message,
      createdAt: now,
      ...(roadmapReference.reference
        ? {
            guideNodeIds: [roadmapReference.reference.nodeId],
            roadmapReferences: [roadmapReference.reference],
          }
        : {}),
    };
    const answer = await this.composeAnswer(
      session,
      request.message,
      retrieval.sources,
      guideNodeIds,
    );
    const assistantMessage: ChatMessage = {
      id: randomUUID(),
      role: 'assistant',
      content: answer.content,
      createdAt: now,
      sources: retrieval.sources,
      guideNodeIds,
      ...(roadmapReference.reference ? { focusStepIds: [roadmapReference.reference.nodeId] } : {}),
      usage: answer.usage,
    };
    const persistedAssistantMessage: ChatMessage = {
      ...assistantMessage,
      sources: toPersistedSourceReferences(retrieval.sources),
    };
    session.chatHistory.push(userMessage, persistedAssistantMessage);
    const savedSession = await this.sessions.save(touchSession(session), ownerId);

    if (answer.usage) {
      await this.logs.recordAiUsage({
        operation: 'chat',
        userId: ownerId,
        sessionId,
        usage: answer.usage,
      });
    }

    return {
      message: assistantMessage,
      session: withAuthorizedResponseMessage(savedSession, assistantMessage),
      sources: retrieval.sources,
      guideNodeIds,
      focusStepIds: assistantMessage.focusStepIds,
      usage: answer.usage,
    };
  }

  private async resolveRoadmapReference(
    session: OnboardingSession,
    nodeId: string | undefined,
    ownerId: string,
  ): Promise<{ reference?: RoadmapNodeReference; sources: SourceProvenance[] }> {
    if (!nodeId) return { sources: [] };

    if (this.knowledgeMaps) {
      try {
        const scopes = await this.knowledgeMaps.accessScopesFor(ownerId);
        const map = await this.knowledgeMaps.getPublished(scopes);
        const node = await this.knowledgeMaps.getNodeDetail(map.versionId, nodeId, scopes);
        return {
          reference: { nodeId: node.id, title: node.title, summary: node.summary },
          sources: node.sources,
        };
      } catch {
        return { sources: [] };
      }
    }

    const node = session.guide.nodes[nodeId];
    if (!node) return { sources: [] };
    return {
      reference: { nodeId: node.id, title: node.title, summary: node.summary },
      sources: node.sources,
    };
  }

  private async composeAnswer(
    session: OnboardingSession,
    prompt: string,
    sources: ChatMessage['sources'] = [],
    guideNodeIds: string[],
  ): Promise<{ content: string; usage?: ChatMessage['usage'] }> {
    try {
      const modelAnswer = await this.answers.answer({
        prompt,
        sources,
        chatHistory: session.chatHistory,
        guideNodeIds,
      });

      if (modelAnswer) {
        return {
          content: modelAnswer.content,
          usage: modelAnswer.usage,
        };
      }
    } catch (error) {
      console.error(error);
    }

    return {
      content: composeFallbackAnswer(prompt, sources, guideNodeIds),
    };
  }
}

function withAuthorizedResponseMessage(
  session: OnboardingSession,
  assistantMessage: ChatMessage,
): OnboardingSession {
  return {
    ...session,
    chatHistory: session.chatHistory.map((message) =>
      message.id === assistantMessage.id ? assistantMessage : message,
    ),
  };
}

function dedupeSources(sources: SourceProvenance[]): SourceProvenance[] {
  return [...new Map(sources.map((source) => [source.id, source])).values()];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function toPersistedSourceReferences(sources: SourceProvenance[]): SourceProvenance[] {
  return sources.map((source) => ({
    id: source.id,
    title: source.title,
    excerpt: 'Evidence is resolved after the current access policy is checked.',
    sourceType: source.sourceType,
    kind: source.kind,
    metadata: Object.fromEntries(
      Object.entries(source.metadata ?? {}).filter(([key]) =>
        ['sourceId', 'rootSourceId', 'sourceVersionId', 'sectionKey'].includes(key),
      ),
    ),
  }));
}

function composeFallbackAnswer(
  prompt: string,
  sources: ChatMessage['sources'] = [],
  guideNodeIds: string[],
): string {
  const sourceSummary = sources
    .slice(0, 3)
    .map((source) => `[${source.title}]`)
    .join(', ');
  const guideReference =
    guideNodeIds.length > 0
      ? ` I also found ${guideNodeIds.length} related visual guide node(s) for follow-up.`
      : '';

  return (
    `Based on the retrieved onboarding sources, here is a starting answer for "${prompt}". ` +
    (sourceSummary
      ? `Grounding sources: ${sourceSummary}. `
      : 'No matching onboarding source was retrieved, so I cannot verify the answer from company material. ') +
    `If you need a policy-specific answer, add the missing source content or connect the model layer. ` +
    guideReference
  );
}

function findRelevantGuideNodeIds(session: OnboardingSession, query: string): string[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  return Object.values(session.guide.nodes)
    .filter((node) => nodeMatchesTerms(node, terms))
    .slice(0, 5)
    .map((node) => node.id);
}

function nodeMatchesTerms(node: GuideNode, terms: string[]): boolean {
  const haystack = `${node.title} ${node.summary} ${node.detail ?? ''}`.toLowerCase();
  return terms.some((term) => term.length > 2 && haystack.includes(term));
}
