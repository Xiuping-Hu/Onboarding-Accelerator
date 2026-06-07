import type { AskRequest, AskResponse } from '@onboarding/shared';
import { retrieveKnowledge } from './knowledgeBase.js';

export async function answerQuestion(request: AskRequest): Promise<AskResponse> {
  const sources = await retrieveKnowledge(request.question);
  const sourceTitles = sources.map((source) => source.title).join(', ');

  return {
    answer:
      `I found a starter knowledge-base match for: "${request.question}". ` +
      `Relevant areas: ${sourceTitles}. Replace this skeleton with the real agent orchestration.`,
    sources,
  };
}
