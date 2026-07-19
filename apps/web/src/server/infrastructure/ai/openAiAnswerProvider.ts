import type { AiUsageStats } from '@onboarding/shared';
import type { AnswerProvider, AnswerRequest, AnswerResult } from '../../core/ports/answerProvider';
import {
  buildGroundedPrompt,
  formatGroundedHistory,
  onboardingSystemPrompt,
} from './groundedPrompt';
import { openAiFetch } from './providerFetch';

export interface OpenAiAnswerProviderConfig {
  apiKey?: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
  fetch?: typeof openAiFetch;
}

export class OpenAiAnswerProvider implements AnswerProvider {
  constructor(private readonly config: OpenAiAnswerProviderConfig) {}

  async answer(input: AnswerRequest): Promise<AnswerResult | undefined> {
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
              content: onboardingSystemPrompt,
            },
            ...formatGroundedHistory(input.chatHistory),
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
      this.config.fetch ?? openAiFetch,
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

async function fetchWithRetries(
  url: string,
  init: RequestInit,
  options: { timeoutMs: number; maxRetries: number },
  fetchImpl: typeof openAiFetch,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

    try {
      const response = await fetchImpl(url, { ...init, signal: controller.signal });
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
  config: OpenAiAnswerProviderConfig,
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
  };
}

function toSafeInteger(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}
