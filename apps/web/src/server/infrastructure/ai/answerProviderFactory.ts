import type { AnswerProvider } from '../../core/ports/answerProvider';
import type { ServerConfig } from '../../config';
import { DeepSeekAnswerProvider } from './deepSeekAnswerProvider';
import { OpenAiAnswerProvider } from './openAiAnswerProvider';

export type AnswerProviderStrategyConfig = Pick<
  ServerConfig,
  | 'aiProvider'
  | 'openAiApiKey'
  | 'openAiModel'
  | 'openAiTimeoutMs'
  | 'openAiMaxRetries'
  | 'deepSeekApiKey'
  | 'deepSeekBaseUrl'
  | 'deepSeekModel'
>;

type AnswerProviderStrategyFactory = (config: AnswerProviderStrategyConfig) => AnswerProvider;

const answerProviderStrategies: Record<
  AnswerProviderStrategyConfig['aiProvider'],
  AnswerProviderStrategyFactory
> = {
  openai: (config) =>
    new OpenAiAnswerProvider({
      apiKey: config.openAiApiKey,
      model: config.openAiModel,
      timeoutMs: config.openAiTimeoutMs,
      maxRetries: config.openAiMaxRetries,
    }),
  deepseek: (config) =>
    new DeepSeekAnswerProvider({
      apiKey: config.deepSeekApiKey,
      baseUrl: config.deepSeekBaseUrl,
      model: config.deepSeekModel,
      timeoutMs: config.openAiTimeoutMs,
      maxRetries: config.openAiMaxRetries,
    }),
};

export function createAnswerProvider(config: AnswerProviderStrategyConfig): AnswerProvider {
  return answerProviderStrategies[config.aiProvider](config);
}
