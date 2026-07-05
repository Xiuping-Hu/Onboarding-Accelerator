import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatMessage } from '@onboarding/shared';
import { getAppendMessageText, toAssistantMessage } from './assistantMessageMapping';

const message: ChatMessage = {
  id: 'assistant-1',
  role: 'assistant',
  content: 'Here is the next step.',
  createdAt: '2026-07-05T10:00:00.000Z',
  focusStepIds: ['step-1'],
  sources: [
    {
      id: 'source-1',
      title: 'Handbook',
      excerpt: 'Set up access first.',
      sourceType: 'knowledge_base',
    },
  ],
  usage: {
    model: 'test-model',
    inputTokens: 10,
    outputTokens: 15,
    totalTokens: 25,
  },
};

void test('maps chat messages to assistant-ui text messages with metadata', () => {
  const mapped = toAssistantMessage(message);

  assert.equal(mapped.id, 'assistant-1');
  assert.equal(mapped.role, 'assistant');
  assert.deepEqual(mapped.content, [{ type: 'text', text: 'Here is the next step.' }]);
  assert.equal(mapped.createdAt?.toISOString(), '2026-07-05T10:00:00.000Z');
  assert.deepEqual(mapped.metadata?.custom?.focusStepIds, ['step-1']);
  assert.deepEqual(mapped.metadata?.custom?.sources, message.sources);
  assert.deepEqual(mapped.metadata?.custom?.usage, message.usage);
});

void test('extracts text from assistant-ui append messages', () => {
  assert.equal(
    getAppendMessageText({
      content: [
        { type: 'text', text: 'First ' },
        { type: 'text', text: 'second' },
        { type: 'image', image: 'ignored' },
      ],
    }),
    'First second',
  );
});
