import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatabaseClient } from './database';
import { formatVector, PgvectorKnowledgeBase } from './pgvectorKnowledgeBase';

void test('formatVector serializes embeddings for pgvector parameters', () => {
  assert.equal(formatVector([0.1, -2, 3]), '[0.1,-2,3]');
});

void test('PgvectorKnowledgeBase retrieves sources with query embedding', async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const db: DatabaseClient = {
    query: async (text, values) => {
      queries.push({ text, values });
      return {
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        fields: [],
        rows: [
          {
            id: 'kb:first',
            title: 'First week',
            excerpt: 'Confirm accounts and meet the team.',
            uri: 'kb://first',
            source_type: 'knowledge_base',
            metadata: { department: 'engineering' },
            score: '0.82',
          },
        ],
      };
    },
  };
  const embeddings = {
    embed: async () => [0.25, 0.75],
  };
  const knowledgeBase = new PgvectorKnowledgeBase(db, embeddings, 3);

  const sources = await knowledgeBase.retrieve('first week');

  assert.equal(queries.length, 1);
  assert.match(queries[0]?.text ?? '', /embedding <=> \$1::vector/);
  assert.deepEqual(queries[0]?.values, ['[0.25,0.75]', 3]);
  assert.equal(sources[0]?.id, 'kb:first');
  assert.equal(sources[0]?.score, 0.82);
  assert.deepEqual(sources[0]?.metadata, { department: 'engineering' });
});

void test('PgvectorKnowledgeBase skips database lookup without an embedding', async () => {
  let queryCount = 0;
  const db: DatabaseClient = {
    query: async () => {
      queryCount += 1;
      return { command: 'SELECT', rowCount: 0, oid: 0, fields: [], rows: [] };
    },
  };
  const knowledgeBase = new PgvectorKnowledgeBase(db, { embed: async () => undefined });

  assert.deepEqual(await knowledgeBase.retrieve('anything'), []);
  assert.equal(queryCount, 0);
});
