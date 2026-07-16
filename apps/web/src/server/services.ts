import {
  AdminActivityLogService,
  AiFeeService,
  FileAiFeeAdjustmentService,
  FileAdminAuditService,
  FileAiRateCardService,
} from './adminOpsService';
import { PostgresAuthSessionRepository } from './authSessionRepository';
import { ChatOrchestrationService } from './chatService';
import { loadConfig } from './config';
import { getDatabasePool } from './database';
import { DeepSeekService } from './deepSeekService';
import { LocalHashEmbeddingService, OpenAiEmbeddingService } from './embeddingService';
import { GuideOrchestrationService } from './guideService';
import { KnowledgeMapService } from './knowledgeMapService';
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
  const knowledgeMaps =
    config.ragKnowledgeMapEnabled && database ? new KnowledgeMapService(database) : undefined;
  const logs = new FileLogService(config.logStorePath);
  const adminActivity = new AdminActivityLogService(config.logStorePath);
  const adminAudit = new FileAdminAuditService(config.adminAuditStorePath);
  const aiRates = new FileAiRateCardService(config.aiRateCardsStorePath);
  const aiAdjustments = new FileAiFeeAdjustmentService(config.aiFeeAdjustmentsStorePath);
  const aiFees = new AiFeeService(adminActivity, aiRates);
  const openAi =
    config.aiProvider === 'deepseek'
      ? new DeepSeekService({
          apiKey: config.deepSeekApiKey,
          baseUrl: config.deepSeekBaseUrl,
          model: config.deepSeekModel,
          timeoutMs: config.openAiTimeoutMs,
          maxRetries: config.openAiMaxRetries,
        })
      : new OpenAiService({
          apiKey: config.openAiApiKey,
          model: config.openAiModel,
          timeoutMs: config.openAiTimeoutMs,
          maxRetries: config.openAiMaxRetries,
        });
  const embeddings =
    config.embeddingProvider === 'local'
      ? new LocalHashEmbeddingService()
      : new OpenAiEmbeddingService({
          apiKey: config.openAiApiKey,
          model: config.openAiEmbeddingModel,
          timeoutMs: config.openAiTimeoutMs,
          maxRetries: config.openAiMaxRetries,
        });
  const vectorKnowledgeBase =
    config.ragVectorEnabled && database
      ? new PgvectorKnowledgeBase(
          database,
          embeddings,
          config.ragVectorLimit,
          config.ragAllowedAccessScopes,
          config.embeddingProfile,
        )
      : undefined;
  const rag = new RagService(
    new DisabledWebSearchProvider(config.webSearchAllowed),
    config.ragInputAdaptersEnabled ? createConfiguredRagInputAdapters(config) : [],
    vectorKnowledgeBase,
    config.ragSeedKnowledgeEnabled,
  );
  const chat = new ChatOrchestrationService(sessions, rag, openAi, logs, knowledgeMaps);
  const guide = new GuideOrchestrationService(sessions);
  const metrics = {
    startedAt: new Date().toISOString(),
    requestsTotal: 0,
    responsesTotal: 0,
  };

  return {
    adminActivity,
    adminAudit,
    aiAdjustments,
    aiFees,
    aiRates,
    authSessions,
    chat,
    config,
    guide,
    loginAudit,
    knowledgeMaps,
    logs,
    metrics,
    openAi,
    rag,
    sessions,
    users,
  };
}
