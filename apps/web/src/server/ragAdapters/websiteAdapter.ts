import type { SourceProvenance } from '@onboarding/shared';
import type { RagInput, RagInputAdapter, WebsiteAdapterOptions } from './types';
import {
  chunkText,
  extractTitleFromHtml,
  rankChunks,
  sourceIdForUri,
  stripHtml,
  type TextChunk,
} from './textRetrieval';

export class WebsiteAdapter implements RagInputAdapter {
  readonly id = 'website';
  readonly sourceKind = 'website';
  private readonly chunks = new Map<string, TextChunk[]>();
  private readonly fetchImpl: NonNullable<WebsiteAdapterOptions['fetch']>;

  constructor(private readonly options: WebsiteAdapterOptions) {
    this.fetchImpl = options.fetch ?? fetch;
  }

  canHandle(input: RagInput): boolean {
    return this.isAllowed(input.uri);
  }

  async load(input: RagInput): Promise<SourceProvenance[]> {
    if (!this.canHandle(input)) {
      return [];
    }

    const chunks = await this.fetchPage(input.uri);
    this.chunks.set(input.uri, chunks);
    return rankChunks('', chunks, this.options.maxChunksPerSource);
  }

  async retrieve(query: string): Promise<SourceProvenance[]> {
    for (const url of urlsFromText(query)) {
      if (this.isAllowed(url) && !this.chunks.has(url)) {
        this.chunks.set(url, await this.fetchPage(url));
      }
    }

    return rankChunks(query, [...this.chunks.values()].flat(), this.options.maxChunksPerSource);
  }

  private async fetchPage(uri: string): Promise<TextChunk[]> {
    const response = await this.fetchImpl(uri, { redirect: 'follow' });

    if (!response.ok) {
      return [];
    }

    const contentLength = Number.parseInt(response.headers.get('content-length') ?? '0', 10);

    if (contentLength > this.options.maxPageBytes) {
      return [];
    }

    const html = await response.text();

    if (html.length > this.options.maxPageBytes) {
      return [];
    }

    const title = extractTitleFromHtml(html, new URL(uri).hostname);
    const text = stripHtml(html);

    return chunkText(
      sourceIdForUri(this.id, uri),
      title,
      text,
      uri,
      'web',
      this.options.maxChunksPerSource,
      {
        adapterId: this.id,
        sourceKind: this.sourceKind,
        fetchedUrl: uri,
      },
    );
  }

  private isAllowed(uri: string): boolean {
    let url: URL;

    try {
      url = new URL(uri);
    } catch {
      return false;
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return false;
    }

    return this.options.allowlist.some((entry) => {
      if (entry === '*') {
        return true;
      }

      try {
        const allowed = new URL(entry);
        return url.origin === allowed.origin && url.pathname.startsWith(allowed.pathname);
      } catch {
        return url.hostname === entry || url.hostname.endsWith(`.${entry}`);
      }
    });
  }
}

function urlsFromText(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s)]+/g)].map((match) => match[0] as string);
}
