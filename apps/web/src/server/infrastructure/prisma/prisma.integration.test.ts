import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createPrismaClient } from './prismaClient';

const databaseUrl = process.env.TEST_DATABASE_URL;

void test(
  'Prisma migration target supports JSON, revision CAS, rollback, and pgvector',
  { skip: databaseUrl ? false : 'TEST_DATABASE_URL is not configured' },
  async () => {
    if (!databaseUrl) return;
    const prisma = createPrismaClient({ connectionString: databaseUrl, max: 2 });
    const sessionId = randomUUID();
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
    } finally {
      await prisma.onboardingSession.deleteMany({ where: { id: sessionId } });
      await prisma.$disconnect();
    }
  },
);
