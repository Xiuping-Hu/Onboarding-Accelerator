import { createHash } from 'node:crypto';
import type { IngestionChunk, IngestionDocument } from './types';

const targetChunkCharacters = 900;

export function chunkDocument(document: IngestionDocument): IngestionChunk[] {
  const text = normalizeText(document.text);
  if (!text) {
    return [];
  }

  const sections = text
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const section of sections.length ? sections : [text]) {
    if (current && `${current}\n\n${section}`.length > targetChunkCharacters) {
      chunks.push(current);
      current = section;
    } else {
      current = `${current}\n\n${section}`.trim();
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.map((chunk, chunkIndex) => {
    const sourceVersion = document.updatedAt;
    return {
      id: deterministicChunkId(document.source.uri, sourceVersion, chunkIndex),
      title: document.title,
      text: chunk,
      uri: document.source.uri,
      metadata: {
        sourceId: document.source.id,
        rootSourceId: document.source.metadata?.rootSourceId ?? document.source.id,
        sourceKind: document.source.kind,
        sourceUri: document.source.uri,
        sourceTitle: document.title,
        owner: document.source.owner,
        accessScope: document.source.accessScope,
        refreshCadence: document.source.refreshCadence ?? 'manual',
        version: sourceVersion,
        updatedAt: document.updatedAt,
        crawledAt: new Date().toISOString(),
        chunkIndex,
        ...document.source.metadata,
        ...document.metadata,
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

function deterministicChunkId(uri: string, version: string, chunkIndex: number): string {
  return `rag:${createHash('sha256').update(`${uri}\n${version}\n${chunkIndex}`).digest('hex')}`;
}
