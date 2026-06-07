import type { SourceProvenance } from '@onboarding/shared';

export interface WebSearchProvider {
  search(query: string): Promise<SourceProvenance[]>;
}

export class DisabledWebSearchProvider implements WebSearchProvider {
  async search(): Promise<SourceProvenance[]> {
    return [];
  }
}

export class PolicyAwareWebSearchProvider implements WebSearchProvider {
  constructor(private readonly allowed: boolean) {}

  async search(query: string): Promise<SourceProvenance[]> {
    if (!this.allowed) {
      return [];
    }

    return [
      {
        id: `web:${slugify(query)}`,
        title: `Web context for ${query}`,
        excerpt:
          'Web search is enabled by policy for this session. Connect a production search API here to replace this provider.',
        uri: `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
        sourceType: 'web',
        score: 0.45,
        confidence: 0.45,
      },
    ];
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}
