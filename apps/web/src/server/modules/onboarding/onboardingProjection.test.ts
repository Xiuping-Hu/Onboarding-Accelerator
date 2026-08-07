import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateOnboardingProjection } from './onboardingProjection';
import type { OnboardingPlanAggregate } from './onboarding.repository';

void test('calculates weighted progress, overdue stages, and due-date ordered upcoming tasks', () => {
  const projection = calculateOnboardingProjection(aggregate(), new Date('2026-08-05T12:00:00Z'));
  assert.equal(projection.progress.percentComplete, 25);
  assert.equal(projection.progress.completedTaskCount, 1);
  assert.equal(projection.progress.totalTaskCount, 3);
  assert.equal(projection.roadmap[0]?.status, 'overdue');
  assert.equal(projection.roadmap[1]?.status, 'upcoming');
  assert.deepEqual(
    projection.upcomingTasks.map((task) => task.stableKey),
    ['security-training', 'request-access'],
  );
});

void test('removes waived tasks from the progress denominator', () => {
  const value = aggregate();
  value.tasks[1]!.status = 'waived';
  const projection = calculateOnboardingProjection(value, new Date('2026-08-05T12:00:00Z'));
  assert.equal(projection.progress.completedWeight, 1);
  assert.equal(projection.progress.totalWeight, 3);
  assert.equal(projection.progress.percentComplete, 33);
});

void test('returns null progress when no task counts toward progress', () => {
  const value = aggregate();
  for (const stage of value.definition.stages) {
    for (const task of stage.tasks) task.countsTowardProgress = false;
  }
  const projection = calculateOnboardingProjection(value);
  assert.equal(projection.progress.percentComplete, null);
  assert.equal(projection.progress.totalWeight, 0);
});

function aggregate(): OnboardingPlanAggregate {
  return {
    definition: {
      id: 'definition',
      ownerId: 'owner',
      title: 'First month',
      createdAt: '2026-08-01T12:00:00Z',
      sourceReferences: [],
      stages: [
        {
          id: 'stage-orientation',
          stableKey: 'orientation',
          title: 'Orientation',
          description: 'Learn the basics',
          position: 1,
          dependsOnStageKeys: [],
          tasks: [
            {
              id: 'definition-handbook',
              stableKey: 'read-handbook',
              title: 'Read handbook',
              required: true,
              countsTowardProgress: true,
              weight: 1,
              dependsOnTaskKeys: [],
            },
            {
              id: 'definition-security',
              stableKey: 'security-training',
              title: 'Security training',
              required: true,
              countsTowardProgress: true,
              weight: 1,
              dueOffsetDays: 2,
              dependsOnTaskKeys: [],
            },
          ],
        },
        {
          id: 'stage-tools',
          stableKey: 'tools',
          title: 'Tools',
          description: 'Request access',
          position: 2,
          dependsOnStageKeys: ['orientation'],
          tasks: [
            {
              id: 'definition-access',
              stableKey: 'request-access',
              title: 'Request access',
              required: true,
              countsTowardProgress: true,
              weight: 2,
              dueOffsetDays: 10,
              dependsOnTaskKeys: ['security-training'],
            },
          ],
        },
      ],
    },
    plan: {
      id: 'plan',
      sessionId: 'session',
      ownerId: 'owner',
      definitionVersionId: 'definition',
      creationRequestId: 'creation',
      title: 'First month',
      status: 'active',
      startAt: '2026-08-01T12:00:00Z',
      revision: 1,
      createdAt: '2026-08-01T12:00:00Z',
      startedAt: '2026-08-01T12:00:00Z',
    },
    tasks: [
      {
        id: 'task-handbook',
        planId: 'plan',
        definitionId: 'definition-handbook',
        stableKey: 'read-handbook',
        stageId: 'stage-orientation',
        status: 'completed',
        completedAt: '2026-08-02T12:00:00Z',
        revision: 1,
      },
      {
        id: 'task-security',
        planId: 'plan',
        definitionId: 'definition-security',
        stableKey: 'security-training',
        stageId: 'stage-orientation',
        status: 'not_started',
        dueAt: '2026-08-03T12:00:00Z',
        revision: 0,
      },
      {
        id: 'task-access',
        planId: 'plan',
        definitionId: 'definition-access',
        stableKey: 'request-access',
        stageId: 'stage-tools',
        status: 'not_started',
        dueAt: '2026-08-11T12:00:00Z',
        revision: 0,
      },
    ],
  };
}
