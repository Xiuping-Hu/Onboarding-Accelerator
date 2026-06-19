import assert from 'node:assert/strict';
import test from 'node:test';
import type { SourceProvenance } from '@onboarding/shared';
import { GuideOrchestrationService } from './guideService.js';
import type { RagService, RetrievalContext } from './ragService.js';
import { InMemorySessionRepository } from './sessionRepository.js';

const ownerId = 'test-user';

const sources: SourceProvenance[] = [
  {
    id: 'kb-setup',
    title: 'Setup guide',
    excerpt: 'Configure access and validate the required onboarding tools.',
    kind: 'knowledge-base',
  },
  {
    id: 'kb-training',
    title: 'Training guide',
    excerpt: 'Complete role training and confirm the expected policy steps.',
    kind: 'knowledge-base',
  },
];

function createRag() {
  let calls = 0;
  const rag = {
    async retrieve(query: string): Promise<RetrievalContext> {
      calls += 1;
      return {
        query,
        sources,
        knowledgeBaseSources: sources,
        webSources: [],
      };
    },
  } as unknown as RagService;

  return {
    rag,
    get calls() {
      return calls;
    },
  };
}

void test('expanding the same guide node twice returns existing children without duplicates', async () => {
  const sessions = new InMemorySessionRepository();
  const session = await sessions.create({ title: 'Duplicate expansion test' }, ownerId);
  const rag = createRag();
  const guide = new GuideOrchestrationService(sessions, rag.rag, 2);

  const root = await guide.generateRoot(session.id, {}, ownerId);
  const parentId = root.rootNodeIds[0] as string;
  const first = await guide.expand(session.id, { nodeId: parentId }, ownerId);
  const second = await guide.expand(session.id, { nodeId: parentId }, ownerId);
  const saved = await sessions.get(session.id, ownerId);

  assert.deepEqual(second.childNodeIds, first.childNodeIds);
  assert.equal(saved.guide.nodes[parentId]?.children.length, first.childNodeIds.length);
  assert.equal(Object.keys(saved.guide.nodes).length, root.rootNodeIds.length + first.nodes.length);
  assert.equal(rag.calls, 2);
});

void test('server enforces max guide depth and exposes non-expandable leaf state', async () => {
  const sessions = new InMemorySessionRepository();
  const session = await sessions.create({ title: 'Depth enforcement test' }, ownerId);
  const rag = createRag();
  const guide = new GuideOrchestrationService(sessions, rag.rag, 1);

  const root = await guide.generateRoot(session.id, {}, ownerId);
  const first = await guide.expand(session.id, { nodeId: root.rootNodeIds[0] as string }, ownerId);
  const childId = first.childNodeIds[0] as string;
  const blocked = await guide.expand(session.id, { nodeId: childId }, ownerId);
  const saved = await sessions.get(session.id, ownerId);

  assert.equal(blocked.childNodeIds.length, 0);
  assert.equal(blocked.nodes.length, 0);
  assert.equal(saved.guide.nodes[childId]?.canExpand, false);
  assert.equal(saved.guide.nodes[childId]?.children.length, 0);
  assert.equal(rag.calls, 2);
});
