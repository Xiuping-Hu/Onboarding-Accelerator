import type {
  AiUsageStats,
  ChatMessage,
  CitationSegment,
  SourceProvenance,
} from '@onboarding/shared';

export interface AnswerRequest {
  prompt: string;
  sources: SourceProvenance[];
  chatHistory?: ChatMessage[];
  guideNodeIds?: string[];
}

export interface AnswerResult {
  content: string;
  citationSegments?: CitationSegment[];
  usage?: AiUsageStats;
}

export interface AnswerProvider {
  answer(input: AnswerRequest): Promise<AnswerResult | undefined>;
}
