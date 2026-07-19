import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnswerProvider, type AnswerProviderStrategyConfig } from './answerProviderFactory';
import { DeepSeekAnswerProvider } from './deepSeekAnswerProvider';
import { OpenAiAnswerProvider } from './openAiAnswerProvider';

const config: AnswerProviderStrategyConfig = {
  aiProvider: 'openai',
  openAiApiKey: 'openai-key',
  openAiModel: 'gpt-test',
  openAiTimeoutMs: 1000,
  openAiMaxRetries: 0,
  deepSeekApiKey: 'deepseek-key',
  deepSeekBaseUrl: 'https://api.deepseek.com',
  deepSeekModel: 'deepseek-test',
};

void test('answer-provider factory selects the configured strategy', () => {
  assert.ok(createAnswerProvider(config) instanceof OpenAiAnswerProvider);
  assert.ok(
    createAnswerProvider({ ...config, aiProvider: 'deepseek' }) instanceof DeepSeekAnswerProvider,
  );
});
