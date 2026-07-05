import { ChatOrchestrationService } from './chatService';
import { loadConfig } from './config';
import { getDatabasePool } from './database';
import { OpenAiEmbeddingService } from './embeddingService';
import { GuideOrchestrationService } from './guideService';
import { PostgresAuthSessionRepository } from './authSessionRepository';
import { NoopLoginAuditRepository, PostgresLoginAuditRepository } from './loginAuditRepository';
import { FileLogService } from './logService';
import { OpenAiService } from './openAiService';
import { PgvectorKnowledgeBase } from './pgvectorKnowledgeBase';
import { PostgresSessionRepository } from './postgresSessionRepository';
import { createConfiguredRagInputAdapters } from './ragAdapters/index';
import { RagService } from './ragService';
import { FileSessionRepository } from './sessionRepository';
import { PostgresUserRepository } from './userRepository';
import { DisabledWebSearchProvider } from './webSearchProvider';

export function getServerServices() {
  const globalForServices = globalThis as typeof globalThis & {
    __onboardingServices?: ReturnType<typeof createServerServices>;
  };

  globalForServices.__onboardingServices ??= createServerServices();
  return globalForServices.__onboardingServices;
}

export function resetServerServicesForTests(): void {
  const globalForServices = globalThis as typeof globalThis & {
    __onboardingServices?: ReturnType<typeof createServerServices>;
  };

  delete globalForServices.__onboardingServices;
}

function createServerServices() {
  const config = loadConfig();
  const database = config.databaseUrl ? getDatabasePool(config.databaseUrl) : undefined;
  const users = database ? new PostgresUserRepository(database) : undefined;
  const authSessions = database ? new PostgresAuthSessionRepository(database) : undefined;
  const loginAudit = database
    ? new PostgresLoginAuditRepository(database)
    : new NoopLoginAuditRepository();
  const sessions =
    config.sessionStore === 'postgres' && database
      ? new PostgresSessionRepository(database)
      : new FileSessionRepository(config.sessionStorePath);
  const logs = new FileLogService(config.logStorePath);
  const openAi = new OpenAiService({
    apiKey: config.openAiApiKey,
    model: config.openAiModel,
    timeoutMs: config.openAiTimeoutMs,
    maxRetries: config.openAiMaxRetries,
    inputCostPer1MTokens: config.openAiInputCostPer1MTokens,
    outputCostPer1MTokens: config.openAiOutputCostPer1MTokens,
  });
  const vectorKnowledgeBase =
    config.ragVectorEnabled && database
      ? new PgvectorKnowledgeBase(
          database,
          new OpenAiEmbeddingService({
            apiKey: config.openAiApiKey,
            model: config.openAiEmbeddingModel,
            timeoutMs: config.openAiTimeoutMs,
            maxRetries: config.openAiMaxRetries,
          }),
          config.ragVectorLimit,
        )
      : undefined;
  const rag = new RagService(
    new DisabledWebSearchProvider(config.webSearchAllowed),
    createConfiguredRagInputAdapters(config),
    vectorKnowledgeBase,
  );
  const chat = new ChatOrchestrationService(sessions, rag, openAi, logs);
  const guide = new GuideOrchestrationService(sessions, rag, config.guideMaxDepth);
  const metrics = {
    startedAt: new Date().toISOString(),
    requestsTotal: 0,
    responsesTotal: 0,
  };

  return {
    authSessions,
    chat,
    config,
    guide,
    loginAudit,
    logs,
    metrics,
    openAi,
    rag,
    sessions,
    users,
  };
}
