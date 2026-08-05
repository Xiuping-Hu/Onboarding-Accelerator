import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGroundedPrompt,
  formatGroundedHistory,
  onboardingSystemPrompt,
  parseGroundedAnswer,
} from './groundedPrompt';

const sources = [
  { id: 'one', title: 'Handbook', excerpt: 'Read it.' },
  { id: 'two', title: 'Security policy', excerpt: 'Follow it.' },
];

void test('requests structured segments for multiple source references', () => {
  const prompt = buildGroundedPrompt('What should I do?', sources, []);

  assert.match(onboardingSystemPrompt, /Return only the requested JSON object/i);
  assert.match(onboardingSystemPrompt, /attach sourceNumbers to the exact segment/i);
  assert.match(prompt, /Source \[1\]: Handbook/);
  assert.match(prompt, /Source \[2\]: Security policy/);
  assert.match(prompt, /"segments"/);
  assert.match(prompt, /"sourceNumbers"/);
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

void test('maps validated source numbers to stable IDs on ordered answer segments', () => {
  const answer = parseGroundedAnswer(
    JSON.stringify({
      segments: [
        { markdown: 'Read the handbook.', sourceNumbers: [1] },
        { markdown: 'Then complete security training.', sourceNumbers: [1, 2, 2] },
      ],
    }),
    sources,
  );

  assert.deepEqual(answer, {
    content: 'Read the handbook.\n\nThen complete security training.',
    citationSegments: [
      { markdown: 'Read the handbook.', sourceIds: ['one'] },
      { markdown: 'Then complete security training.', sourceIds: ['one', 'two'] },
    ],
  });
});

void test('rejects malformed, uncited, and unknown-source model output', () => {
  assert.equal(parseGroundedAnswer('Not JSON', sources), undefined);
  assert.equal(
    parseGroundedAnswer(
      JSON.stringify({ segments: [{ markdown: 'No citation.', sourceNumbers: [] }] }),
      sources,
    ),
    undefined,
  );
  assert.equal(
    parseGroundedAnswer(
      JSON.stringify({ segments: [{ markdown: 'Unknown citation.', sourceNumbers: [3] }] }),
      sources,
    ),
    undefined,
  );
});

void test('accepts fenced structured output when no source is available', () => {
  const answer = parseGroundedAnswer(
    '```json\n{"segments":[{"markdown":"I cannot verify that.","sourceNumbers":[]}]}\n```',
    [],
  );

  assert.deepEqual(answer?.citationSegments, [
    { markdown: 'I cannot verify that.', sourceIds: [] },
  ]);
});
