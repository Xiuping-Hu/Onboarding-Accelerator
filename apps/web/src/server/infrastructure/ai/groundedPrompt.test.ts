import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGroundedPrompt,
  formatGroundedHistory,
  onboardingSystemPrompt,
} from './groundedPrompt';

void test('instructs the model to keep multiple citations beside their supporting content', () => {
  const prompt = buildGroundedPrompt(
    'What should I do?',
    [
      { id: 'one', title: 'Handbook', excerpt: 'Read it.' },
      { id: 'two', title: 'Security policy', excerpt: 'Follow it.' },
    ],
    [],
  );

  assert.match(onboardingSystemPrompt, /immediately after the sentence or paragraph/i);
  assert.match(onboardingSystemPrompt, /\[\[1,2\]\]/);
  assert.match(prompt, /Source \[1\]: Handbook/);
  assert.match(prompt, /Source \[2\]: Security policy/);
  assert.match(prompt, /Do not collect citations in a source list at the end/);
});

void test('removes message-local citation numbers from conversation history', () => {
  const history = formatGroundedHistory([
    {
      id: 'answer',
      role: 'assistant',
      content: 'Complete setup. [[1]] Then request access. [[1, 2]]',
      createdAt: new Date().toISOString(),
    },
  ]);

  assert.equal(history[0]?.content, 'Complete setup.  Then request access.');
});
