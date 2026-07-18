import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@/generated/prisma/client';
import { PrismaKnowledgeMapRepository } from './knowledgeMapService';

void test('knowledge map proposals group current source versions into grounded domains', async () => {
  const sources = [
    {
      id: 'source-a',
      title: 'Access setup',
      owner: 'IT',
      currentVersion: { id: 'version-a' },
    },
    {
      id: 'source-b',
      title: 'First workflow',
      owner: 'Operations',
      currentVersion: { id: 'version-b' },
    },
  ];
  const excerpts: Record<string, string> = {
    'source-a': 'Request access and confirm the approved systems.',
    'source-b': 'Complete the first reviewed workflow.',
  };
  let chunkIndex = 0;
  const db = {
    knowledgeSource: { findMany: async () => sources },
    knowledgeChunk: {
      findFirst: async () => ({ excerpt: excerpts[sources[chunkIndex++]?.id ?? ''] }),
    },
  } as unknown as PrismaClient;

  const draft = await new PrismaKnowledgeMapRepository(db).proposeFromSources('First week', [
    'source-a',
    'source-b',
  ]);

  assert.equal(draft.nodes.length, 4);
  assert.deepEqual(
    draft.nodes.filter((node) => !node.clientKey.includes('-source-')).map((node) => node.title),
    ['Tools & Access', 'Workflows & Operations'],
  );
  const accessNode = draft.nodes.find((node) => node.title === 'Access setup');
  assert.equal(accessNode?.evidence[0]?.sourceVersionId, 'version-a');
  assert.equal(accessNode?.evidence[0]?.role, 'authoritative');
  assert.equal(draft.edges.length, 2);
  assert.ok(draft.edges.every((edge) => edge.relationship === 'contains'));
});
