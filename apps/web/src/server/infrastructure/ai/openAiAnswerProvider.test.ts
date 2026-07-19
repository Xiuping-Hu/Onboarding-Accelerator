import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenAiAnswerProvider } from './openAiAnswerProvider';

void test('OpenAiAnswerProvider maps grounded responses and usage', async () => {
  let requestBody: Record<string, unknown> | undefined;
  const provider = new OpenAiAnswerProvider({
    apiKey: 'test-key',
    model: 'gpt-test',
    timeoutMs: 1000,
    maxRetries: 0,
    fetch: async (_url, init) => {
      requestBody = JSON.parse(String(init.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          output_text: 'Grounded answer.',
          usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    },
  });

  const answer = await provider.answer({
    prompt: 'Who is on the team?',
    sources: [{ id: 'team', title: 'Our Team', excerpt: 'The team directory.' }],
  });

  assert.equal(requestBody?.model, 'gpt-test');
  assert.equal(Array.isArray(requestBody?.input), true);
  assert.equal(answer?.content, 'Grounded answer.');
  assert.deepEqual(answer?.usage, {
    model: 'gpt-test',
    inputTokens: 10,
    outputTokens: 4,
    totalTokens: 14,
  });
});

void test('OpenAiAnswerProvider is disabled without an API key', async () => {
  const provider = new OpenAiAnswerProvider({
    model: 'gpt-test',
    timeoutMs: 1000,
    maxRetries: 0,
  });

  assert.equal(await provider.answer({ prompt: 'hello', sources: [] }), undefined);
});
