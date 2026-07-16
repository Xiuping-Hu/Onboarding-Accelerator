import assert from 'node:assert/strict';
import test from 'node:test';
import type { DatabaseClient } from './database';
import { KnowledgeMapService } from './knowledgeMapService';

void test('knowledge map proposals group current source versions into grounded domains', async () => {
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
