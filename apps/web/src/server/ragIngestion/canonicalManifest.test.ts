import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCanonicalManifest } from './canonicalManifest';

void test('canonical manifest is stable across crawl times and document order', () => {
  const source = {
    id: 'site',
    kind: 'website' as const,
    uri: 'https://example.test',
    owner: 'Owner',
    accessScope: 'all_users',
  };
  const first = buildCanonicalManifest([
    {
      source,
      documentKey: 'b',
      title: 'B',
      text: 'Second page',
      updatedAt: '2026-08-05T00:00:00.000Z',
      metadata: { crawledAt: '2026-08-05T00:00:00.000Z' },
    },
    {
      source,
      documentKey: 'a',
      title: 'A',
      text: 'First page',
      updatedAt: '2026-08-05T00:00:00.000Z',
    },
  ]);
  const second = buildCanonicalManifest([
    {
      source,
      documentKey: 'a',
      title: 'A',
      text: 'First page',
      updatedAt: '2026-08-06T00:00:00.000Z',
    },
    {
      source,
      documentKey: 'b',
      title: 'B',
      text: 'Second page',
      updatedAt: '2026-08-06T00:00:00.000Z',
      metadata: { crawledAt: '2026-08-06T00:00:00.000Z' },
    },
  ]);

  assert.equal(first.hash, second.hash);
  assert.deepEqual(
    first.documents.map((document) => document.documentKey),
    ['a', 'b'],
  );
});
