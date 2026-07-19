import {
  AdminActivityLogService,
  AiFeeService,
  FileAiFeeAdjustmentService,
  FileAdminAuditService,
  FileAiRateCardService,
} from '../adminOpsService';
import { PrismaAuthSessionRepository } from '../authSessionRepository';
import { loadConfig } from '../config';
import { LocalHashEmbeddingService, OpenAiEmbeddingService } from '../embeddingService';
import { createAnswerProvider } from '../infrastructure/ai/answerProviderFactory';
import { getPrismaClient } from '../infrastructure/prisma/prismaClient';
import { PrismaReadinessProbe } from '../infrastructure/prisma/prismaReadiness';
import { PrismaKnowledgeMapRepository } from '../knowledgeMapService';
import { PrismaLoginAuditRepository, NoopLoginAuditRepository } from '../loginAuditRepository';
import { ConsoleLogService, FileLogService } from '../logService';
import {
  createAdminActivityController,
  createAdminAiFeeController,
  createAdminAuditController,
} from '../modules/admin/admin.controller';
import {
  AdminActivityService,
  AdminAiFeeService,
  AdminAuditService,
} from '../modules/admin/admin.service';
import { createAskController } from '../modules/ask/ask.controller';
import { AskService } from '../modules/ask/ask.service';
import { createAuthController } from '../modules/auth/auth.controller';
import { AuthService } from '../modules/auth/auth.service';
import { createChatController } from '../modules/chat/chat.controller';
import { ChatService } from '../modules/chat/chat.service';
import { createGuideController } from '../modules/guide/guide.controller';
import { GuideService } from '../modules/guide/guide.service';
import { createAdminKnowledgeMapController } from '../modules/knowledge-maps/knowledgeMap.controller';
import { KnowledgeMapService } from '../modules/knowledge-maps/knowledgeMap.application.service';
import { AdminKnowledgeMapService } from '../modules/knowledge-maps/knowledgeMap.service';
import { createLogController } from '../modules/logs/log.controller';
import { LogQueryService } from '../modules/logs/log.service';
import { createSessionController } from '../modules/sessions/session.controller';
import { SessionService } from '../modules/sessions/session.service';
import { createSystemController } from '../modules/system/system.controller';
import { SystemService } from '../modules/system/system.service';
import { PgvectorKnowledgeBase } from '../pgvectorKnowledgeBase';
import { PrismaSessionRepository } from '../postgresSessionRepository';
import { createConfiguredRagInputAdapters } from '../ragAdapters/index';
import { RagService } from '../modules/rag/rag.service';
import { FileSessionRepository } from '../sessionRepository';
import { PrismaUserRepository } from '../userRepository';
import { DisabledWebSearchProvider } from '../webSearchProvider';

export function createAppContainer() {
  const config = loadConfig();
  const prisma = config.databaseUrl
    ? getPrismaClient({
        connectionString: config.databaseUrl,
        max: config.postgresPoolMax,
        ssl: config.postgresSsl,
      })
    : undefined;
  const users = prisma ? new PrismaUserRepository(prisma) : undefined;
  const authSessions = prisma ? new PrismaAuthSessionRepository(prisma) : undefined;
  const loginAudit = prisma
    ? new PrismaLoginAuditRepository(prisma)
    : new NoopLoginAuditRepository();
  const sessions =
    config.sessionStore === 'postgres' && prisma
      ? new PrismaSessionRepository(prisma)
      : new FileSessionRepository(config.sessionStorePath);
  const knowledgeMaps =
    config.ragKnowledgeMapEnabled && prisma
      ? new KnowledgeMapService(new PrismaKnowledgeMapRepository(prisma))
      : undefined;
  const logs =
    process.env.VERCEL === '1' ? new ConsoleLogService() : new FileLogService(config.logStorePath);
  const adminActivity = new AdminActivityLogService(config.logStorePath);
  const adminAudit = new FileAdminAuditService(config.adminAuditStorePath);
  const aiRates = new FileAiRateCardService(config.aiRateCardsStorePath);
  const aiAdjustments = new FileAiFeeAdjustmentService(config.aiFeeAdjustmentsStorePath);
  const aiFees = new AiFeeService(adminActivity, aiRates);
  const answers = createAnswerProvider(config);
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
    config.ragVectorEnabled && prisma
      ? new PgvectorKnowledgeBase(
          prisma,
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
  const chat = new ChatService(sessions, rag, answers, logs, knowledgeMaps);
  const metrics = {
    startedAt: new Date().toISOString(),
    requestsTotal: 0,
    responsesTotal: 0,
  };

  const services = {
    adminActivity: new AdminActivityService(adminActivity, adminAudit),
    adminAiFees: new AdminAiFeeService(aiFees, aiRates, aiAdjustments, adminAudit),
    adminAudit: new AdminAuditService(adminAudit),
    adminKnowledgeMaps: new AdminKnowledgeMapService(knowledgeMaps),
    ask: new AskService(rag, answers, logs),
    auth: new AuthService(config, authSessions, users, loginAudit),
    chat,
    guide: new GuideService(sessions, knowledgeMaps),
    logs: new LogQueryService(logs),
    sessions: new SessionService(sessions),
    system: new SystemService(
      metrics,
      prisma
        ? new PrismaReadinessProbe(
            prisma,
            !config.authDisabled ||
              config.sessionStore === 'postgres' ||
              config.ragVectorEnabled ||
              config.ragKnowledgeMapEnabled,
          )
        : undefined,
    ),
  };

  const controllers = {
    adminActivity: createAdminActivityController(services.adminActivity),
    adminAiFees: createAdminAiFeeController(services.adminAiFees),
    adminAudit: createAdminAuditController(services.adminAudit),
    adminKnowledgeMaps: createAdminKnowledgeMapController(services.adminKnowledgeMaps),
    ask: createAskController(services.ask),
    auth: createAuthController(services.auth),
    chat: createChatController(services.chat),
    guide: createGuideController(services.guide),
    logs: createLogController(services.logs),
    sessions: createSessionController(services.sessions),
    system: createSystemController(services.system),
  };

  return {
    config,
    prisma,
    users,
    authSessions,
    loginAudit,
    sessionRepository: sessions,
    knowledgeMaps,
    logs,
    metrics,
    services,
    controllers,
  };
}

export type AppContainer = ReturnType<typeof createAppContainer>;
export type AppControllers = AppContainer['controllers'];

export function getAppContainer(): AppContainer {
  const globalContainer = globalThis as typeof globalThis & {
    __onboardingAppContainer?: AppContainer;
  };
  globalContainer.__onboardingAppContainer ??= createAppContainer();
  return globalContainer.__onboardingAppContainer;
}

export function resetAppContainerForTests(): void {
  const globalContainer = globalThis as typeof globalThis & {
    __onboardingAppContainer?: AppContainer;
  };
  delete globalContainer.__onboardingAppContainer;
}
