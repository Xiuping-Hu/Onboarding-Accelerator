import assert from 'node:assert/strict';
import test from 'node:test';
import type { Prisma } from '@/generated/prisma/client';
import type { PrismaDatabase } from './infrastructure/prisma/prismaTypes';
import { formatVector, PgvectorKnowledgeBase } from './pgvectorKnowledgeBase';

void test('formatVector serializes embeddings for pgvector parameters', () => {
  assert.equal(formatVector([0.1, -2, 3]), '[0.1,-2,3]');
});

void test('PgvectorKnowledgeBase retrieves sources with parameterized Prisma SQL', async () => {
  const queries: Prisma.Sql[] = [];
  const db = {
    $queryRaw: async (query: Prisma.Sql) => {
      queries.push(query);
      return [
        {
          id: 'kb:first',
          title: 'First week',
          excerpt: 'Confirm accounts and meet the team.',
          uri: 'kb://first',
          source_type: 'knowledge_base',
          metadata: { department: 'engineering' },
          score: '0.82',
        },
      ];
    },
  } as unknown as PrismaDatabase;
  const knowledgeBase = new PgvectorKnowledgeBase(db, { embed: async () => [0.25, 0.75] }, 3);

  const sources = await knowledgeBase.retrieve('first week');

  assert.equal(queries.length, 1);
  assert.match(queries[0]?.sql ?? '', /embedding <=> .*::vector/);
  assert.ok(queries[0]?.values.includes('[0.25,0.75]'));
  assert.ok(queries[0]?.values.includes('openai:text-embedding-3-small'));
  assert.equal(sources[0]?.id, 'kb:first');
  assert.equal(sources[0]?.score, 0.82);
  assert.deepEqual(sources[0]?.metadata, { department: 'engineering' });
});

void test('PgvectorKnowledgeBase skips database lookup without an embedding', async () => {
  let queryCount = 0;
  const db = {
    $queryRaw: async () => {
      queryCount += 1;
      return [];
    },
  } as unknown as PrismaDatabase;
  const knowledgeBase = new PgvectorKnowledgeBase(db, { embed: async () => undefined });

  assert.deepEqual(await knowledgeBase.retrieve('anything'), []);
  assert.equal(queryCount, 0);
});
