import assert from 'node:assert/strict';
import test from 'node:test';
import type { GuideGraph, KnowledgeSource, WorkspaceOnboardingState } from '@onboarding/shared';
import {
  createWorkspaceDashboardModel,
  deriveWorkspaceProgress,
  deriveWorkspaceResources,
} from './workspaceDashboardModel';

const readyState: WorkspaceOnboardingState = {
  status: 'ready',
  projection: {
    planId: 'plan-1',
    planRevision: 2,
    planStatus: 'active',
    definitionVersionId: 'definition-1',
    calculatedAt: '2026-08-05T12:00:00.000Z',
    progress: {
      percentComplete: 50,
      completedWeight: 1,
      totalWeight: 2,
      completedTaskCount: 1,
      totalTaskCount: 2,
      currentStageId: 'stage-2',
    },
    roadmap: [
      {
        id: 'stage-1',
        stableKey: 'orientation',
        position: 1,
        title: 'Orientation',
        description: 'Meet the team',
        status: 'completed',
        completedTaskCount: 1,
        totalTaskCount: 1,
      },
      {
        id: 'stage-2',
        stableKey: 'tools',
        position: 2,
        title: 'Tools',
        description: 'Set up access',
        status: 'in-progress',
        completedTaskCount: 0,
        totalTaskCount: 1,
      },
    ],
    tasks: [
      {
        id: 'task-1',
        planId: 'plan-1',
        stageId: 'stage-1',
        stableKey: 'meet-team',
        title: 'Meet the team',
        status: 'completed',
        required: true,
        countsTowardProgress: true,
        weight: 1,
        completedAt: '2026-08-04T12:00:00.000Z',
        revision: 1,
        overdue: false,
      },
      {
        id: 'task-2',
        planId: 'plan-1',
        stageId: 'stage-2',
        stableKey: 'set-up-access',
        title: 'Set up access',
        status: 'not_started',
        required: true,
        countsTowardProgress: true,
        weight: 1,
        revision: 0,
        overdue: false,
      },
    ],
    upcomingTasks: [
      {
        id: 'task-2',
        planId: 'plan-1',
        stageId: 'stage-2',
        stableKey: 'set-up-access',
        title: 'Set up access',
        status: 'not_started',
        required: true,
        countsTowardProgress: true,
        weight: 1,
        revision: 0,
        overdue: false,
      },
    ],
  },
};

void test('uses the lifecycle projection for roadmap, progress, and upcoming tasks', () => {
  const model = createWorkspaceDashboardModel(createGraph([]), readyState);
  assert.equal(model.roadmap.status, 'ready');
  assert.equal(model.roadmap.stages[1]?.status, 'in-progress');
  assert.deepEqual(model.progress, {
    status: 'ready',
    summary: {
      completedTaskCount: 1,
      totalTaskCount: 2,
      percentComplete: 50,
      currentStage: readyState.projection.roadmap[1],
    },
  });
  assert.equal(model.upcomingTasks.status, 'ready');
  assert.equal(model.upcomingTasks.items[0]?.id, 'task-2');
});

void test('keeps missing and empty lifecycle state explicit', () => {
  assert.deepEqual(createWorkspaceDashboardModel(null, null).roadmap, {
    status: 'unavailable',
    stages: [],
    reason: 'onboarding-unavailable',
  });
  const empty = createWorkspaceDashboardModel(null, {
    status: 'empty',
    reason: 'no-active-plan',
  });
  assert.deepEqual(empty.progress, { status: 'empty', summary: null });
  assert.deepEqual(empty.upcomingTasks, { status: 'empty', items: [] });
});

void test('reports a zero progress denominator as unavailable', () => {
  const state = structuredClone(readyState);
  if (state.status !== 'ready') return;
  state.projection.progress.percentComplete = null;
  state.projection.progress.totalWeight = 0;
  assert.deepEqual(deriveWorkspaceProgress(state), {
    status: 'unavailable',
    summary: null,
    reason: 'no-progress-tasks',
  });
});

void test('normalizes and deduplicates authorized graph sources as resource candidates', () => {
  const resources = deriveWorkspaceResources(
    createGraph([
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
    ]),
  );
  assert.equal(resources.status, 'ready');
  assert.equal(resources.items.length, 2);
});

void test('does not expose resources when a source link cannot be normalized', () => {
  const resources = deriveWorkspaceResources(
    createGraph([
      {
        id: 'private-source',
        title: 'Private source',
        excerpt: 'Do not expose this locator',
        href: 'file:///private/handbook.pdf',
      },
    ]),
  );
  assert.deepEqual(resources, {
    status: 'unavailable',
    items: [],
    reason: 'source-links-unavailable',
  });
});

function createGraph(sources: KnowledgeSource[]): GuideGraph {
  return { rootId: 'root', steps: [], edges: [], sources };
}
