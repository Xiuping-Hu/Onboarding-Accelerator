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
          output_text: JSON.stringify({
            segments: [{ markdown: 'Grounded answer.', sourceNumbers: [1] }],
          }),
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
  assert.deepEqual(answer?.citationSegments, [
    { markdown: 'Grounded answer.', sourceIds: ['team'] },
  ]);
  assert.deepEqual(answer?.usage, {
    model: 'gpt-test',
    inputTokens: 10,
    outputTokens: 4,
    totalTokens: 14,
  });
});

void test('OpenAiAnswerProvider rejects an unstructured grounded response', async () => {
  const provider = new OpenAiAnswerProvider({
    apiKey: 'test-key',
    model: 'gpt-test',
    timeoutMs: 1000,
    maxRetries: 0,
    fetch: async () =>
      new Response(JSON.stringify({ output_text: 'Grounded answer without citations.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  });

  assert.equal(
    await provider.answer({
      prompt: 'Who is on the team?',
      sources: [{ id: 'team', title: 'Our Team', excerpt: 'The team directory.' }],
    }),
    undefined,
  );
});

void test('OpenAiAnswerProvider constrains structured responses with JSON Schema', async () => {
  let requestBody: Record<string, unknown> | undefined;
  const provider = new OpenAiAnswerProvider({
    apiKey: 'test-key',
    model: 'gpt-test',
    timeoutMs: 1000,
    maxRetries: 0,
    fetch: async (_url, init) => {
      requestBody = JSON.parse(String(init.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ output_text: '{"title":"Plan"}' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  const result = await provider.generateStructured?.({
    system: 'Return JSON.',
    prompt: 'Create a plan.',
    responseSchema: {
      name: 'onboarding_plan',
      schema: {
        type: 'object',
        properties: { title: { type: 'string' } },
        required: ['title'],
        additionalProperties: false,
      },
    },
  });

  assert.equal(result?.content, '{"title":"Plan"}');
  assert.deepEqual(requestBody?.text, {
    format: {
      type: 'json_schema',
      name: 'onboarding_plan',
      strict: true,
      schema: {
        type: 'object',
        properties: { title: { type: 'string' } },
        required: ['title'],
        additionalProperties: false,
      },
    },
  });
});

void test('OpenAiAnswerProvider falls back to JSON mode when a schema is unsupported', async () => {
  const formats: unknown[] = [];
  const provider = new OpenAiAnswerProvider({
    apiKey: 'test-key',
    model: 'legacy-test',
    timeoutMs: 1000,
    maxRetries: 0,
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init.body)) as { text?: { format?: unknown } };
      formats.push(body.text?.format);
      return formats.length === 1
        ? new Response('{"error":"unsupported schema"}', { status: 400 })
        : new Response(JSON.stringify({ output_text: '{}' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
    },
  });

  await provider.generateStructured?.({
    system: 'Return JSON.',
    prompt: 'Create a plan.',
    responseSchema: { name: 'plan', schema: { type: 'object' } },
  });

  assert.equal(formats.length, 2);
  assert.deepEqual(formats[1], { type: 'json_object' });
});

void test('OpenAiAnswerProvider is disabled without an API key', async () => {
  const provider = new OpenAiAnswerProvider({
    model: 'gpt-test',
    timeoutMs: 1000,
    maxRetries: 0,
  });

  assert.equal(await provider.answer({ prompt: 'hello', sources: [] }), undefined);
});
