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

export interface StructuredOutputRequest {
  system: string;
  prompt: string;
  responseSchema?: {
    name: string;
    schema: Record<string, unknown>;
  };
}

export interface StructuredOutputResult {
  content: string;
  usage?: AiUsageStats;
}

export interface AnswerProvider {
  answer(input: AnswerRequest): Promise<AnswerResult | undefined>;
  generateStructured?(input: StructuredOutputRequest): Promise<StructuredOutputResult | undefined>;
}
