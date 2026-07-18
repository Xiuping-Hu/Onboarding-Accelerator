import assert from 'node:assert/strict';
import test from 'node:test';
import type { OnboardingSession as PrismaOnboardingSession } from '@/generated/prisma/client';
import type { PrismaDatabase } from './infrastructure/prisma/prismaTypes';
import { PrismaSessionRepository } from './postgresSessionRepository';
import { SessionNotFoundError } from './sessionRepository';

void test('PrismaSessionRepository creates, lists, updates, and deletes scoped sessions', async () => {
  const rows = new Map<string, PrismaOnboardingSession>();
  const db = {
    onboardingSession: {
      create: async ({ data }: { data: PrismaOnboardingSession }) => {
        const row = { ...data, revision: 0n };
        rows.set(row.id, row);
        return row;
      },
      findMany: async ({ where }: { where: { ownerId: string } }) =>
        [...rows.values()].filter((row) => row.ownerId === where.ownerId),
      findFirst: async ({ where }: { where: { id: string; ownerId: string } }) => {
        const row = rows.get(where.id);
        return row?.ownerId === where.ownerId ? row : null;
      },
      updateMany: async ({ where, data }: UpdateArguments) => {
        const row = rows.get(where.id);
        if (!row || row.ownerId !== where.ownerId || row.revision !== where.revision)
          return { count: 0 };
        Object.assign(row, {
          ...data,
          revision: row.revision + 1n,
        });
        rows.set(row.id, row);
        return { count: 1 };
      },
      deleteMany: async ({ where }: { where: { id: string; ownerId: string } }) => {
        const row = rows.get(where.id);
        if (row?.ownerId !== where.ownerId) return { count: 0 };
        rows.delete(where.id);
        return { count: 1 };
      },
    },
  } as unknown as PrismaDatabase;
  const sessions = new PrismaSessionRepository(db);
  const created = await sessions.create({ title: 'Database session' }, 'owner-a');

  assert.equal((await sessions.list('owner-a')).length, 1);
  assert.equal((await sessions.list('owner-b')).length, 0);

  const updated = await sessions.update(
    created.id,
    { title: 'Updated', settings: { webSearchEnabled: true } },
    'owner-a',
  );
  assert.equal(updated.title, 'Updated');
  assert.equal(updated.settings.webSearchEnabled, true);

  await assert.rejects(
    () => sessions.save({ ...updated, title: 'Wrong owner update' }, 'owner-b'),
    SessionNotFoundError,
  );
  await assert.rejects(() => sessions.get(created.id, 'owner-b'), SessionNotFoundError);
  await sessions.delete(created.id, 'owner-a');
  await assert.rejects(() => sessions.get(created.id, 'owner-a'), SessionNotFoundError);
});

interface UpdateArguments {
  where: { id: string; ownerId: string; revision: bigint };
  data: Omit<Partial<PrismaOnboardingSession>, 'revision'> & {
    revision: { increment: number };
  };
}
