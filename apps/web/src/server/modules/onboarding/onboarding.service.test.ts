import assert from 'node:assert/strict';
import test from 'node:test';
import type { CreateOnboardingPlanRequest } from '@onboarding/shared';
import type { AnswerProvider } from '../../core/ports/answerProvider';
import { AppError } from '../../core/errors/appError';
import { InMemorySessionRepository } from '../../sessionRepository';
import { InMemoryOnboardingRepository } from './onboarding.repository';
import { OnboardingRoadmapAgent } from './onboarding.agent';
import { OnboardingService } from './onboarding.service';
import type { RagRetriever } from '../rag/rag.service';

void test('creates a live plan and completes a task idempotently', async () => {
  const sessions = new InMemorySessionRepository();
  const session = await sessions.create({ title: 'Plan test' }, 'owner');
  const service = new OnboardingService(new InMemoryOnboardingRepository(), sessions);
  const created = await service.create(session.id, planRequest(), {
    id: 'owner',
    role: 'user',
  });
  assert.equal(created.state.status, 'ready');
  if (created.state.status !== 'ready') return;
  assert.equal(created.state.projection.progress.percentComplete, 0);
  const task = created.state.projection.tasks[0]!;

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
  const created = await service.create(session.id, planRequest(), {
    id: 'owner',
    role: 'user',
  });
  if (created.state.status !== 'ready') return;
  const task = created.state.projection.tasks[0]!;
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
    () => service.create(otherSession.id, cyclic, { id: 'owner', role: 'user' }),
    (error: unknown) => error instanceof AppError && error.status === 400,
  );
});

