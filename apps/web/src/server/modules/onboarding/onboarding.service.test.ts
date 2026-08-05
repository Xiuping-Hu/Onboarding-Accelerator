import assert from 'node:assert/strict';
import test from 'node:test';
import type { ActivateOnboardingPlanRequest } from '@onboarding/shared';
import { AppError } from '../../core/errors/appError';
import { InMemorySessionRepository } from '../../sessionRepository';
import { InMemoryOnboardingRepository } from './onboarding.repository';
import { OnboardingService } from './onboarding.service';

void test('activates an approved plan and completes a task idempotently', async () => {
  const sessions = new InMemorySessionRepository();
  const session = await sessions.create({ title: 'Plan test' }, 'owner');
  const service = new OnboardingService(new InMemoryOnboardingRepository(), sessions);
  const activated = await service.activate(session.id, planRequest(), {
    id: 'owner',
    role: 'user',
  });
  assert.equal(activated.state.status, 'ready');
  if (activated.state.status !== 'ready') return;
  assert.equal(activated.state.projection.progress.percentComplete, 0);
  const task = activated.state.projection.tasks[0]!;

  const first = await service.transitionTask(
    session.id,
    task.id,
    {
      status: 'completed',
      expectedRevision: task.revision,
      idempotencyKey: 'complete-task-once',
      source: 'tasks_ui',
    },
    { id: 'owner', role: 'user' },
  );
  assert.equal(first.idempotentReplay, false);
  assert.equal(
    first.state.status === 'ready' && first.state.projection.progress.percentComplete,
    100,
  );

  const replay = await service.transitionTask(
    session.id,
    task.id,
    {
      status: 'completed',
      expectedRevision: task.revision,
      idempotencyKey: 'complete-task-once',
      source: 'tasks_ui',
    },
    { id: 'owner', role: 'user' },
  );
  assert.equal(replay.idempotentReplay, true);

  await assert.rejects(
    () =>
      service.transitionTask(
        session.id,
        task.id,
        {
          status: 'in_progress',
          expectedRevision: 1,
          idempotencyKey: 'complete-task-once',
          source: 'tasks_ui',
        },
        { id: 'owner', role: 'admin' },
      ),
    (error: unknown) => error instanceof AppError && error.status === 409,
  );
});

void test('rejects stale revisions, cross-owner reads, and cyclic definitions', async () => {
  const sessions = new InMemorySessionRepository();
  const session = await sessions.create({ title: 'Plan test' }, 'owner');
  const service = new OnboardingService(new InMemoryOnboardingRepository(), sessions);
  const activated = await service.activate(session.id, planRequest(), {
    id: 'owner',
    role: 'user',
  });
  if (activated.state.status !== 'ready') return;
  const task = activated.state.projection.tasks[0]!;
  await service.transitionTask(
    session.id,
    task.id,
    {
      status: 'completed',
      expectedRevision: 0,
      idempotencyKey: 'first-write',
      source: 'tasks_ui',
    },
    { id: 'owner', role: 'user' },
  );
  await assert.rejects(
    () =>
      service.transitionTask(
        session.id,
        task.id,
        {
          status: 'in_progress',
          expectedRevision: 0,
          idempotencyKey: 'stale-write',
          source: 'tasks_ui',
        },
        { id: 'owner', role: 'admin' },
      ),
    (error: unknown) => error instanceof AppError && error.status === 409,
  );
  await assert.rejects(() => service.get(session.id, 'other-user'));

  const cyclic = planRequest();
  cyclic.stages[0]!.dependsOnStageKeys = ['orientation'];
  const otherSession = await sessions.create({ title: 'Cycle' }, 'owner');
  await assert.rejects(
    () => service.activate(otherSession.id, cyclic, { id: 'owner', role: 'user' }),
    (error: unknown) => error instanceof AppError && error.status === 400,
  );
});

void test('keeps learner progress available across chat sessions', async () => {
  const sessions = new InMemorySessionRepository();
  const origin = await sessions.create({ title: 'Origin' }, 'owner');
  const continuation = await sessions.create({ title: 'Continuation' }, 'owner');
  const service = new OnboardingService(new InMemoryOnboardingRepository(), sessions);
  await service.activate(origin.id, planRequest(), { id: 'owner', role: 'user' });

  assert.equal((await service.get(continuation.id, 'owner')).status, 'ready');
  await sessions.delete(origin.id, 'owner');
  assert.equal((await service.get(continuation.id, 'owner')).status, 'ready');
});

void test('blocks task completion until declared dependencies are complete', async () => {
  const sessions = new InMemorySessionRepository();
  const session = await sessions.create({ title: 'Dependencies' }, 'owner');
  const service = new OnboardingService(new InMemoryOnboardingRepository(), sessions);
  const request = planRequest();
  request.stages[0]!.tasks.push({
    stableKey: 'request-access',
    title: 'Request access',
    dependsOnTaskKeys: ['read-handbook'],
  });
  const activated = await service.activate(session.id, request, { id: 'owner', role: 'user' });
  if (activated.state.status !== 'ready') return;
  const dependent = activated.state.projection.tasks.find(
    (task) => task.stableKey === 'request-access',
  )!;
  await assert.rejects(
    () =>
      service.transitionTask(
        session.id,
        dependent.id,
        {
          status: 'completed',
          expectedRevision: dependent.revision,
          idempotencyKey: 'complete-dependent-first',
          source: 'tasks_ui',
        },
        { id: 'owner', role: 'user' },
      ),
    (error: unknown) => error instanceof AppError && error.status === 409,
  );
});

function planRequest(): ActivateOnboardingPlanRequest {
  return {
    approved: true as const,
    clientRequestId: 'activate-first-plan',
    title: 'First week',
    startAt: '2026-08-05T12:00:00Z',
    stages: [
      {
        stableKey: 'orientation',
        title: 'Orientation',
        description: 'Learn the basics',
        position: 1,
        tasks: [
          {
            stableKey: 'read-handbook',
            title: 'Read the handbook',
            dueOffsetDays: 2,
          },
        ],
      },
    ],
  };
}
