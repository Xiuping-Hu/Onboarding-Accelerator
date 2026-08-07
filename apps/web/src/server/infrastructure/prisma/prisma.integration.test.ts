import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { PrismaSessionRepository } from '../../postgresSessionRepository';
import { PrismaOnboardingRepository } from '../../modules/onboarding/onboarding.prisma.repository';
import { OnboardingService } from '../../modules/onboarding/onboarding.service';
import { createPrismaClient } from './prismaClient';

const databaseUrl = process.env.TEST_DATABASE_URL;

void test(
  'Prisma migration target supports JSON, revision CAS, rollback, and pgvector',
  { skip: databaseUrl ? false : 'TEST_DATABASE_URL is not configured' },
  async () => {
    if (!databaseUrl) return;
    const prisma = createPrismaClient({ connectionString: databaseUrl, max: 2 });
    const sessionId = randomUUID();
    const ownerId = `integration-owner-${randomUUID()}`;
    try {
      const extensions = await prisma.$queryRaw<Array<{ installed: boolean }>>`
        select exists(select 1 from pg_extension where extname = 'vector') as installed
      `;
      assert.equal(extensions[0]?.installed, true);

      await assert.rejects(
        prisma.$transaction(async (tx) => {
          await tx.onboardingSession.create({
            data: {
              id: sessionId,
              ownerId: 'integration-owner',
              title: 'Rollback fixture',
              createdAt: new Date(),
              updatedAt: new Date(),
              settings: { webSearchEnabled: false },
              chatHistory: [],
              guide: { rootNodeIds: [], nodes: {}, expandedNodeIds: [] },
            },
          });
          throw new Error('force rollback');
        }),
        /force rollback/,
      );
      assert.equal(await prisma.onboardingSession.findUnique({ where: { id: sessionId } }), null);

      const sessions = new PrismaSessionRepository(prisma);
      const session = await sessions.create({ title: 'Onboarding transaction fixture' }, ownerId);
      const onboarding = new OnboardingService(new PrismaOnboardingRepository(prisma), sessions);
      const actor = { id: ownerId, role: 'user' };
      const created = await onboarding.create(
        session.id,
        {
          clientRequestId: 'integration-create',
          title: 'Integration roadmap',
          stages: [
            {
              stableKey: 'start',
              title: 'Start',
              description: 'Begin onboarding',
              position: 1,
              tasks: [{ stableKey: 'first-task', title: 'Complete the first task' }],
            },
          ],
        },
        actor,
      );
      assert.equal(created.state.status, 'ready');
      if (created.state.status !== 'ready') return;
      const planId = created.state.projection.planId;
      const initialDefinitionId = created.state.projection.definitionVersionId;
      const updated = await onboarding.applyCommand(
        session.id,
        {
          expectedPlanRevision: created.state.projection.planRevision,
          idempotencyKey: 'integration-add-task',
          command: {
            type: 'add_task',
            stageKey: 'start',
            task: {
              stableKey: 'second-task',
              title: 'Complete the second task',
              completionCriteria: 'The second task is verified',
            },
          },
        },
        actor,
      );
      assert.equal(updated.state.status, 'ready');
      assert.equal(await prisma.onboardingJourneyVersion.count({ where: { ownerId } }), 2);
      assert.equal(await prisma.onboardingTaskInstance.count({ where: { planId } }), 2);
      assert.equal(await prisma.onboardingPlanRevisionEvent.count({ where: { planId } }), 2);

      const rolledBackVersionId = randomUUID();
      await assert.rejects(
        prisma.$transaction(async (transaction) => {
          await transaction.onboardingJourneyVersion.create({
            data: {
              id: rolledBackVersionId,
              ownerId,
              title: 'Rolled back version',
              stages: [],
              sourceReferences: [],
              supersedesVersionId: initialDefinitionId,
              changeSource: 'rollback_test',
              createdBy: ownerId,
            },
          });
          await transaction.onboardingPlan.update({
            where: { id: planId },
            data: { definitionVersionId: rolledBackVersionId, revision: { increment: 1 } },
          });
          throw new Error('force onboarding rollback');
        }),
        /force onboarding rollback/,
      );
      assert.equal(
        await prisma.onboardingJourneyVersion.findUnique({ where: { id: rolledBackVersionId } }),
        null,
      );
      assert.notEqual(
        (await prisma.onboardingPlan.findUniqueOrThrow({ where: { id: planId } }))
          .definitionVersionId,
        rolledBackVersionId,
      );
    } finally {
      await prisma.onboardingPlan.deleteMany({ where: { ownerId } });
      await prisma.onboardingJourneyVersion.deleteMany({ where: { ownerId } });
      await prisma.onboardingSession.deleteMany({ where: { id: sessionId } });
      await prisma.onboardingSession.deleteMany({ where: { ownerId } });
      await prisma.$disconnect();
    }
  },
);
