import assert from 'node:assert/strict';
import test from 'node:test';
import type { Prisma } from '@/generated/prisma/client';
import type { PrismaDatabase } from '../infrastructure/prisma/prismaTypes';
import { writeKnowledgeChunks } from './knowledgeChunkWriter';

void test('writeKnowledgeChunks uses parameterized Prisma SQL for upsert and cleanup', async () => {
  const queries: Prisma.Sql[] = [];
  const db = {
    $executeRaw: async (query: Prisma.Sql) => {
      queries.push(query);
      return 1;
    },
  } as unknown as PrismaDatabase;

  await writeKnowledgeChunks(db, 'local:hash-v1:1536', 'wayfinder', [
    {
      chunk: {
        id: 'chunk-1',
        title: 'Wayfinder',
        text: 'First chunk',
        uri: 'https://example.test/wayfinder',
        metadata: { rootSourceId: 'wayfinder' },
      },
      embedding: [1, 0],
    },
  ]);

  assert.match(queries[0]?.sql ?? '', /on conflict \(id, embedding_profile\)/);
  assert.ok(queries[0]?.values.includes('local:hash-v1:1536'));
  assert.match(queries[1]?.sql ?? '', /embedding_profile/);
  assert.ok(queries[1]?.values.includes('wayfinder'));
  assert.ok(queries[1]?.values.includes('chunk-1'));
});
