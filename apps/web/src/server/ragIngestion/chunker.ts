import { createHash } from 'node:crypto';
import type { IngestionChunk, IngestionDocument } from './types';

export const chunkerVersion = 'structure-v1';

export interface ChunkingOptions {
  targetTokens: number;
  maximumTokens: number;
  overlapTokens: number;
  minimumTokens: number;
}

const defaultOptions: ChunkingOptions = {
  targetTokens: 400,
  maximumTokens: 650,
  overlapTokens: 50,
  minimumTokens: 80,
};

interface StructuralBlock {
  text: string;
  headingPath: string[];
  sectionKey: string;
}

interface DraftChunk extends StructuralBlock {
  occurrence: number;
}

export function chunkDocument(
  document: IngestionDocument,
  options: ChunkingOptions = defaultOptions,
): IngestionChunk[] {
  validateOptions(options);
  const text = normalizeText(document.text);
  if (!text) return [];

  const blocks = parseStructuralBlocks(text).flatMap((block) =>
    splitOversizedBlock(block, options),
  );
  const drafts = groupBlocks(blocks, options).flatMap((draft) => {
    const headingPath = draft.headingPath.join(' > ');
    const context = boundedContext(
      document.title,
      headingPath,
      Math.max(8, Math.floor(options.maximumTokens / 4)),
    );
    const prefixTokens = estimateTokenCount(context);
    const availableTokens = Math.max(1, options.maximumTokens - prefixTokens - 2);
    return estimateTokenCount(draft.text) <= availableTokens
      ? [draft]
      : hardSplit(draft, availableTokens).map((part) => ({
          ...part,
          occurrence: draft.occurrence,
        }));
  });
  const documentKey =
    document.documentKey ??
    shortHash(`${document.source.id}\n${document.canonicalUri ?? document.source.uri}`);
  const versionKey = document.versionKey ?? document.contentHash ?? document.updatedAt;
  const uri = document.canonicalUri ?? document.source.uri;
  const occurrences = new Map<string, number>();

  return drafts.map((draft, chunkIndex) => {
    const headingPath = draft.headingPath.join(' > ');
    const context = boundedContext(
      document.title,
      headingPath,
      Math.max(8, Math.floor(options.maximumTokens / 4)),
    );
    const contextualText = addContextPrefix(context, draft.text);
    const contentHash = shortHash(contextualText, 64);
    const occurrence = occurrences.get(contentHash) ?? 0;
    occurrences.set(contentHash, occurrence + 1);
    const reservedMetadata = {
      sourceId: document.source.id,
      rootSourceId: document.source.metadata?.rootSourceId ?? document.source.id,
      sourceKind: document.source.kind,
      sourceUri: uri,
      sourceTitle: document.title,
      owner: document.source.owner,
      accessScope: document.source.accessScope,
      refreshCadence: document.source.refreshCadence ?? 'manual',
      version: versionKey,
      updatedAt: document.updatedAt,
      crawledAt: new Date().toISOString(),
      documentKey,
      section: headingPath || document.title,
      sectionKey: draft.sectionKey,
      chunkIndex,
      chunkerVersion,
      contentHash,
      tokenCount: estimateTokenCount(contextualText),
    };

    return {
      id: deterministicChunkId(
        document.source.id,
        versionKey,
        documentKey,
        draft.sectionKey,
        contentHash,
        occurrence,
      ),
      title: document.title,
      text: contextualText,
      uri,
      metadata: {
        ...document.source.metadata,
        ...document.metadata,
        ...reservedMetadata,
      },
    };
  });
}

export function normalizeText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function estimateTokenCount(value: string): number {
  if (!value.trim()) return 0;
  const lexicalUnits = value.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu)?.length ?? 0;
  return Math.max(1, Math.ceil(value.length / 4), Math.ceil(lexicalUnits * 1.15));
}

function parseStructuralBlocks(text: string): StructuralBlock[] {
  const sections = text
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean);
  const headings: string[] = [];
  const blocks: StructuralBlock[] = [];
  let sectionSequence = 0;

  for (const section of sections.length ? sections : [text]) {
    const lines = section.split('\n');
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(lines[0] ?? '');
    if (headingMatch) {
      const level = headingMatch[1]?.length ?? 1;
      headings.splice(level - 1);
      headings[level - 1] = headingMatch[2]?.trim() ?? '';
    }
    const headingPath = headings.filter(Boolean);
    const sectionText = headingMatch ? lines.slice(1).join('\n').trim() : section;
    if (!sectionText) continue;
    const anchor = headingPath.length ? headingPath.join(' > ') : `section-${sectionSequence}`;
    blocks.push({
      text: sectionText,
      headingPath,
      sectionKey: `${slug(anchor)}-${sectionSequence}`,
    });
    sectionSequence += 1;
  }

  return blocks;
}

