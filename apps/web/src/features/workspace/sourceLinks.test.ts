import assert from 'node:assert/strict';
import test from 'node:test';
import type { KnowledgeSource } from '@onboarding/shared';
import { getDisplaySourceState, isSafeMarkdownHref, isSafeResolvedSourceHref } from './sourceLinks';

void test('normalizes unique clickable resources and preserves source order', () => {
  const sources: KnowledgeSource[] = [
    {
      id: 'handbook#chunk-1',
      title: 'Handbook first chunk',
      excerpt: 'First excerpt',
      href: '/api/sources/handbook',
      sourceType: 'knowledge_base',
      metadata: { rootSourceId: 'handbook' },
    },
    {
      id: 'handbook#chunk-2',
      title: 'Handbook second chunk',
      excerpt: 'Second excerpt',
      href: '/api/sources/handbook',
      sourceType: 'knowledge_base',
      metadata: { rootSourceId: 'handbook' },
    },
    {
      id: 'web-source',
      title: 'External policy',
      excerpt: 'Policy excerpt',
      href: 'https://example.com/policy',
      sourceType: 'web',
    },
  ];

  const state = getDisplaySourceState(sources);

  assert.equal(state.status, 'ready');
  assert.equal(state.links.length, 2);
  assert.equal(state.links[0]?.title, 'Handbook first chunk');
  assert.equal(state.links[1]?.label, 'example.com');
});

void test('fails the complete source set when one source is not clickable', () => {
  const state = getDisplaySourceState([
    {
      id: 'safe',
      title: 'Safe',
      excerpt: 'Safe source',
      href: 'https://example.com',
    },
    { id: 'missing', title: 'Missing', excerpt: 'No link' },
  ]);

  assert.deepEqual(state, { status: 'error', links: [] });
});

void test('applies distinct URL policies to generated Markdown and resolved sources', () => {
  assert.equal(isSafeMarkdownHref('https://example.com/path'), true);
  assert.equal(isSafeMarkdownHref('http://example.com/path'), true);
  assert.equal(isSafeMarkdownHref('/workspace/source'), false);
  assert.equal(isSafeMarkdownHref('javascript:alert(1)'), false);
  assert.equal(isSafeMarkdownHref('file:///secret.txt'), false);

  assert.equal(isSafeResolvedSourceHref('/api/sources/source-1'), true);
  assert.equal(isSafeResolvedSourceHref('//example.com/source-1'), false);
  assert.equal(isSafeResolvedSourceHref('kb://source-1'), false);
});
