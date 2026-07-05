import { ChatOrchestrationService } from './chatService';
import { loadConfig } from './config';
import { getDatabasePool } from './database';
import { OpenAiEmbeddingService } from './embeddingService';
import { GuideOrchestrationService } from './guideService';
import { FileLogService } from './logService';
import { OpenAiService } from './openAiService';
import {
  AdminActivityLogService,
  AiFeeService,
  FileAiFeeAdjustmentService,
  FileAdminAuditService,
  FileAiRateCardService,
} from './adminOpsService';
import { PgvectorKnowledgeBase } from './pgvectorKnowledgeBase';
import { PostgresSessionRepository } from './postgresSessionRepository';
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
  const database = config.databaseUrl ? getDatabasePool(config.databaseUrl) : undefined;
  const sessions =
    config.sessionStore === 'postgres' && database
      ? new PostgresSessionRepository(database)
      : new FileSessionRepository(config.sessionStorePath);
  const logs = new FileLogService(config.logStorePath);
  const adminActivity = new AdminActivityLogService(config.logStorePath);
  const adminAudit = new FileAdminAuditService(config.adminAuditStorePath);
  const aiRates = new FileAiRateCardService(config.aiRateCardsStorePath);
  const aiAdjustments = new FileAiFeeAdjustmentService(config.aiFeeAdjustmentsStorePath);
  const aiFees = new AiFeeService(adminActivity, aiRates);
  const openAi = new OpenAiService({
    apiKey: config.openAiApiKey,
    model: config.openAiModel,
    timeoutMs: config.openAiTimeoutMs,
    maxRetries: config.openAiMaxRetries,
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
    adminActivity,
    adminAudit,
    aiAdjustments,
    aiFees,
    aiRates,
    chat,
    config,
    guide,
    logs,
    metrics,
    openAi,
    rag,
    sessions,
  };
}
