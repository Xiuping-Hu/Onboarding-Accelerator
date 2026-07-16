import assert from 'node:assert/strict';
import test from 'node:test';
import type { AnswerProvider } from './openAiService';
import type { RagRetriever } from './ragService';
import { ChatOrchestrationService } from './chatService';
import { InMemorySessionRepository } from './sessionRepository';

void test('chat persists an explicit roadmap node reference and uses its evidence', async () => {
  const ownerId = 'reference-user';
  const sessions = new InMemorySessionRepository();
  const session = await sessions.create({ title: 'Reference test' }, ownerId);
  const now = new Date().toISOString();
  session.guide.rootNodeIds = ['node-access'];
  session.guide.nodes['node-access'] = {
    id: 'node-access',
    title: 'Tools & Access',
    summary: 'Set up approved systems.',
    children: [],
    depth: 0,
    status: 'generated',
    sources: [
      {
        id: 'source-access',
        title: 'Access policy',
        excerpt: 'Use the approved access request process.',
        sourceType: 'knowledge_base',
      },
    ],
    canExpand: false,
    maxDepth: 0,
    createdAt: now,
    updatedAt: now,
  };
  await sessions.save(session, ownerId);

  const rag: RagRetriever = {
    retrieve: async (query) => ({
      query,
      sources: [],
      knowledgeBaseSources: [],
      webSources: [],
    }),
  };
  let answerSourceIds: string[] = [];
  const answers: AnswerProvider = {
    answer: async ({ sources }) => {
      answerSourceIds = sources.map((source) => source.id);
      return { content: 'Use the referenced roadmap evidence.' };
    },
  };

  const response = await new ChatOrchestrationService(sessions, rag, answers).chat(
    session.id,
    {
      sessionId: session.id,
      message: 'What do I do here?',
      webSearchEnabled: false,
      referencedNodeId: 'node-access',
    },
    ownerId,
  );

  assert.deepEqual(answerSourceIds, ['source-access']);
  assert.deepEqual(response.focusStepIds, ['node-access']);
  assert.equal(response.session?.chatHistory[0]?.roadmapReferences?.[0]?.title, 'Tools & Access');
  assert.equal(response.session?.chatHistory[0]?.guideNodeIds?.[0], 'node-access');
});