function splitOversizedBlock(block: StructuralBlock, options: ChunkingOptions): StructuralBlock[] {
  if (estimateTokenCount(block.text) <= options.maximumTokens) return [block];

  const sentences = sentenceSegments(block.text);
  if (sentences.length > 1) {
    return packSegments(sentences, block, options.maximumTokens).flatMap((candidate) =>
      estimateTokenCount(candidate.text) <= options.maximumTokens
        ? [candidate]
        : hardSplit(candidate, options.maximumTokens),
    );
  }

  return hardSplit(block, options.maximumTokens);
}

function groupBlocks(blocks: StructuralBlock[], options: ChunkingOptions): DraftChunk[] {
  const chunks: DraftChunk[] = [];
  let current: StructuralBlock | undefined;

  for (const block of blocks) {
    const combined = current ? `${current.text}\n\n${block.text}` : block.text;
    const headingChanged =
      current && current.headingPath.join('\n') !== block.headingPath.join('\n');
    if (
      current &&
      (estimateTokenCount(combined) > options.targetTokens ||
        (headingChanged && estimateTokenCount(current.text) >= options.minimumTokens))
    ) {
      chunks.push({ ...current, occurrence: chunks.length });
      const overlap = tailWithinTokens(current.text, options.overlapTokens);
      const withOverlap = overlap ? `${overlap}\n\n${block.text}` : block.text;
      current = {
        ...block,
        text: estimateTokenCount(withOverlap) <= options.maximumTokens ? withOverlap : block.text,
      };
    } else {
      current = current
        ? {
            text: combined,
            headingPath: block.headingPath,
            sectionKey: `${current.sectionKey}--${block.sectionKey}`,
          }
        : block;
    }
  }

  if (current) chunks.push({ ...current, occurrence: chunks.length });
  return chunks;
}

function packSegments(
  segments: string[],
  block: StructuralBlock,
  maximumTokens: number,
): StructuralBlock[] {
  const results: StructuralBlock[] = [];
  let current = '';
  for (const segment of segments) {
    const combined = `${current} ${segment}`.trim();
    if (current && estimateTokenCount(combined) > maximumTokens) {
      results.push({ ...block, text: current });
      current = segment;
    } else {
      current = combined;
    }
  }
  if (current) results.push({ ...block, text: current });
  return results;
}

function hardSplit(block: StructuralBlock, maximumTokens: number): StructuralBlock[] {
  const words = block.text.split(/\s+/).filter(Boolean);
  const results: StructuralBlock[] = [];
  let current: string[] = [];
  for (const word of words) {
    if (estimateTokenCount(word) > maximumTokens) {
      if (current.length) {
        results.push({ ...block, text: current.join(' ') });
        current = [];
      }
      const characterBudget = Math.max(1, maximumTokens * 3);
      for (let index = 0; index < word.length; index += characterBudget) {
        results.push({ ...block, text: word.slice(index, index + characterBudget) });
      }
      continue;
    }
    const combined = [...current, word].join(' ');
    if (current.length && estimateTokenCount(combined) > maximumTokens) {
      results.push({ ...block, text: current.join(' ') });
      current = [word];
    } else {
      current.push(word);
    }
  }
  if (current.length) results.push({ ...block, text: current.join(' ') });
  return results;
}

function sentenceSegments(text: string): string[] {
  return (
    text
      .match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)
      ?.map((value) => value.trim())
      .filter(Boolean) ?? [text]
  );
}

function tailWithinTokens(text: string, maximumTokens: number): string {
  if (maximumTokens <= 0) return '';
  const words = text.split(/\s+/).filter(Boolean);
  let result = '';
  for (let index = words.length - 1; index >= 0; index -= 1) {
    const candidate = `${words[index]} ${result}`.trim();
    if (estimateTokenCount(candidate) > maximumTokens) break;
    result = candidate;
  }
  return result;
}

function addContextPrefix(context: string, text: string): string {
  if (!context || text.startsWith(context)) return text;
  return `${context}\n\n${text}`;
}

function boundedContext(title: string, headingPath: string, maximumTokens: number): string {
  const context = [title.trim(), headingPath.trim()].filter(Boolean).join(' > ');
  if (estimateTokenCount(context) <= maximumTokens) return context;
  const words = context.split(/\s+/).filter(Boolean);
  let result = '';
  for (const word of words) {
    const candidate = `${result} ${word}`.trim();
    if (estimateTokenCount(candidate) > maximumTokens) break;
    result = candidate;
  }
  if (result) return result;
  return context.slice(0, Math.max(1, maximumTokens * 3));
}

function deterministicChunkId(
  sourceId: string,
  versionKey: string,
  documentKey: string,
  sectionKey: string,
  contentHash: string,
  occurrence: number,
): string {
  return `rag:${shortHash(
    [sourceId, versionKey, documentKey, sectionKey, contentHash, occurrence, chunkerVersion].join(
      '\n',
    ),
    64,
  )}`;
}

function shortHash(value: string, length = 24): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'section'
  );
}

function validateOptions(options: ChunkingOptions): void {
  if (
    options.minimumTokens <= 0 ||
    options.targetTokens < options.minimumTokens ||
    options.maximumTokens < options.targetTokens ||
    options.overlapTokens < 0 ||
    options.overlapTokens >= options.maximumTokens
  ) {
    throw new Error('Invalid chunking options.');
  }
}
