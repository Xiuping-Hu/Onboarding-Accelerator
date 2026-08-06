import { estimateTokenCount } from './chunker';
import type { CanonicalManifest, IngestionChunk, IngestionSource } from './types';
import type { CurrentSourceState } from './sourceVersionWriter';

export interface CandidateValidationResult {
  outcome: 'valid' | 'requires_review' | 'invalid';
  reasons: string[];
  summary: Record<string, unknown>;
}

export function validateCandidate(
  source: IngestionSource,
  manifest: CanonicalManifest,
  chunks: IngestionChunk[],
  previous: CurrentSourceState,
  complete: boolean,
  maximumTokens = 650,
): CandidateValidationResult {
  const invalidReasons: string[] = [];
  const reviewReasons: string[] = [];

  if (!complete) invalidReasons.push('crawl_incomplete');
  if (!manifest.documentCount || !manifest.characterCount) invalidReasons.push('empty_extraction');
  if (!chunks.length) invalidReasons.push('empty_chunks');
  if (chunks.some((chunk) => estimateTokenCount(chunk.text) > maximumTokens)) {
    invalidReasons.push('chunk_token_limit_exceeded');
  }
  if (
    chunks.some(
      (chunk) =>
        !chunk.metadata.sourceId ||
        !chunk.metadata.documentKey ||
        !chunk.metadata.accessScope ||
        !chunk.metadata.contentHash,
    )
  ) {
    invalidReasons.push('chunk_provenance_missing');
  }

  const maximumReductionRatio = source.validation?.maximumReductionRatio ?? 0.5;
  if (
    previous.documentCount > 0 &&
    manifest.documentCount < previous.documentCount * (1 - maximumReductionRatio)
  ) {
    reviewReasons.push('document_count_reduction');
  }
  if (
    previous.characterCount > 0 &&
    manifest.characterCount < previous.characterCount * (1 - maximumReductionRatio)
  ) {
    reviewReasons.push('character_count_reduction');
  }
  if (
    source.publicationPolicy === 'manual_review' ||
    source.validation?.requireManualReview === true
  ) {
    reviewReasons.push('publication_policy_requires_review');
  }

  const reasons = [...invalidReasons, ...reviewReasons];
  return {
    outcome: invalidReasons.length ? 'invalid' : reviewReasons.length ? 'requires_review' : 'valid',
    reasons,
    summary: {
      complete,
      outcome: invalidReasons.length
        ? 'invalid'
        : reviewReasons.length
          ? 'requires_review'
          : 'valid',
      reasons,
      manifestHash: manifest.hash,
      documentCount: manifest.documentCount,
      characterCount: manifest.characterCount,
      chunkCount: chunks.length,
      previousDocumentCount: previous.documentCount,
      previousCharacterCount: previous.characterCount,
    },
  };
}
