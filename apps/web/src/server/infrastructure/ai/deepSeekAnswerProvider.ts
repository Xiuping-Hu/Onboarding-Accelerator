import type { AiUsageStats } from '@onboarding/shared';
import type { AnswerProvider, AnswerRequest, AnswerResult } from '../../core/ports/answerProvider';
import {
  buildGroundedPrompt,
  formatGroundedHistory,
  onboardingSystemPrompt,
} from './groundedPrompt';
import { deepSeekFetch } from './providerFetch';

export interface DeepSeekAnswerProviderConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
  fetch?: typeof deepSeekFetch;
}

export class DeepSeekAnswerProvider implements AnswerProvider {
  constructor(private readonly config: DeepSeekAnswerProviderConfig) {}

  async answer(input: AnswerRequest): Promise<AnswerResult | undefined> {
    if (!this.config.apiKey) return undefined;

    const response = await fetchWithRetries(
      `${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: onboardingSystemPrompt },
            ...formatGroundedHistory(input.chatHistory),
            {
              role: 'user',
              content: buildGroundedPrompt(input.prompt, input.sources, input.guideNodeIds ?? []),
            },
          ],
          thinking: { type: 'disabled' },
          stream: false,
        }),
      },
      { timeoutMs: this.config.timeoutMs, maxRetries: this.config.maxRetries },
      this.config.fetch ?? deepSeekFetch,
    );

    if (!response.ok) throw new Error(`DeepSeek request failed with status ${response.status}`);
    const payload = (await response.json()) as DeepSeekResponse;
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) return undefined;

    return { content, usage: extractUsage(payload, this.config.model) };
  }
}

interface DeepSeekResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

async function fetchWithRetries(
  url: string,
  init: RequestInit,
  options: { timeoutMs: number; maxRetries: number },
  fetchImpl: typeof deepSeekFetch,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetchImpl(url, { ...init, signal: controller.signal });
      if (response.ok || !isRetryable(response.status) || attempt === options.maxRetries) {
        return response;
      }
      lastError = new Error(`DeepSeek retryable status ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === options.maxRetries) throw error;
    } finally {
      clearTimeout(timeout);
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  throw lastError instanceof Error ? lastError : new Error('DeepSeek request failed');
}

function isRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function extractUsage(payload: DeepSeekResponse, model: string): AiUsageStats | undefined {
  if (!payload.usage) return undefined;
  const inputTokens = safeInteger(payload.usage.prompt_tokens);
  const outputTokens = safeInteger(payload.usage.completion_tokens);
  return {
    model,
    inputTokens,
    outputTokens,
    totalTokens: safeInteger(payload.usage.total_tokens) || inputTokens + outputTokens,
  };
}

function safeInteger(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}
