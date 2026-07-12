import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatabaseClient } from '../database';
import { writeKnowledgeChunks } from './knowledgeChunkWriter';

void test('writeKnowledgeChunks upserts and cleans only the selected embedding profile', async () => {
  const queries: Array<{ text: string; values?: readonly unknown[] }> = [];
  const db: DatabaseClient = {
    query: async (text, values) => {
      queries.push({ text, values });
      return { command: 'MOCK', rowCount: 0, oid: 0, fields: [], rows: [] } as never;
    },
  };

  await writeKnowledgeChunks(db, { embed: async () => [1, 0] }, 'local:hash-v1:1536', 'wayfinder', [
    {
      id: 'chunk-1',
      title: 'Wayfinder',
      text: 'First chunk',
      uri: 'https://example.test/wayfinder',
      metadata: { rootSourceId: 'wayfinder' },
    },
  ]);

  assert.match(queries[0]?.text ?? '', /on conflict \(id, embedding_profile\)/);
  assert.equal(queries[0]?.values?.[1], 'local:hash-v1:1536');
  assert.match(queries[1]?.text ?? '', /embedding_profile = \$2/);
  assert.deepEqual(queries[1]?.values, ['wayfinder', 'local:hash-v1:1536', ['chunk-1']]);
});
