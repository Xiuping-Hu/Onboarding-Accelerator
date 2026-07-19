import type { AskResponse } from '@onboarding/shared';
import type { LogService } from '../../logService';
import type { AnswerProvider } from '../../core/ports/answerProvider';
import type { RagRetriever } from '../rag/rag.service';
import type { AskBody } from './ask.dto';

export class AskService {
  constructor(
    private readonly rag: RagRetriever,
    private readonly answers: AnswerProvider,
    private readonly logs: LogService,
  ) {}

  async ask(input: AskBody, userId: string): Promise<AskResponse> {
    const retrieval = await this.rag.retrieve(input.question, {
      webSearchEnabled: input.webSearchEnabled ?? false,
    });
    const sources = retrieval.sources;
    const sourceTitles = sources.map((source) => source.title).join(', ');

    try {
      const answer = await this.answers.answer({ prompt: input.question, sources });

      if (answer) {
        if (answer.usage) {
          await this.logs.recordAiUsage({
            operation: 'ask',
            userId,
            sessionId: input.conversationId,
            usage: answer.usage,
          });
        }

        return { answer: answer.content, sources, usage: answer.usage };
      }
    } catch (error) {
      console.error(error);
    }

    return {
      answer:
        `I found retrieved onboarding context for: "${input.question}". ` +
        (sourceTitles
          ? `Grounding sources: ${sourceTitles}.`
          : 'No source content matched this question, so I cannot verify a company-specific answer.'),
      sources,
    };
  }
}
