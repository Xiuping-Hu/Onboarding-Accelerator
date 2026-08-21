import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ASSISTANT_MAX_WIDTH,
  ASSISTANT_MIN_WIDTH,
  getWorkspaceAssistantMaxWidth,
} from './useWorkspaceAssistantSizing';

void test('limits assistant width from the measured workspace grid', () => {
  assert.equal(getWorkspaceAssistantMaxWidth(744), ASSISTANT_MIN_WIDTH);
  assert.equal(getWorkspaceAssistantMaxWidth(864), 420);
  assert.equal(getWorkspaceAssistantMaxWidth(1_120), 676);
  assert.equal(getWorkspaceAssistantMaxWidth(1_400), ASSISTANT_MAX_WIDTH);
});
