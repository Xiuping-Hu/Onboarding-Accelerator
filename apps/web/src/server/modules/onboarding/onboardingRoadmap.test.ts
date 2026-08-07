import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError } from '../../core/errors/appError';
import type { OnboardingPlanAggregate } from './onboarding.repository';
import { createStoredStages, hashValue, prepareRoadmapMutation } from './onboardingRoadmap';

void test('canonical hashing is stable across object key order', () => {
  assert.equal(
    hashValue({ title: 'Roadmap', nested: { b: 2, a: 1 } }),
    hashValue({ nested: { a: 1, b: 2 }, title: 'Roadmap' }),
  );
});

void test('typed commands edit, move, and retire roadmap content in one immutable version', () => {
  const current = aggregate();
  const priorDefinitionId = current.definition.id;
  const priorCompletedTaskId = current.tasks.find(
    (task) => task.stableKey === 'security-setup',
  )!.id;
  const result = prepareRoadmapMutation({
    current,
    actorId: 'owner',
    idempotencyKey: 'all-command-types',
    now: '2026-08-06T12:00:00.000Z',
    changeSource: 'test',
    commands: [
      { type: 'set_metadata', title: 'Updated roadmap', targetAt: '2026-09-01T00:00:00.000Z' },
      {
        type: 'add_stage',
        afterStageKey: 'orientation',
        stage: {
          stableKey: 'practice',
          title: 'Practice',
          description: 'Apply the basics',
          tasks: [],
        },
      },
      {
        type: 'update_stage',
        stageKey: 'practice',
        patch: { description: 'Apply the basics with a manager', dependsOnStageKeys: [] },
      },
      { type: 'move_stage', stageKey: 'practice' },
      {
        type: 'add_task',
        stageKey: 'practice',
        task: {
          stableKey: 'manager-check-in',
          title: 'Meet the manager',
          completionCriteria: 'The first meeting is complete',
        },
      },
      {
        type: 'update_task',
        taskKey: 'manager-check-in',
        patch: { title: 'Complete the manager check-in', weight: 2 },
      },
      {
        type: 'move_task',
        taskKey: 'manager-check-in',
        toStageKey: 'orientation',
        afterTaskKey: 'read-handbook',
      },
      { type: 'delete_task', taskKey: 'security-setup' },
      { type: 'delete_stage', stageKey: 'security' },
    ],
  });

  assert.notEqual(result.aggregate.definition.id, priorDefinitionId);
  assert.equal(result.aggregate.definition.supersedesVersionId, priorDefinitionId);
  assert.equal(result.aggregate.plan.title, 'Updated roadmap');
  assert.deepEqual(
    result.aggregate.definition.stages.map((stage) => [stage.stableKey, stage.position]),
    [
      ['practice', 1],
      ['orientation', 2],
    ],
  );
  assert.equal(
    result.aggregate.definition.stages
      .flatMap((stage) => stage.tasks)
      .find((task) => task.stableKey === 'manager-check-in')?.weight,
    2,
  );
  assert.ok(result.retiredTaskIds.includes(priorCompletedTaskId));
  assert.equal(result.impact.destructive, true);
  assert.match(result.impactHash, /^[a-f0-9]{64}$/);
});

void test('moving unchanged completed work retains progress while criteria changes reset it', () => {
  const current = aggregate();
  const moved = prepareRoadmapMutation({
    current,
    actorId: 'owner',
    idempotencyKey: 'move-complete',
    now: '2026-08-06T12:00:00.000Z',
    changeSource: 'move_task',
    commands: [
      {
        type: 'move_task',
        taskKey: 'security-setup',
        toStageKey: 'orientation',
        afterTaskKey: 'read-handbook',
      },
    ],
  });
  const retained = moved.aggregate.tasks.find((task) => task.stableKey === 'security-setup');
  assert.equal(retained?.status, 'completed');
  assert.equal(moved.impact.completedTasksRetained, 1);
  assert.equal(moved.impact.destructive, false);

  const reset = prepareRoadmapMutation({
    current: moved.aggregate,
    actorId: 'owner',
    idempotencyKey: 'change-criteria',
    now: '2026-08-06T12:01:00.000Z',
    changeSource: 'update_task',
    commands: [
      {
        type: 'update_task',
        taskKey: 'security-setup',
        patch: { completionCriteria: 'A manager verifies every security control' },
      },
    ],
  });
  assert.equal(
    reset.aggregate.tasks.find((task) => task.stableKey === 'security-setup')?.status,
    'not_started',
  );
  assert.equal(reset.resetEvents.length, 1);
  assert.equal(reset.impact.completedTasksReset, 1);
});