void test('keeps learner progress available across chat sessions', async () => {
  const sessions = new InMemorySessionRepository();
  const origin = await sessions.create({ title: 'Origin' }, 'owner');
  const continuation = await sessions.create({ title: 'Continuation' }, 'owner');
  const service = new OnboardingService(new InMemoryOnboardingRepository(), sessions);
  await service.create(origin.id, planRequest(), { id: 'owner', role: 'user' });

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
  const created = await service.create(session.id, request, { id: 'owner', role: 'user' });
  if (created.state.status !== 'ready') return;
  const dependent = created.state.projection.tasks.find(
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

void test('applies live commands idempotently and resets changed completed work only after impact confirmation', async () => {
  const sessions = new InMemorySessionRepository();
  const session = await sessions.create({ title: 'Live editing' }, 'owner');
  const repository = new InMemoryOnboardingRepository();
  const service = new OnboardingService(repository, sessions);
  const actor = { id: 'owner', role: 'user' };
  const created = await service.create(session.id, planRequest(), actor);
  assert.equal(created.state.status, 'ready');
  if (created.state.status !== 'ready') return;

  const addTask = {
    expectedPlanRevision: 0,
    idempotencyKey: 'add-security-task',
    command: {
      type: 'add_task' as const,
      stageKey: 'orientation',
      task: {
        stableKey: 'security-training',
        title: 'Complete security training',
        completionCriteria: 'Training certificate is recorded',
      },
    },
  };
  const added = await service.applyCommand(session.id, addTask, actor);
  assert.equal(added.state.status, 'ready');
  assert.equal(added.idempotentReplay, false);
  assert.equal(added.impact.tasksAdded, 1);
  const replay = await service.applyCommand(session.id, addTask, actor);
  assert.equal(replay.idempotentReplay, true);
  if (added.state.status !== 'ready') return;

  const handbook = added.state.projection.tasks.find((task) => task.stableKey === 'read-handbook')!;
  const completed = await service.transitionTask(
    session.id,
    handbook.id,
    {
      status: 'completed',
      expectedRevision: handbook.revision,
      idempotencyKey: 'finish-handbook',
      source: 'tasks_ui',
    },
    actor,
  );
  assert.equal(completed.state.status, 'ready');
  if (completed.state.status !== 'ready') return;

  const changeCriteria = {
    expectedPlanRevision: completed.state.projection.planRevision,
    idempotencyKey: 'change-handbook-criteria',
    command: {
      type: 'update_task' as const,
      taskKey: 'read-handbook',
      patch: { completionCriteria: 'Manager confirms the handbook review' },
    },
  };
  const preview = await service.commandImpact(session.id, changeCriteria, actor);
  assert.equal(preview.impact.destructive, true);
  assert.equal(preview.impact.completedTasksReset, 1);
  await assert.rejects(
    () => service.applyCommand(session.id, changeCriteria, actor),
    (error: unknown) => error instanceof AppError && error.status === 409,
  );
  const changed = await service.applyCommand(
    session.id,
    { ...changeCriteria, destructiveImpactHash: preview.impact.impactHash },
    actor,
  );
  assert.equal(changed.state.status, 'ready');
  if (changed.state.status !== 'ready') return;
  assert.equal(
    changed.state.projection.tasks.find((task) => task.stableKey === 'read-handbook')?.status,
    'not_started',
  );
  const history = await service.history(session.id, actor);
  assert.deepEqual(
    history.events.map((event) => event.commandType),
    ['update_task', 'add_task', 'create_plan'],
  );
});

void test('generates and applies a bounded AI roadmap proposal', async () => {
  const sessions = new InMemorySessionRepository();
  const session = await sessions.create({ title: 'AI roadmap' }, 'owner');
  const repository = new InMemoryOnboardingRepository();
  const answers: AnswerProvider = {
    async answer() {
      return undefined;
    },
    async generateStructured(input) {
      if (input.prompt.includes('Propose typed operations')) {
        const repeated = input.prompt.includes('Add another manager meeting');
        return {
          content: JSON.stringify({
            operations: [
              {
                type: 'add_task',
                stageKey: 'orientation',
                task: {
                  stableKey: repeated ? 'meet-manager-again' : 'meet-manager',
                  title: repeated ? 'Meet your manager again' : 'Meet your manager',
                  completionCriteria: 'The first one-on-one is complete',
                },
              },
            ],
            rationale: 'Add an early alignment checkpoint.',
            assumptions: [],
            warnings: [],
            sourceReferences: [],
          }),
        };
      }
      return {
        content: JSON.stringify({
          title: 'AI first month',
          stages: [
            {
              stableKey: 'orientation',
              title: 'Orientation',
              description: 'Learn the essentials',
              position: 1,
              tasks: [
                {
                  stableKey: 'read-handbook',
                  title: 'Read the handbook',
                  completionCriteria: 'The handbook is acknowledged',
                },
              ],
            },
          ],
          assumptions: [],
          warnings: [],
          sourceReferences: [],
        }),
      };
    },
  };
  const rag: RagRetriever = {
    async retrieve(query) {
      return {
        query,
        sources: [],
        knowledgeBaseSources: [],
        webSources: [],
      };
    },
  };
  const service = new OnboardingService(
    repository,
    sessions,
    new OnboardingRoadmapAgent(answers, rag),
  );
  const actor = { id: 'owner', role: 'user' };
  const generated = await service.generate(
    session.id,
    { clientRequestId: 'generate-plan', goal: 'Succeed in my first month' },
    actor,
  );
  assert.equal(generated.state.status, 'ready');
  if (generated.state.status !== 'ready') return;
  assert.equal(generated.state.projection.title, 'AI first month');
  const generatedRevision = generated.state.projection.planRevision;

  const proposal = await service.proposeChange(
    session.id,
    { instruction: 'Add a manager meeting' },
    actor,
  );
  assert.equal(proposal.operations[0]?.type, 'add_task');
  const concurrentEdit = await service.applyCommand(
    session.id,
    {
      expectedPlanRevision: generatedRevision,
      idempotencyKey: 'concurrent-title-edit',
      command: { type: 'set_metadata', title: 'AI first month, customized' },
    },
    actor,
  );
  assert.equal(concurrentEdit.state.status, 'ready');
  if (concurrentEdit.state.status !== 'ready') return;
  await assert.rejects(
    () =>
      service.applyProposal(
        session.id,
        proposal.id,
        {
          expectedPlanRevision: generatedRevision,
          proposalHash: proposal.proposalHash,
          idempotencyKey: 'apply-stale-proposal',
        },
        actor,
      ),
    (error: unknown) => error instanceof AppError && error.status === 409,
  );
  const currentProposal = await service.proposeChange(
    session.id,
    { instruction: 'Add a manager meeting' },
    actor,
  );
  const applied = await service.applyProposal(
    session.id,
    currentProposal.id,
    {
      expectedPlanRevision: concurrentEdit.state.projection.planRevision,
      proposalHash: currentProposal.proposalHash,
      idempotencyKey: 'apply-manager-proposal',
    },
    actor,
  );
  assert.equal(applied.state.status, 'ready');
  if (applied.state.status !== 'ready') return;
  assert.ok(applied.state.projection.tasks.some((task) => task.stableKey === 'meet-manager'));
  const appliedRevision = applied.state.projection.planRevision;

  const dismissed = await service.proposeChange(
    session.id,
    { instruction: 'Add another manager meeting' },
    actor,
  );
  await service.dismissProposal(session.id, dismissed.id, actor);
  await assert.rejects(
    () =>
      service.applyProposal(
        session.id,
        dismissed.id,
        {
          expectedPlanRevision: appliedRevision,
          proposalHash: dismissed.proposalHash,
          idempotencyKey: 'apply-dismissed-proposal',
        },
        actor,
      ),
    (error: unknown) => error instanceof AppError && error.status === 409,
  );
});

void test('cancels a live roadmap with a revision-bound impact while retaining history', async () => {
  const sessions = new InMemorySessionRepository();
  const session = await sessions.create({ title: 'Cancellation' }, 'owner');
  const repository = new InMemoryOnboardingRepository();
  const service = new OnboardingService(repository, sessions);
  const actor = { id: 'owner', role: 'user' };
  const created = await service.create(session.id, planRequest(), actor);
  assert.equal(created.state.status, 'ready');
  if (created.state.status !== 'ready') return;
  const impact = await service.cancellationImpact(session.id, actor);
  const state = await service.cancel(
    session.id,
    {
      expectedPlanRevision: impact.planRevision,
      idempotencyKey: 'cancel-roadmap',
      impactHash: impact.impactHash,
      reason: 'Role changed before onboarding began',
    },
    actor,
  );
  assert.equal(state.status, 'empty');
  assert.equal((await repository.listRevisionEvents(impact.planId, actor.id)).length, 2);
  assert.deepEqual(
    await service.cancel(
      session.id,
      {
        expectedPlanRevision: impact.planRevision,
        idempotencyKey: 'cancel-roadmap',
        impactHash: impact.impactHash,
        reason: 'Role changed before onboarding began',
      },
      actor,
    ),
    { status: 'empty', reason: 'no-active-plan' },
  );
});

function planRequest(): CreateOnboardingPlanRequest {
  return {
    clientRequestId: 'create-first-plan',
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
