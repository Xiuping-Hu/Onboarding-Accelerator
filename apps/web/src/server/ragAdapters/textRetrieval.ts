import { createHash } from 'node:crypto';
import { basename, relative } from 'node:path';
import type { SourceProvenance } from '@onboarding/shared';

export interface TextChunk {
  sourceId: string;
  title: string;
  text: string;
  uri: string;
  sourceType: 'knowledge_base' | 'web';
  metadata?: Record<string, string | number | boolean | undefined>;
}

export function chunkText(
  sourceId: string,
  title: string,
  text: string,
  uri: string,
  sourceType: 'knowledge_base' | 'web',
  maxChunks: number,
  metadata: Record<string, string | number | boolean | undefined> = {},
): TextChunk[] {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  if (!normalized) {
    return [];
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs.length > 0 ? paragraphs : [normalized]) {
    if (`${current}\n\n${paragraph}`.trim().length > 900 && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = `${current}\n\n${paragraph}`.trim();
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.slice(0, maxChunks).map((chunk, index) => ({
    sourceId,
    title,
    text: chunk,
    uri,
    sourceType,
    metadata: {
      ...metadata,
      chunkIndex: index,
    },
  }));
}

export function rankChunks(query: string, chunks: TextChunk[], limit = 5): SourceProvenance[] {
  const terms = tokenize(query);

  return chunks
    .map((chunk) => {
      const haystack = `${chunk.title} ${chunk.text}`.toLowerCase();
      const matches = terms.filter((term) => haystack.includes(term));
      const titleMatches = terms.filter((term) => chunk.title.toLowerCase().includes(term));
      const score =
        terms.length === 0
          ? 0.2
          : Math.min(0.98, 0.12 + matches.length * 0.12 + titleMatches.length * 0.08);

      return {
        id: `${chunk.sourceId}#chunk-${chunk.metadata?.chunkIndex ?? 0}`,
        title: chunk.title,
        excerpt: excerptFor(chunk.text, terms),
        uri: chunk.uri,
        sourceType: chunk.sourceType,
        score,
        confidence: score,
        metadata: chunk.metadata,
      };
    })
    .filter((source) => terms.length === 0 || (source.score ?? 0) > 0.12)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);
}

export function sourceIdForUri(prefix: string, uri: string): string {
  return `${prefix}:${createHash('sha1').update(uri).digest('hex').slice(0, 12)}`;
}

export function titleFromPath(root: string, filePath: string): string {
  const name = root ? relative(root, filePath) : basename(filePath);
  return name.replace(/\\/g, '/');
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function extractTitleFromHtml(html: string, fallback: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim() || fallback;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2);
}

function excerptFor(text: string, terms: string[]): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  const lower = compact.toLowerCase();
  const firstMatch = terms.map((term) => lower.indexOf(term)).find((index) => index >= 0) ?? 0;
  const start = Math.max(0, firstMatch - 80);
  return compact.slice(start, start + 360);
}
