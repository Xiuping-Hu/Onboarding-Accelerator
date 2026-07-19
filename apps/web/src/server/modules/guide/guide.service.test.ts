import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemorySessionRepository } from '../../sessionRepository';
import { GuideService } from './guide.service';

void test('root guide reads stored session state without generating nodes', async () => {
  const ownerId = 'test-user';
  const sessions = new InMemorySessionRepository();
  const session = await sessions.create({ title: 'Stored roadmap test' }, ownerId);
  const guide = new GuideService(sessions);

  const root = await guide.generateRoot(session.id, {}, ownerId);
  const saved = await sessions.get(session.id, ownerId);

  assert.deepEqual(root.rootNodeIds, []);
  assert.deepEqual(root.nodes, []);
  assert.equal(root.knowledgeMapEnabled, false);
  assert.equal(Object.keys(saved.guide.nodes).length, 0);
});
