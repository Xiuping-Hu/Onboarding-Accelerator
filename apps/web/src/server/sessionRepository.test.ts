import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import {
  FileSessionRepository,
  InMemorySessionRepository,
  SessionNotFoundError,
} from './sessionRepository';

void test('session repository scopes sessions by owner', async () => {
  const sessions = new InMemorySessionRepository();
  const created = await sessions.create({ title: 'Scoped session' }, 'owner-a');

  assert.equal((await sessions.list('owner-a')).length, 1);
  assert.equal((await sessions.list('owner-b')).length, 0);
  await assert.rejects(() => sessions.get(created.id, 'owner-b'), SessionNotFoundError);
});

void test('file session repository persists sessions across instances', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'onboarding-sessions-'));
  const storePath = join(directory, 'sessions.json');

  try {
    const firstRepository = new FileSessionRepository(storePath);
    const created = await firstRepository.create({ title: 'Durable session' }, 'owner-a');

    const secondRepository = new FileSessionRepository(storePath);
    const restored = await secondRepository.get(created.id, 'owner-a');

    assert.equal(restored.title, 'Durable session');
    assert.equal((await secondRepository.list('owner-a')).length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

void test('file session repository rewrites existing store after save operations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'onboarding-sessions-'));
  const storePath = join(directory, 'sessions.json');

  try {
    const repository = new FileSessionRepository(storePath);
    const created = await repository.create({ title: 'Guide session' }, 'owner-a');
    const saved = await repository.save({
      ...created,
      guide: {
        ...created.guide,
        rootNodeIds: ['root-node'],
      },
    });
    const next = await repository.create({ title: 'Second session' }, 'owner-a');

    assert.deepEqual(saved.guide.rootNodeIds, ['root-node']);
    assert.equal((await repository.get(saved.id, 'owner-a')).guide.rootNodeIds[0], 'root-node');
    assert.equal((await repository.get(next.id, 'owner-a')).title, 'Second session');
    assert.equal((await repository.list('owner-a')).length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
