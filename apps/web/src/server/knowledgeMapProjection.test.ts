import assert from 'node:assert/strict';
import test from 'node:test';
import type { PublishedKnowledgeMap } from '@onboarding/shared';
import { projectKnowledgeMapToGuide } from './knowledgeMapProjection';

void test('published knowledge maps project stable hierarchy without persisted evidence excerpts', () => {
  const map: PublishedKnowledgeMap = {
    id: 'map-1',
    versionId: 'version-1',
    versionNumber: 1,
    title: 'Pilot map',
    nodes: [
      {
        id: 'node-root',
        stableKey: 'root',
        kind: 'concept',
        title: 'Start here',
        summary: 'Orientation',
        controllingDocumentRequired: false,
        evidenceHealth: 'current',
        sources: [{ id: 'source-1', title: 'Source', excerpt: 'Restricted excerpt' }],
      },
      {
        id: 'node-task',
        stableKey: 'task',
        kind: 'task',
        title: 'First task',
        summary: 'Complete the first task',
        controllingDocumentRequired: false,
        evidenceHealth: 'current',
        sources: [],
      },
    ],
    edges: [
      {
        id: 'edge-1',
        from: 'node-root',
        to: 'node-task',
        relationship: 'learning_precedes',
      },
    ],
  };

  const guide = projectKnowledgeMapToGuide(map);

  assert.deepEqual(guide.rootNodeIds, ['node-root']);
  assert.deepEqual(guide.nodes['node-root']?.children, ['node-task']);
  assert.equal(guide.nodes['node-task']?.parentId, 'node-root');
  assert.deepEqual(guide.nodes['node-root']?.sources, []);
  assert.equal(guide.knowledgeMapVersionId, 'version-1');
});
