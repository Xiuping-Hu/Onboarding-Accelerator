import type { AiUsageStats, ChatMessage, SourceProvenance } from '@onboarding/shared';

export interface AnswerRequest {
  prompt: string;
  sources: SourceProvenance[];
  chatHistory?: ChatMessage[];
  guideNodeIds?: string[];
}

export interface AnswerResult {
  content: string;
  usage?: AiUsageStats;
}

export interface AnswerProvider {
  answer(input: AnswerRequest): Promise<AnswerResult | undefined>;
}
