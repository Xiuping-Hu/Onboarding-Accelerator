import { openAiFetch } from './infrastructure/ai/providerFetch';

export interface EmbeddingProvider {
  embed(text: string): Promise<number[] | undefined>;
}

export class LocalHashEmbeddingService implements EmbeddingProvider {
  constructor(private readonly dimensions = 1536) {}

  async embed(text: string): Promise<number[]> {
    const vector = Array.from({ length: this.dimensions }, () => 0);
    const terms = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

    for (const term of terms) {
      const hash = hashTerm(term);
      const index = hash % this.dimensions;
      vector[index] = (vector[index] ?? 0) + 1;
    }

    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    return magnitude > 0 ? vector.map((value) => value / magnitude) : vector;
  }
}

export class OpenAiEmbeddingService implements EmbeddingProvider {
  constructor(
    private readonly config: {
      apiKey?: string;
      model: string;
      timeoutMs: number;
      maxRetries: number;
    },
  ) {}

  async embed(text: string): Promise<number[] | undefined> {
    if (!this.config.apiKey) {
      return undefined;
    }

    const response = await fetchWithRetries(
      'https://api.openai.com/v1/embeddings',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          input: text,
        }),
      },
      {
        timeoutMs: this.config.timeoutMs,
        maxRetries: this.config.maxRetries,
      },
    );

    if (!response.ok) {
      throw new Error(await openAiErrorMessage(response, 'embeddings'));
    }

    const payload = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };

    return payload.data?.[0]?.embedding;
  }
}

async function openAiErrorMessage(response: Response, operation: string): Promise<string> {
  const payload = (await response.json().catch(() => undefined)) as
    | { error?: { code?: string; message?: string; type?: string } }
    | undefined;
  const detail = payload?.error?.code ?? payload?.error?.type ?? payload?.error?.message;
  return `OpenAI ${operation} request failed with status ${response.status}${detail ? ` (${detail})` : ''}`;
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
      const response = await openAiFetch(url, { ...init, signal: controller.signal });
      if (response.ok || !isRetryableStatus(response.status) || attempt === options.maxRetries) {
        return response;
      }
      lastError = new Error(`OpenAI embeddings retryable status ${response.status}`);
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

  throw lastError instanceof Error ? lastError : new Error('OpenAI embeddings request failed');
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashTerm(term: string): number {
  let hash = 2166136261;
  for (let index = 0; index < term.length; index += 1) {
    hash ^= term.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
