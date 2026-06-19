import type { AskRequest, AskResponse } from '@onboarding/shared';
import type { OpenAiService } from './openAiService.js';
import type { RagService } from './ragService.js';

export async function answerQuestion(
  request: AskRequest,
  rag: RagService,
  openAi?: OpenAiService,
): Promise<AskResponse> {
  const retrieval = await rag.retrieve(request.question, {
    webSearchEnabled: request.webSearchEnabled ?? false,
  });
  const sources = retrieval.sources;
  const sourceTitles = sources.map((source) => source.title).join(', ');

  if (openAi) {
    try {
      const answer = await openAi.answer({ prompt: request.question, sources });

      if (answer) {
        return { answer, sources };
      }
    } catch (error) {
      console.error(error);
    }
  }

  return {
    answer:
      `I found retrieved onboarding context for: "${request.question}". ` +
      (sourceTitles
        ? `Grounding sources: ${sourceTitles}.`
        : 'No source content matched this question, so I cannot verify a company-specific answer.'),
    sources,
  };
}
