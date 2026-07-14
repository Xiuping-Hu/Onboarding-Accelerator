import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatabaseClient } from './database';
import { KnowledgeMapService } from './knowledgeMapService';

void test('knowledge map proposals use current source versions as authoritative evidence', async () => {
  const db: DatabaseClient = {
    query: async () => ({
      command: 'SELECT',
      rowCount: 2,
      oid: 0,
      fields: [],
      rows: [
        {
          source_id: 'source-a',
          source_version_id: 'version-a',
          title: 'Access setup',
          excerpt: 'Request access and confirm the approved systems.',
          owner: 'IT',
        },
        {
          source_id: 'source-b',
          source_version_id: 'version-b',
          title: 'First workflow',
          excerpt: 'Complete the first reviewed workflow.',
          owner: 'Operations',
        },
      ],
    }),
  };

  const draft = await new KnowledgeMapService(db).proposeFromSources('First week', [
    'source-a',
    'source-b',
  ]);

  assert.equal(draft.nodes.length, 2);
  assert.equal(draft.nodes[0]?.evidence[0]?.sourceVersionId, 'version-a');
  assert.equal(draft.nodes[0]?.evidence[0]?.role, 'authoritative');
  assert.equal(draft.edges[0]?.relationship, 'learning_precedes');
});
