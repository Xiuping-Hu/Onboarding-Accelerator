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
import { createRagWorkflowController } from '../modules/rag-workflows/ragWorkflow.controller';
import {
  InMemoryRagWorkflowRepository,
  PrismaRagWorkflowRepository,
} from '../modules/rag-workflows/ragWorkflow.repository';
import { createRagWorkflowRuntime } from '../modules/rag-workflows/ragWorkflow.runtime';
import { RagWorkflowService } from '../modules/rag-workflows/ragWorkflow.service';
import { createWorkflowToolRegistry } from '../modules/rag-workflows/ragWorkflow.tools';
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
  const resolveRagAccessScopes = async (userId: string): Promise<string[]> => {
    if (knowledgeMaps) return knowledgeMaps.accessScopesFor(userId);
    if (prisma) {
      const now = new Date();
      const memberships = await prisma.knowledgeAudienceMembership.findMany({
        where: {
          accountId: userId,
          validFrom: { lte: now },
          OR: [{ validUntil: null }, { validUntil: { gt: now } }],
        },
        select: { accessScope: true },
      });
      if (memberships.length) return memberships.map((item) => item.accessScope);
    }
    return config.ragAllowedAccessScopes.length ? config.ragAllowedAccessScopes : ['all_users'];
  };
  const ragWorkflowRepository = prisma
    ? new PrismaRagWorkflowRepository(prisma)
    : new InMemoryRagWorkflowRepository();
  const ragWorkflowTools = createWorkflowToolRegistry({ rag, answers, knowledgeMaps });
  const ragWorkflowRuntime = config.mastraRagWorkflowEnabled
    ? createRagWorkflowRuntime({
        config,
        repository: ragWorkflowRepository,
        dependencies: {
          sessions,
          rag,
          tools: ragWorkflowTools,
          refreshAuthorization: async (actor) => {
            const currentUser = users ? await users.findById(actor.actorId) : undefined;
            if (users && (!currentUser || !currentUser.isActive)) {
              throw new Error('The workflow actor is no longer active.');
            }
            const accessScopes = await resolveRagAccessScopes(actor.actorId);
            return {
              ...actor,
              actorRole: currentUser
                ? currentUser.role === 'admin'
                  ? 'admin'
                  : 'user'
                : actor.actorRole,
              accessScopes: accessScopes.length ? accessScopes : ['all_users'],
            };
          },
        },
      })
    : undefined;
  const ragWorkflows = new RagWorkflowService({
    enabled: config.mastraRagWorkflowEnabled,
    sessions,
    repository: ragWorkflowRepository,
    runtime: ragWorkflowRuntime,
    resolveAccessScopes: resolveRagAccessScopes,
  });
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
    ragWorkflows,
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
    ragWorkflows: createRagWorkflowController(services.ragWorkflows),
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
    ragWorkflowRuntime,
    ragWorkflowRepository,
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
  if (globalContainer.__onboardingAppContainer?.ragWorkflowRuntime) {
    void globalContainer.__onboardingAppContainer.ragWorkflowRuntime.storage.close();
  }
  delete globalContainer.__onboardingAppContainer;
}
