import { randomUUID } from 'node:crypto';
import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  GuideNode,
  OnboardingSession,
} from '@onboarding/shared';
import type { RagService } from './ragService';
import type { OpenAiService } from './openAiService';
import { NoopLogService, type LogService } from './logService';
import type { SessionRepository } from './sessionRepository';
import { touchSession } from './sessionRepository';

export class ChatOrchestrationService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly rag: RagService,
    private readonly openAi: OpenAiService,
    private readonly logs: LogService = new NoopLogService(),
  ) {}

  async chat(sessionId: string, request: ChatRequest, ownerId: string): Promise<ChatResponse> {
    const session = await this.sessions.get(sessionId, ownerId);
    const webSearchEnabled = request.webSearchEnabled ?? session.settings.webSearchEnabled;
    const retrieval = await this.rag.retrieve(request.message, { webSearchEnabled });
    const guideNodeIds = findRelevantGuideNodeIds(session, request.message);
    const now = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: 'user',
      content: request.message,
      createdAt: now,
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
      usage: answer.usage,
    };

    session.chatHistory.push(userMessage, assistantMessage);
    const savedSession = await this.sessions.save(touchSession(session));

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
      session: savedSession,
      sources: retrieval.sources,
      guideNodeIds,
      usage: answer.usage,
    };
  }

  private async composeAnswer(
    session: OnboardingSession,
    prompt: string,
    sources: ChatMessage['sources'] = [],
    guideNodeIds: string[],
  ): Promise<{ content: string; usage?: ChatMessage['usage'] }> {
    try {
      const modelAnswer = await this.openAi.answer({
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
