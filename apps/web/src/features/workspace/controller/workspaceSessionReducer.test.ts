import assert from 'node:assert/strict';
import test from 'node:test';
import type { ChatMessage, OnboardingSession } from '@onboarding/shared';
import { initialWorkspaceSessionState, workspaceSessionReducer } from './workspaceSessionReducer';

void test('keeps assistant and guide session selection independent', () => {
  const first = session('first');
  const second = session('second');
  const bootstrapped = workspaceSessionReducer(initialWorkspaceSessionState, {
    type: 'bootstrapped',
    sessions: [first, second],
  });
  const selected = workspaceSessionReducer(bootstrapped, {
    type: 'session-selected',
    sessionId: second.id,
  });

  assert.equal(selected.activeSessionId, second.id);
  assert.equal(selected.guideSessionId, first.id);
});

void test('deleting an active guide session selects one valid fallback for both concerns', () => {
  const first = session('first');
  const second = session('second');
  const bootstrapped = workspaceSessionReducer(initialWorkspaceSessionState, {
    type: 'bootstrapped',
    sessions: [first, second],
  });
  const deleting = workspaceSessionReducer(bootstrapped, {
    type: 'delete-started',
    sessionId: first.id,
  });
  const deleted = workspaceSessionReducer(deleting, {
    type: 'delete-finished',
    sessionId: first.id,
  });

  assert.deepEqual(
    deleted.sessions.map(({ id }) => id),
    [second.id],
  );
  assert.equal(deleted.activeSessionId, second.id);
  assert.equal(deleted.guideSessionId, second.id);
  assert.equal(deleted.deletingSessionId, null);
});

void test('protects the final session and tracks chat runs independently', () => {
  const only = session('only');
  const bootstrapped = workspaceSessionReducer(initialWorkspaceSessionState, {
    type: 'bootstrapped',
    sessions: [only],
  });
  const protectedState = workspaceSessionReducer(bootstrapped, {
    type: 'delete-started',
    sessionId: only.id,
  });
  const firstRun = workspaceSessionReducer(protectedState, {
    type: 'run-started',
    sessionId: only.id,
  });
  const secondRun = workspaceSessionReducer(firstRun, {
    type: 'run-started',
    sessionId: 'another',
  });
  const completed = workspaceSessionReducer(secondRun, {
    type: 'run-finished',
    sessionId: only.id,
  });

  assert.equal(protectedState.deletingSessionId, null);
  assert.deepEqual(completed.runningSessionIds, ['another']);
});

void test('keeps messages isolated by session through append and replacement', () => {
  const first = session('first');
  const second = session('second');
  const message: ChatMessage = {
    id: 'message-1',
    role: 'user',
    content: 'Hello',
    createdAt: '2026-07-31T12:00:00.000Z',
  };
  const bootstrapped = workspaceSessionReducer(initialWorkspaceSessionState, {
    type: 'bootstrapped',
    sessions: [first, second],
  });
  const appended = workspaceSessionReducer(bootstrapped, {
    type: 'message-appended',
    sessionId: first.id,
    message,
  });
  const replaced = workspaceSessionReducer(appended, {
    type: 'messages-replaced',
    sessionId: second.id,
    messages: [{ ...message, id: 'message-2' }],
  });

  assert.deepEqual(replaced.messagesBySessionId[first.id], [message]);
  assert.equal(replaced.messagesBySessionId[second.id]?.[0]?.id, 'message-2');
});

function session(id: string): OnboardingSession {
  return {
    id,
    title: id,
    createdAt: '2026-07-31T12:00:00.000Z',
    updatedAt: '2026-07-31T12:00:00.000Z',
    settings: { webSearchEnabled: false },
    chatHistory: [],
    guide: { rootNodeIds: [], nodes: {}, expandedNodeIds: [] },
  };
}