void test('domain validation rejects invalid dates, references, and dependency cycles', () => {
  const current = aggregate();
  assert.throws(
    () =>
      prepareRoadmapMutation({
        current,
        actorId: 'owner',
        idempotencyKey: 'bad-date',
        now: '2026-08-06T12:00:00.000Z',
        changeSource: 'set_metadata',
        commands: [{ type: 'set_metadata', targetAt: 'not-a-date' }],
      }),
    isValidationError,
  );
  assert.throws(
    () =>
      prepareRoadmapMutation({
        current,
        actorId: 'owner',
        idempotencyKey: 'bad-reference',
        now: '2026-08-06T12:00:00.000Z',
        changeSource: 'update_task',
        commands: [
          {
            type: 'update_task',
            taskKey: 'read-handbook',
            patch: { dependsOnTaskKeys: ['missing-task'] },
          },
        ],
      }),
    isValidationError,
  );
  assert.throws(
    () =>
      prepareRoadmapMutation({
        current,
        actorId: 'owner',
        idempotencyKey: 'cycle',
        now: '2026-08-06T12:00:00.000Z',
        changeSource: 'update_stage',
        commands: [
          {
            type: 'update_stage',
            stageKey: 'orientation',
            patch: { dependsOnStageKeys: ['security'] },
          },
        ],
      }),
    isValidationError,
  );
});

function aggregate(): OnboardingPlanAggregate {
  const stages = createStoredStages([
    {
      stableKey: 'orientation',
      title: 'Orientation',
      description: 'Learn the basics',
      position: 1,
      tasks: [
        {
          stableKey: 'read-handbook',
          title: 'Read the handbook',
          completionCriteria: 'The handbook is acknowledged',
        },
      ],
    },
    {
      stableKey: 'security',
      title: 'Security',
      description: 'Secure the account',
      position: 2,
      dependsOnStageKeys: ['orientation'],
      tasks: [
        {
          stableKey: 'security-setup',
          title: 'Complete security setup',
          completionCriteria: 'Every security control is enabled',
        },
      ],
    },
  ]);
  const planId = '00000000-0000-4000-8000-000000000001';
  return {
    definition: {
      id: '00000000-0000-4000-8000-000000000002',
      ownerId: 'owner',
      title: 'Roadmap',
      createdAt: '2026-08-05T12:00:00.000Z',
      sourceReferences: [],
      stages,
    },
    plan: {
      id: planId,
      ownerId: 'owner',
      definitionVersionId: '00000000-0000-4000-8000-000000000002',
      creationRequestId: 'create-roadmap',
      title: 'Roadmap',
      status: 'active',
      startAt: '2026-08-05T12:00:00.000Z',
      revision: 0,
      createdAt: '2026-08-05T12:00:00.000Z',
      startedAt: '2026-08-05T12:00:00.000Z',
    },
    tasks: stages.flatMap((stage) =>
      stage.tasks.map((task) => ({
        id:
          task.stableKey === 'security-setup'
            ? '00000000-0000-4000-8000-000000000003'
            : '00000000-0000-4000-8000-000000000004',
        planId,
        definitionId: task.id,
        stableKey: task.stableKey,
        stageId: stage.id,
        status:
          task.stableKey === 'security-setup' ? ('completed' as const) : ('not_started' as const),
        revision: task.stableKey === 'security-setup' ? 1 : 0,
      })),
    ),
  };
}

function isValidationError(error: unknown): boolean {
  return error instanceof AppError && error.status === 400;
}
