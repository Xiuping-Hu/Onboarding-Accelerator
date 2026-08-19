import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkspaceOnboardingState } from '@onboarding/shared';
import {
  createWorkspaceDashboardModel,
  deriveAllTasks,
  deriveWorkspaceProgress,
  deriveWorkspaceResources,
} from './workspaceDashboardModel';

const readyState = {
  status: 'ready',
  roadmap: {
    roadmapId: 'roadmap-1',
    versionId: 'version-2',
    versionNumber: 2,
    title: 'Tax consultant onboarding',
    sourceReferences: [],
    stages: [
      {
        id: 'stage-1',
        stableKey: 'orientation',
        position: 1,
        title: 'Orientation',
        description: 'Meet the team',
        dependsOnStageKeys: [],
        tasks: [
          {
            id: 'canonical-task-1',
            stableKey: 'meet-team',
            position: 1,
            title: 'Meet the team',
            required: true,
            countsTowardProgress: true,
            weight: 1,
            dependsOnTaskKeys: [],
          },
        ],
      },
      {
        id: 'stage-2',
        stableKey: 'tools',
        position: 2,
        title: 'Tools',
        description: 'Set up access',
        dependsOnStageKeys: [],
        tasks: [
          {
            id: 'canonical-task-2',
            stableKey: 'set-up-access',
            position: 1,
            title: 'Set up access',
            description: 'Request access to required systems.',
            required: true,
            countsTowardProgress: true,
            weight: 1,
            dependsOnTaskKeys: [],
          },
        ],
      },
    ],
  },
  userState: {
    appliedVersionId: 'version-2',
    stateRevision: 4,
    syncStatus: 'current',
    progress: {
      percentComplete: 50,
      completedWeight: 1,
      totalWeight: 2,
      completedTaskCount: 1,
      totalTaskCount: 2,
      currentStageId: 'stage-2',
    },
    tasks: [
      {
        taskInstanceId: 'task-instance-1',
        canonicalItemId: 'canonical-task-1',
        stableKey: 'meet-team',
        status: 'completed',
        completedAt: '2026-08-04T12:00:00.000Z',
        taskRevision: 1,
      },
      {
        taskInstanceId: 'task-instance-2',
        canonicalItemId: 'canonical-task-2',
        stableKey: 'set-up-access',
        status: 'not_started',
        dueAt: '2099-08-20T12:00:00.000Z',
        taskRevision: 0,
      },
    ],
    upcomingTasks: [
      {
        taskInstanceId: 'task-instance-2',
        canonicalItemId: 'canonical-task-2',
        stableKey: 'set-up-access',
        status: 'not_started',
        dueAt: '2099-08-20T12:00:00.000Z',
        taskRevision: 0,
      },
    ],
  },
  newestUnreadNotice: null,
  unreadNoticeCount: 0,
} satisfies WorkspaceOnboardingState;

void test('joins canonical definitions to personal state without mixing their revisions', () => {
  const model = createWorkspaceDashboardModel(readyState);
  assert.equal(model.roadmap.status, 'ready');
  assert.equal(model.roadmap.stages[1]?.status, 'in-progress');
  assert.equal(model.roadmap.title, 'Tax consultant onboarding');
  assert.equal(model.roadmap.versionNumber, 2);
  assert.deepEqual(model.progress, {
    status: 'ready',
    summary: {
      completedTaskCount: 1,
      totalTaskCount: 2,
      percentComplete: 50,
      currentStage: model.roadmap.stages[1],
    },
  });
  assert.equal(model.upcomingTasks.status, 'ready');
  assert.equal(model.upcomingTasks.items[0]?.taskInstanceId, 'task-instance-2');
  assert.equal(model.upcomingTasks.items[0]?.title, 'Set up access');
  assert.equal(model.upcomingTasks.items[0]?.taskRevision, 0);
});

void test('omits user task state that does not match the canonical item identity and stable key', () => {
  const state: WorkspaceOnboardingState = structuredClone(readyState);
  if (state.status !== 'ready') return;
  state.userState.tasks[1]!.stableKey = 'stale-key';
  assert.deepEqual(
    deriveAllTasks(state).map((task) => task.taskInstanceId),
    ['task-instance-1'],
  );
});

void test('keeps missing and ingestion-driven empty state explicit', () => {
  assert.deepEqual(createWorkspaceDashboardModel(null).roadmap, {
    status: 'unavailable',
    stages: [],
    reason: 'onboarding-unavailable',
  });
  const empty: WorkspaceOnboardingState = {
    status: 'empty',
    message: 'Roadmap is being prepared from the latest knowledge base.',
    newestUnreadNotice: null,
    unreadNoticeCount: 0,
  };
  assert.deepEqual(createWorkspaceDashboardModel(empty).progress, {
    status: 'empty',
    summary: null,
    message: empty.message,
  });
  assert.deepEqual(createWorkspaceDashboardModel(empty).upcomingTasks, {
    status: 'empty',
    items: [],
  });
});

void test('reports a zero progress denominator as unavailable', () => {
  const state: WorkspaceOnboardingState = structuredClone(readyState);
  if (state.status !== 'ready') return;
  state.userState.progress.percentComplete = null;
  state.userState.progress.totalWeight = 0;
  assert.deepEqual(deriveWorkspaceProgress(state), {
    status: 'unavailable',
    summary: null,
    reason: 'no-progress-tasks',
  });
});

void test('normalizes and deduplicates canonical browser-safe source references', () => {
  const state: WorkspaceOnboardingState = structuredClone(readyState);
  if (state.status !== 'ready') return;
  state.roadmap.sourceReferences = [
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
  ];
  const resources = deriveWorkspaceResources(state);
  assert.equal(resources.status, 'ready');
  assert.equal(resources.items.length, 2);
});

void test('does not expose a canonical source with an unsafe application link', () => {
  const state: WorkspaceOnboardingState = structuredClone(readyState);
  if (state.status !== 'ready') return;
  state.roadmap.sourceReferences = [
    {
      id: 'private-source',
      title: 'Private title',
      excerpt: 'Do not expose this locator',
      href: 'file:///private/handbook.pdf',
    },
  ];
  assert.deepEqual(deriveWorkspaceResources(state), {
    status: 'unavailable',
    items: [],
    reason: 'source-links-unavailable',
  });
});
