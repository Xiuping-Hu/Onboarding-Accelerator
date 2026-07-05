import type { AiUsageStats, ChatMessage, SourceProvenance } from '@onboarding/shared';

export interface OpenAiServiceConfig {
  apiKey?: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
  inputCostPer1MTokens?: number;
  outputCostPer1MTokens?: number;
}

export interface OpenAiAnswer {
  content: string;
  usage?: AiUsageStats;
}

export interface AnswerProvider {
  answer(input: {
    prompt: string;
    sources: SourceProvenance[];
    chatHistory?: ChatMessage[];
    guideNodeIds?: string[];
  }): Promise<OpenAiAnswer | undefined>;
}

export class OpenAiService implements AnswerProvider {
  constructor(private readonly config: OpenAiServiceConfig) {}

  async answer(input: {
    prompt: string;
    sources: SourceProvenance[];
    chatHistory?: ChatMessage[];
    guideNodeIds?: string[];
  }): Promise<OpenAiAnswer | undefined> {
    if (!this.config.apiKey) {
      return undefined;
    }

    const response = await fetchWithRetries(
      'https://api.openai.com/v1/responses',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          input: [
            {
              role: 'system',
              content:
                'You are an onboarding assistant. Answer clearly, cite the supplied source titles inline, use only grounded context when provided, and say when the information is missing instead of inventing it.',
            },
            ...formatHistory(input.chatHistory),
            {
              role: 'user',
              content: buildGroundedPrompt(input.prompt, input.sources, input.guideNodeIds ?? []),
            },
          ],
        }),
      },
      {
        timeoutMs: this.config.timeoutMs,
        maxRetries: this.config.maxRetries,
      },
    );

    if (!response.ok) {
      throw new Error(`OpenAI request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as OpenAiResponse;
    const content = extractOutputText(payload);

    if (!content) {
      return undefined;
    }

    return {
      content,
      usage: extractUsageStats(payload, this.config),
    };
  }
}

interface OpenAiResponse {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
    }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}

function formatHistory(chatHistory: ChatMessage[] = []) {
  return chatHistory.slice(-8).map((message) => ({
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: message.content,
  }));
}

function buildGroundedPrompt(
  prompt: string,
  sources: SourceProvenance[],
  guideNodeIds: string[],
): string {
  const sourceContext =
    sources.length > 0
      ? sources
          .slice(0, 5)
          .map(
            (source, index) =>
              `${index + 1}. ${source.title}\n${source.excerpt}\nURI: ${source.uri ?? 'not provided'}`,
          )
          .join('\n\n')
      : 'No onboarding sources were retrieved.';
  const guideContext =
    guideNodeIds.length > 0 ? `\n\nRelated visual guide node IDs: ${guideNodeIds.join(', ')}` : '';

  return `Question: ${prompt}\n\nGrounding context:\n${sourceContext}${guideContext}`;
}

async function fetchWithRetries(
  url: string,
  init: RequestInit,
  options: { timeoutMs: number; maxRetries: number },
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (response.ok || !isRetryableStatus(response.status) || attempt === options.maxRetries) {
        return response;
      }
      lastError = new Error(`OpenAI retryable status ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === options.maxRetries) {
        throw error;
      }
    } finally {
      clearTimeout(timeout);
    }

    await delay(250 * 2 ** attempt);
  }

  throw lastError instanceof Error ? lastError : new Error('OpenAI request failed');
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractOutputText(payload: OpenAiResponse): string | undefined {
  if (payload.output_text?.trim()) {
    return payload.output_text.trim();
  }

  return payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .filter((text): text is string => Boolean(text?.trim()))
    .join('\n')
    .trim();
}

function extractUsageStats(
  payload: OpenAiResponse,
  config: OpenAiServiceConfig,
): AiUsageStats | undefined {
  if (!payload.usage) {
    return undefined;
  }

  const inputTokens = toSafeInteger(payload.usage.input_tokens);
  const outputTokens = toSafeInteger(payload.usage.output_tokens);
  const totalTokens = toSafeInteger(payload.usage.total_tokens) || inputTokens + outputTokens;

  return {
    model: config.model,
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedFeeUsd: calculateEstimatedFeeUsd(inputTokens, outputTokens, config),
  };
}

function calculateEstimatedFeeUsd(
  inputTokens: number,
  outputTokens: number,
  config: OpenAiServiceConfig,
): number {
  const inputFee = (inputTokens / 1_000_000) * (config.inputCostPer1MTokens ?? 0);
  const outputFee = (outputTokens / 1_000_000) * (config.outputCostPer1MTokens ?? 0);
  return Number((inputFee + outputFee).toFixed(8));
}

function toSafeInteger(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}
