import assert from 'node:assert/strict';
import test from 'node:test';
import { chunkDocument, estimateTokenCount } from './chunker';
import { buildCanonicalManifest } from './canonicalManifest';

void test('chunkDocument produces stable IDs and source provenance metadata', () => {
  const document = {
    source: {
      id: 'wayfinder',
      kind: 'sharepoint_page' as const,
      uri: 'https://taxconsultingza.sharepoint.com/SitePages/Wayfinder.aspx',
      owner: 'Knowledge Owner',
      accessScope: 'all_users',
    },
    title: 'Wayfinder',
    text: 'Welcome to Wayfinder.\n\nFind your department policies here.',
    updatedAt: '2026-07-12T00:00:00.000Z',
  };

  const first = chunkDocument(document);
  const second = chunkDocument(document);

  assert.equal(first.length, 1);
  assert.equal(first[0]?.id, second[0]?.id);
  assert.equal(first[0]?.metadata.accessScope, 'all_users');
  assert.equal(first[0]?.metadata.sourceKind, 'sharepoint_page');
});

void test('chunkDocument enforces the hard token limit for oversized paragraphs', () => {
  const document = buildCanonicalManifest([
    {
      source: {
        id: 'large-document',
        kind: 'document' as const,
        uri: 'file:///large.md',
        owner: 'Knowledge Owner',
        accessScope: 'all_users',
      },
      title: 'Large document',
      text: `# Long section\n\n${Array.from({ length: 1800 }, (_, index) => `word${index}.`).join(' ')}`,
      updatedAt: '2026-08-05T00:00:00.000Z',
    },
  ]).documents[0];
  assert.ok(document);

  const chunks = chunkDocument(document, {
    targetTokens: 120,
    maximumTokens: 180,
    overlapTokens: 20,
    minimumTokens: 40,
  });

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => estimateTokenCount(chunk.text) <= 180));
  assert.ok(chunks.every((chunk) => chunk.metadata.documentKey));
  assert.ok(chunks.every((chunk) => chunk.metadata.chunkerVersion === 'structure-v1'));
});

void test('canonical chunk identity ignores crawl timestamp changes', () => {
  const source = {
    id: 'website',
    kind: 'website' as const,
    uri: 'https://example.test/guide',
    owner: 'Knowledge Owner',
    accessScope: 'all_users',
  };
  const firstDocument = buildCanonicalManifest([
    {
      source,
      title: 'Guide',
      text: '# Start\n\nUse the approved process.',
      updatedAt: '2026-08-05T00:00:00.000Z',
    },
  ]).documents[0];
  const secondDocument = buildCanonicalManifest([
    {
      source,
      title: 'Guide',
      text: '# Start\n\nUse the approved process.',
      updatedAt: '2026-08-06T00:00:00.000Z',
    },
  ]).documents[0];
  assert.ok(firstDocument && secondDocument);

  assert.equal(chunkDocument(firstDocument)[0]?.id, chunkDocument(secondDocument)[0]?.id);
});
