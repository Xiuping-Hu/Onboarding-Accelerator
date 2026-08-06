import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCanonicalManifest } from './canonicalManifest';
import { validateCandidate } from './candidateValidator';
import { chunkDocument } from './chunker';

void test('candidate validator quarantines a large unexpected reduction', () => {
  const source = {
    id: 'site',
    kind: 'website' as const,
    uri: 'https://example.test',
    owner: 'Owner',
    accessScope: 'all_users',
  };
  const manifest = buildCanonicalManifest([
    {
      source,
      title: 'Site',
      text: 'A short but valid replacement page.',
      updatedAt: '2026-08-05T00:00:00.000Z',
    },
  ]);
  const result = validateCandidate(
    source,
    manifest,
    manifest.documents.flatMap((document) => chunkDocument(document)),
    { documentCount: 4, characterCount: 1000, documents: [] },
    true,
  );

  assert.equal(result.outcome, 'requires_review');
  assert.ok(result.reasons.includes('document_count_reduction'));
  assert.ok(result.reasons.includes('character_count_reduction'));
});

void test('candidate validator rejects an incomplete crawl', () => {
  const source = {
    id: 'site',
    kind: 'website' as const,
    uri: 'https://example.test',
    owner: 'Owner',
    accessScope: 'all_users',
  };
  const manifest = buildCanonicalManifest([]);
  const result = validateCandidate(
    source,
    manifest,
    [],
    { documentCount: 1, characterCount: 100, documents: [] },
    false,
  );
  assert.equal(result.outcome, 'invalid');
  assert.ok(result.reasons.includes('crawl_incomplete'));
});
