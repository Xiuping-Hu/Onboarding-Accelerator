import assert from 'node:assert/strict';
import test from 'node:test';
import type { GuideGraph, GuideStep, KnowledgeSource } from '@onboarding/shared';
import {
  createWorkspaceDashboardModel,
  deriveWorkspaceResources,
  deriveWorkspaceRoadmap,
  getUnavailableUpcomingTasks,
} from './workspaceDashboardModel';

function createGraph(
  steps: GuideStep[],
  sources: KnowledgeSource[] = [],
  rootId = 'root',
): GuideGraph {
  return { rootId, steps, edges: [], sources };
}

const roadmapGraph = createGraph([
  {
    id: 'nested',
    title: 'Nested detail',
    summary: 'Not a top-level stage',
    status: 'complete',
    depth: 2,
    parentId: 'first',
    childIds: [],
  },
  {
    id: 'third',
    title: 'Contribute',
    summary: 'Begin contributing',
    status: 'locked',
    depth: 1,
    parentId: 'root',
    childIds: [],
  },
  {
    id: 'root',
    title: 'Begin onboarding',
    summary: 'Synthetic guide root',
    status: 'in-progress',
    depth: 0,
    childIds: ['first', 'second', 'third'],
  },
  {
    id: 'second',
    title: 'Explore',
    summary: 'Learn the tools',
    status: 'in-progress',
    depth: 1,
    parentId: 'root',
    childIds: [],
  },
  {
    id: 'first',
    title: 'Orientation',
    summary: 'Meet the team',
    status: 'complete',
    depth: 1,
    parentId: 'root',
    childIds: ['nested'],
  },
]);

void test('derives only top-level roadmap stages in the root child order', () => {
  const roadmap = deriveWorkspaceRoadmap(roadmapGraph);

  assert.equal(roadmap.status, 'ready');
  assert.deepEqual(
    roadmap.stages.map((stage) => ({
      id: stage.id,
      position: stage.position,
      status: stage.status,
    })),
    [
      { id: 'first', position: 1, status: 'status-unavailable' },
      { id: 'second', position: 2, status: 'status-unavailable' },
      { id: 'third', position: 3, status: 'status-unavailable' },
    ],
  );
});

void test('keeps progress unavailable until a lifecycle contract exists', () => {
  const model = createWorkspaceDashboardModel(roadmapGraph);

  assert.deepEqual(model.progress, {
    status: 'unavailable',
    summary: null,
    reason: 'progress-contract-unavailable',
  });
});

void test('keeps unavailable, empty, and partial roadmap data distinct', () => {
  const unavailable = createWorkspaceDashboardModel(null);
  assert.deepEqual(unavailable.roadmap, {
    status: 'unavailable',
    stages: [],
    reason: 'guide-unavailable',
  });
  assert.deepEqual(unavailable.progress, {
    status: 'unavailable',
    summary: null,
    reason: 'guide-unavailable',
  });

  const empty = createWorkspaceDashboardModel({
    rootId: 'root',
    steps: [],
    edges: [],
    sources: [],
    emptyReason: 'not_created',
  });
  assert.equal(empty.roadmap.status, 'empty');
  assert.deepEqual(empty.progress, { status: 'empty', summary: null });

  const partial = createWorkspaceDashboardModel(
    createGraph([
      {
        id: 'root',
        title: 'Root',
        summary: 'Root',
        status: 'in-progress',
        depth: 0,
        childIds: ['known', 'missing'],
      },
      {
        id: 'known',
        title: 'Known',
        summary: 'Known stage',
        status: 'ready',
        depth: 1,
        parentId: 'root',
        childIds: [],
      },
    ]),
  );
  assert.equal(partial.roadmap.status, 'partial');
  assert.equal(partial.roadmap.stages.length, 1);
  assert.deepEqual(partial.progress, {
    status: 'unavailable',
    summary: null,
    reason: 'partial-roadmap',
  });
});

void test('does not reinterpret guide stages as upcoming tasks', () => {
  assert.deepEqual(getUnavailableUpcomingTasks(), {
    status: 'unavailable',
    items: [],
    reason: 'task-contract-unavailable',
  });
});

void test('normalizes and deduplicates authorized graph sources as resource candidates', () => {
  const resources = deriveWorkspaceResources(
    createGraph(
      [],
      [
        {
          id: 'handbook#one',
          title: 'Handbook',
          excerpt: 'First excerpt',
          href: '/api/sources/handbook',
          sourceType: 'knowledge_base',
          metadata: { rootSourceId: 'handbook' },
        },
        {
          id: 'handbook#two',
          title: 'Handbook duplicate',
          excerpt: 'Second excerpt',
          href: '/api/sources/handbook',
          sourceType: 'knowledge_base',
          metadata: { rootSourceId: 'handbook' },
        },
        {
          id: 'policy',
          title: 'Public policy',
          excerpt: 'Policy excerpt',
          href: 'https://example.com/policy',
          sourceType: 'web',
        },
      ],
    ),
  );

  assert.equal(resources.status, 'ready');
  assert.equal(resources.items.length, 2);
  assert.deepEqual(
    resources.items.map(({ id, href, label }) => ({ id, href, label })),
    [
      {
        id: 'handbook#one',
        href: '/api/sources/handbook',
        label: 'Company knowledge',
      },
      { id: 'policy', href: 'https://example.com/policy', label: 'example.com' },
    ],
  );
});

void test('does not expose a resource collection when source links cannot be normalized', () => {
  const unsafe = deriveWorkspaceResources(
    createGraph(
      [],
      [
        {
          id: 'private-source',
          title: 'Private source',
          excerpt: 'Do not expose this locator',
          href: 'file:///private/handbook.pdf',
        },
      ],
    ),
  );

  assert.deepEqual(unsafe, {
    status: 'unavailable',
    items: [],
    reason: 'source-links-unavailable',
  });
  assert.deepEqual(deriveWorkspaceResources(createGraph([])), { status: 'empty', items: [] });
});
