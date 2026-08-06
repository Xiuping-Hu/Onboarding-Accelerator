import { createHash } from 'node:crypto';
import { normalizeText } from './chunker';
import type { CanonicalManifest, IngestionDocument } from './types';

export function buildCanonicalManifest(documents: IngestionDocument[]): CanonicalManifest {
  const canonicalDocuments = documents
    .map(canonicalizeDocument)
    .sort((left, right) => documentKey(left).localeCompare(documentKey(right)));
  const hash = sha256(
    canonicalDocuments
      .map((document) => `${documentKey(document)}\n${document.contentHash ?? ''}`)
      .join('\n\n'),
  );

  return {
    hash,
    documents: canonicalDocuments.map((document) => ({ ...document, versionKey: hash })),
    documentCount: canonicalDocuments.length,
    characterCount: canonicalDocuments.reduce((total, document) => total + document.text.length, 0),
  };
}

export function canonicalizeDocument(document: IngestionDocument): IngestionDocument {
  const text = normalizeText(document.text);
  const canonicalUri = document.canonicalUri ?? document.source.uri;
  const key = document.documentKey?.trim() || stableDocumentKey(document.source.id, canonicalUri);
  const stableMetadata = canonicalMetadata(document.metadata);
  const contentHash = sha256(
    JSON.stringify({
      title: document.title.trim(),
      text,
      mediaType: document.mediaType ?? 'text/plain',
      metadata: stableMetadata,
    }),
  );

  return {
    ...document,
    documentKey: key,
    canonicalUri,
    text,
    mediaType: document.mediaType ?? 'text/plain',
    contentHash,
  };
}

export function documentKey(document: IngestionDocument): string {
  return (
    document.documentKey ??
    stableDocumentKey(document.source.id, document.canonicalUri ?? document.source.uri)
  );
}

function canonicalMetadata(
  metadata: IngestionDocument['metadata'],
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(metadata ?? {})
      .filter(([key]) => !['crawledAt', 'fetchedAt', 'etag', 'lastModified'].includes(key))
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function stableDocumentKey(sourceId: string, uri: string): string {
  return `${sourceId}:${sha256(uri).slice(0, 24)}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
