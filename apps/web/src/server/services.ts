import { ChatOrchestrationService } from './chatService';
import { loadConfig } from './config';
import { GuideOrchestrationService } from './guideService';
import { FileLogService } from './logService';
import { OpenAiService } from './openAiService';
import { createConfiguredRagInputAdapters } from './ragAdapters/index';
import { RagService } from './ragService';
import { FileSessionRepository } from './sessionRepository';
import { DisabledWebSearchProvider } from './webSearchProvider';

export function getServerServices() {
  const globalForServices = globalThis as typeof globalThis & {
    __onboardingServices?: ReturnType<typeof createServerServices>;
  };

  globalForServices.__onboardingServices ??= createServerServices();
  return globalForServices.__onboardingServices;
}

function createServerServices() {
  const config = loadConfig();
  const sessions = new FileSessionRepository(config.sessionStorePath);
  const logs = new FileLogService(config.logStorePath);
  const openAi = new OpenAiService({
    apiKey: config.openAiApiKey,
    model: config.openAiModel,
    timeoutMs: config.openAiTimeoutMs,
    maxRetries: config.openAiMaxRetries,
    inputCostPer1MTokens: config.openAiInputCostPer1MTokens,
    outputCostPer1MTokens: config.openAiOutputCostPer1MTokens,
  });
  const rag = new RagService(
    new DisabledWebSearchProvider(config.webSearchAllowed),
    createConfiguredRagInputAdapters(config),
  );
  const chat = new ChatOrchestrationService(sessions, rag, openAi, logs);
  const guide = new GuideOrchestrationService(sessions, rag, config.guideMaxDepth);
  const metrics = {
    startedAt: new Date().toISOString(),
    requestsTotal: 0,
    responsesTotal: 0,
  };

  return { chat, config, guide, logs, metrics, openAi, rag, sessions };
}
