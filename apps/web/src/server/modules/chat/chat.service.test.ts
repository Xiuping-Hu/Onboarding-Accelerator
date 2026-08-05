import assert from 'node:assert/strict';
import test from 'node:test';
import type { AnswerProvider } from '../../core/ports/answerProvider';
import type { RagRetriever } from '../rag/rag.service';
import { InMemorySessionRepository } from '../../sessionRepository';
import { ChatService, normalizeCitationSegments } from './chat.service';

void test('normalizes structured citations only when every source ID was retrieved', () => {
  const sources = [{ id: 'source-1', title: 'Handbook', excerpt: 'Approved evidence.' }];

  assert.deepEqual(
    normalizeCitationSegments(
      [{ markdown: '  Grounded answer.  ', sourceIds: ['source-1', 'source-1'] }],
      sources,
    ),
    [{ markdown: 'Grounded answer.', sourceIds: ['source-1'] }],
  );
  assert.equal(
    normalizeCitationSegments(
      [{ markdown: 'Unknown evidence.', sourceIds: ['not-retrieved'] }],
      sources,
    ),
    undefined,
  );
  assert.equal(
    normalizeCitationSegments([{ markdown: 'Missing citation.', sourceIds: [] }], sources),
    undefined,
  );
});

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
      sources: [
        {
          id: 'source-unused',
          title: 'Uncited retrieval result',
          excerpt: 'This source is retrieved but not used in the answer.',
        },
      ],
      knowledgeBaseSources: [],
      webSources: [],
    }),
  };
  let answerSourceIds: string[] = [];
  const answers: AnswerProvider = {
    answer: async ({ sources }) => {
      answerSourceIds = sources.map((source) => source.id);
      return {
        content: 'Use the referenced roadmap evidence.',
        citationSegments: [
          { markdown: 'Use the referenced roadmap evidence.', sourceIds: ['source-access'] },
        ],
      };
    },
  };

  const response = await new ChatService(sessions, rag, answers).chat(
    session.id,
    {
      sessionId: session.id,
      message: 'What do I do here?',
      webSearchEnabled: false,
      referencedNodeId: 'node-access',
    },
    ownerId,
  );

  assert.deepEqual(answerSourceIds, ['source-access', 'source-unused']);
  assert.deepEqual(
    response.sources.map((source) => source.id),
    ['source-access'],
  );
  assert.deepEqual(response.focusStepIds, ['node-access']);
  assert.equal(response.session?.chatHistory[0]?.roadmapReferences?.[0]?.title, 'Tools & Access');
  assert.equal(response.session?.chatHistory[0]?.guideNodeIds?.[0], 'node-access');
  assert.deepEqual(response.message.citationSegments, [
    { markdown: 'Use the referenced roadmap evidence.', sourceIds: ['source-access'] },
  ]);
  assert.equal(
    response.session?.chatHistory[1]?.sources?.[0]?.excerpt,
    'Use the approved access request process.',
  );
  assert.equal(response.session?.chatHistory[1]?.sources?.[0]?.href, '/api/sources/source-access');

  const persistedSession = await sessions.get(session.id, ownerId);
  assert.equal(
    persistedSession.chatHistory[1]?.sources?.[0]?.excerpt,
    'Evidence is resolved after the current access policy is checked.',
  );
  assert.equal(persistedSession.chatHistory[1]?.sources?.[0]?.href, undefined);
  assert.deepEqual(persistedSession.chatHistory[1]?.citationSegments, [
    { markdown: 'Use the referenced roadmap evidence.', sourceIds: ['source-access'] },
  ]);
});
