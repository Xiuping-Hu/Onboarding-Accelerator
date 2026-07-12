import assert from 'node:assert/strict';
import test from 'node:test';
import { DeepSeekService } from './deepSeekService';

void test('DeepSeekService maps grounded chat requests and usage', async () => {
  let requestBody: Record<string, unknown> | undefined;
  const service = new DeepSeekService({
    apiKey: 'test-key',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    timeoutMs: 1000,
    maxRetries: 0,
    fetch: async (_url, init) => {
      requestBody = JSON.parse(String(init.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Grounded answer.' } }],
          usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    },
  });

  const answer = await service.answer({
    prompt: 'Who is on the team?',
    sources: [{ id: 'team', title: 'Our Team', excerpt: 'The team directory.' }],
  });

  assert.equal(requestBody?.model, 'deepseek-v4-flash');
  assert.equal(Array.isArray(requestBody?.messages), true);
  assert.equal(answer?.content, 'Grounded answer.');
  assert.deepEqual(answer?.usage, {
    model: 'deepseek-v4-flash',
    inputTokens: 10,
    outputTokens: 4,
    totalTokens: 14,
  });
});

void test('DeepSeekService is disabled without an API key', async () => {
  const service = new DeepSeekService({
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    timeoutMs: 1000,
    maxRetries: 0,
  });

  assert.equal(await service.answer({ prompt: 'hello', sources: [] }), undefined);
});
