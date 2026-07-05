export interface EmbeddingProvider {
  embed(text: string): Promise<number[] | undefined>;
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
      throw new Error(`OpenAI embeddings request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };

    return payload.data?.[0]?.embedding;
  }
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
