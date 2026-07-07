import assert from 'node:assert/strict';
import test from 'node:test';
import type { DraftGuideMap, SourceProvenance } from '@onboarding/shared';
import { GuideOrchestrationService } from './guideService';
import type { RagRetriever, RetrievalContext } from './ragService';
import { InMemorySessionRepository } from './sessionRepository';

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

const draftGuideMap: DraftGuideMap = {
  title: 'Test onboarding map',
  nodes: [
    {
      clientId: 'setup',
      title: 'Setup',
      summary: 'Prepare access.',
      sourceIds: ['kb-setup'],
      position: 0,
    },
    {
      clientId: 'setup-context',
      parentClientId: 'setup',
      title: 'Setup context',
      summary: 'Understand the access model.',
      sourceIds: ['kb-setup'],
      position: 0,
    },
    {
      clientId: 'training',
      title: 'Training',
      summary: 'Complete role training.',
      sourceIds: ['kb-training'],
      position: 1,
    },
  ],
};

function createRag() {
  let calls = 0;
  const rag: RagRetriever = {
    async retrieve(query: string): Promise<RetrievalContext> {
      calls += 1;
      return {
        query,
        sources,
        knowledgeBaseSources: sources,
        webSources: [],
      };
    },
  };

  return {
    rag,
    get calls() {
      return calls;
    },
  };
}

void test('root guide starts empty until a map is created', async () => {
  const sessions = new InMemorySessionRepository();
  const session = await sessions.create({ title: 'Empty map test' }, ownerId);
  const rag = createRag();
  const guide = new GuideOrchestrationService(sessions, rag.rag, 2);

  const root = await guide.generateRoot(session.id, {}, ownerId);
  const saved = await sessions.get(session.id, ownerId);

  assert.deepEqual(root.rootNodeIds, []);
  assert.deepEqual(root.nodes, []);
  assert.equal(Object.keys(saved.guide.nodes).length, 0);
  assert.equal(rag.calls, 0);
});

void test('create map saves a draft into session guide state', async () => {
  const sessions = new InMemorySessionRepository();
  const session = await sessions.create({ title: 'Create map test' }, ownerId);
  session.chatHistory.push({
    id: 'assistant-with-sources',
    role: 'assistant',
    content: 'Draft map ready.',
    createdAt: new Date().toISOString(),
    sources,
  });
  await sessions.save(session, ownerId);
  const rag = createRag();
  const guide = new GuideOrchestrationService(sessions, rag.rag, 2);

  const created = await guide.createMap(session.id, { draftGuideMap }, ownerId);
  const saved = await sessions.get(session.id, ownerId);
  const rootId = created.rootNodeIds[0] as string;

  assert.equal(created.rootNodeIds.length, 2);
  assert.equal(Object.keys(saved.guide.nodes).length, 3);
  assert.equal(saved.guide.selectedNodeId, rootId);
  assert.equal(saved.guide.nodes[rootId]?.children.length, 1);
  assert.equal(saved.guide.nodes[rootId]?.sources[0]?.id, 'kb-setup');
  assert.equal(rag.calls, 0);
});

void test('expanding a guide node reveals existing children without duplicates', async () => {
  const sessions = new InMemorySessionRepository();
  const session = await sessions.create({ title: 'Reveal children test' }, ownerId);
  const rag = createRag();
  const guide = new GuideOrchestrationService(sessions, rag.rag, 2);
  const created = await guide.createMap(session.id, { draftGuideMap }, ownerId);
  const parentId = created.rootNodeIds[0] as string;

  const first = await guide.expand(session.id, { nodeId: parentId }, ownerId);
  const second = await guide.expand(session.id, { nodeId: parentId }, ownerId);
  const saved = await sessions.get(session.id, ownerId);

  assert.deepEqual(second.childNodeIds, first.childNodeIds);
  assert.equal(saved.guide.nodes[parentId]?.children.length, first.childNodeIds.length);
  assert.equal(Object.keys(saved.guide.nodes).length, 3);
  assert.equal(rag.calls, 0);
});

void test('focusing a leaf node leaves the guide unchanged', async () => {
  const sessions = new InMemorySessionRepository();
  const session = await sessions.create({ title: 'Leaf focus test' }, ownerId);
  const rag = createRag();
  const guide = new GuideOrchestrationService(sessions, rag.rag, 2);
  const created = await guide.createMap(session.id, { draftGuideMap }, ownerId);
  const leafId = created.rootNodeIds[1] as string;

  const focused = await guide.expand(session.id, { nodeId: leafId }, ownerId);
  const saved = await sessions.get(session.id, ownerId);

  assert.deepEqual(focused.childNodeIds, []);
  assert.deepEqual(focused.nodes, []);
  assert.equal(saved.guide.selectedNodeId, leafId);
  assert.equal(Object.keys(saved.guide.nodes).length, 3);
  assert.equal(rag.calls, 0);
});
