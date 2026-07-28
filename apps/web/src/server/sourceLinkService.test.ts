import assert from 'node:assert/strict';
import test from 'node:test';
import type { OnboardingSession, SourceProvenance } from '@onboarding/shared';
import { PERSISTED_SOURCE_EXCERPT, SourceLinkService } from './sourceLinkService';

const resolvedKnowledgeSource: SourceProvenance = {
  id: 'handbook',
  title: 'Employee handbook',
  excerpt: 'Approved handbook excerpt.',
  uri: 'kb://handbook',
  sourceType: 'knowledge_base',
};

function createService(resolved: SourceProvenance | null = resolvedKnowledgeSource) {
  return new SourceLinkService({ resolveSource: async () => resolved }, async () => ['all_users']);
}

void test('uses direct HTTP links and internal routes for resolved company sources', async () => {
  const service = createService();
  const result = await service.resolveSources(
    [
      {
        id: 'web',
        title: 'Web policy',
        excerpt: 'Public policy',
        uri: 'https://example.com/policy',
        sourceType: 'web',
      },
      resolvedKnowledgeSource,
    ],
    'user-1',
  );

  assert.equal(result.status, 'ready');
  assert.equal(result.sources[0]?.href, 'https://example.com/policy');
  assert.equal(result.sources[1]?.href, '/api/sources/handbook');
});

void test('reauthorizes and hydrates redacted historical source references', async () => {
  const service = createService();
  const session: OnboardingSession = {
    id: 'session-1',
    title: 'Plan',
    createdAt: '2026-07-28T00:00:00.000Z',
    updatedAt: '2026-07-28T00:00:00.000Z',
    settings: { webSearchEnabled: false },
    guide: { rootNodeIds: [], nodes: {}, expandedNodeIds: [] },
    chatHistory: [
      {
        id: 'message-1',
        role: 'assistant',
        content: 'Read the handbook.',
        createdAt: '2026-07-28T00:00:00.000Z',
        sources: [
          {
            id: 'handbook',
            title: 'Stored title',
            excerpt: PERSISTED_SOURCE_EXCERPT,
            sourceType: 'knowledge_base',
          },
        ],
      },
    ],
  };

  const hydrated = await service.hydrateSession(session, 'user-1');
  const source = hydrated.chatHistory[0]?.sources?.[0];

  assert.equal(source?.title, 'Employee handbook');
  assert.equal(source?.excerpt, 'Approved handbook excerpt.');
  assert.equal(source?.href, '/api/sources/handbook');
});

void test('fails closed without returning source metadata when resolution fails', async () => {
  const originalConsoleError = console.error;
  console.error = () => undefined;
  let result;
  try {
    result = await createService(null).resolveSources(
      [
        {
          id: 'missing',
          title: 'Stored title',
          excerpt: PERSISTED_SOURCE_EXCERPT,
        },
      ],
      'user-1',
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(result, { sources: [], status: 'unavailable' });
});
