import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatMessage, OnboardingSession } from '@onboarding/shared';
import {
  appendSessionMessage,
  indexSessionMessages,
  removeSessionMessages,
  replaceSessionMessages,
  toPlanThreads,
} from './workspaceThreadModel';

const firstMessage: ChatMessage = {
  id: 'first-message',
  role: 'user',
  content: 'First plan question',
  createdAt: '2026-07-13T00:00:00.000Z',
};

const secondMessage: ChatMessage = {
  id: 'second-message',
  role: 'assistant',
  content: 'Second plan answer',
  createdAt: '2026-07-13T00:01:00.000Z',
};

const sessions: OnboardingSession[] = [
  {
    id: 'plan-one',
    title: 'First-week plan',
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T00:00:00.000Z',
    settings: { webSearchEnabled: false },
    chatHistory: [firstMessage],
    guide: { rootNodeIds: [], nodes: {}, expandedNodeIds: [] },
  },
  {
    id: 'plan-two',
    title: 'Onboarding plan 2',
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T00:01:00.000Z',
    settings: { webSearchEnabled: false },
    chatHistory: [],
    guide: { rootNodeIds: [], nodes: {}, expandedNodeIds: [] },
  },
];

void test('keeps chat histories isolated by plan when a response completes after a switch', () => {
  const indexed = indexSessionMessages(sessions);
  const withPendingAnswer = appendSessionMessage(indexed, 'plan-one', secondMessage);

  assert.deepEqual(withPendingAnswer['plan-one'], [firstMessage, secondMessage]);
  assert.deepEqual(withPendingAnswer['plan-two'], []);
});

void test('reconciles one plan from canonical saved history without changing another plan', () => {
  const indexed = indexSessionMessages(sessions);
  const canonicalHistory = [firstMessage, secondMessage];
  const reconciled = replaceSessionMessages(indexed, 'plan-one', canonicalHistory);

  assert.deepEqual(reconciled['plan-one'], canonicalHistory);
  assert.deepEqual(reconciled['plan-two'], []);
});

void test('removes only the deleted plan state and maps plan metadata to assistant-ui threads', () => {
  const indexed = indexSessionMessages(sessions);
  const remaining = removeSessionMessages(indexed, 'plan-one');

  assert.equal(remaining['plan-one'], undefined);
  assert.deepEqual(remaining['plan-two'], []);
  assert.deepEqual(toPlanThreads(sessions), [
    {
      id: 'plan-one',
      status: 'regular',
      title: 'First-week plan',
      custom: { updatedAt: '2026-07-13T00:00:00.000Z' },
    },
    {
      id: 'plan-two',
      status: 'regular',
      title: 'Onboarding plan 2',
      custom: { updatedAt: '2026-07-13T00:01:00.000Z' },
    },
  ]);
});
