import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { embeddingProfileFor } from './embeddingProfile';

loadDotEnv();

export interface ServerConfig {
  aiProvider: 'openai' | 'deepseek';
  nodeEnv: string;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  authDisabled: boolean;
  authCookieName: string;
  authSessionDurationMs: number;
  authSecureCookie: boolean;
  authMicrosoftTenantId?: string;
  authMicrosoftClientId?: string;
  authMicrosoftClientSecret?: string;
  authMicrosoftRedirectUri?: string;
  authMicrosoftAutoProvision: boolean;
  databaseUrl?: string;
  postgresSsl: boolean;
  postgresPoolMax: number;
  sessionStore: 'file' | 'postgres';
  sessionStorePath: string;
  logStorePath: string;
  adminAuditStorePath: string;
  aiRateCardsStorePath: string;
  aiFeeAdjustmentsStorePath: string;
  webSearchAllowed: boolean;
  openAiApiKey?: string;
  openAiModel: string;
  openAiTimeoutMs: number;
  openAiMaxRetries: number;
  deepSeekApiKey?: string;
  deepSeekBaseUrl: string;
  deepSeekModel: string;
  embeddingProvider: 'openai' | 'local';
  embeddingProfile: string;
  guideMaxDepth: number;
  ragKnowledgeMapEnabled: boolean;
  ragSharedDirectory?: string;
  ragWebsiteAllowlist: string[];
  ragMaxFileBytes: number;
  ragMaxChunksPerSource: number;
  ragVectorEnabled: boolean;
  ragVectorLimit: number;
  ragSeedKnowledgeEnabled: boolean;
  ragInputAdaptersEnabled: boolean;
  ragAllowedAccessScopes: string[];
  openAiEmbeddingModel: string;
}

export function loadConfig(): ServerConfig {
  const config: ServerConfig = {
    aiProvider: parseAiProvider(process.env.AI_PROVIDER),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    rateLimitWindowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),
    rateLimitMax: Number.parseInt(process.env.RATE_LIMIT_MAX ?? '120', 10),
    authDisabled: process.env.AUTH_DISABLED === 'true',
    authCookieName: process.env.AUTH_COOKIE_NAME?.trim() || 'onboarding_session',
    authSessionDurationMs: Number.parseInt(
      process.env.AUTH_SESSION_DURATION_MS ?? String(1000 * 60 * 60 * 8),
      10,
    ),
    authSecureCookie:
      process.env.AUTH_SECURE_COOKIE === undefined
        ? process.env.NODE_ENV === 'production'
        : process.env.AUTH_SECURE_COOKIE === 'true',
    authMicrosoftTenantId: optionalString(process.env.AUTH_MICROSOFT_TENANT_ID),
    authMicrosoftClientId: optionalString(process.env.AUTH_MICROSOFT_CLIENT_ID),
    authMicrosoftClientSecret: optionalString(process.env.AUTH_MICROSOFT_CLIENT_SECRET),
    authMicrosoftRedirectUri: optionalString(process.env.AUTH_MICROSOFT_REDIRECT_URI),
    authMicrosoftAutoProvision: process.env.AUTH_MICROSOFT_AUTO_PROVISION !== 'false',
    databaseUrl: optionalString(process.env.DATABASE_URL),
    postgresSsl: process.env.POSTGRES_SSL === 'true',
    postgresPoolMax: Number.parseInt(process.env.POSTGRES_POOL_MAX ?? '10', 10),
    sessionStore: parseSessionStore(process.env.SESSION_STORE),
    sessionStorePath: process.env.SESSION_STORE_PATH ?? 'data/sessions.json',
    logStorePath: process.env.LOG_STORE_PATH ?? 'data/events.jsonl',
    adminAuditStorePath: process.env.ADMIN_AUDIT_STORE_PATH ?? 'data/admin-audit.jsonl',
    aiRateCardsStorePath: process.env.AI_RATE_CARDS_STORE_PATH ?? 'data/ai-rate-cards.json',
    aiFeeAdjustmentsStorePath:
      process.env.AI_FEE_ADJUSTMENTS_STORE_PATH ?? 'data/ai-fee-adjustments.jsonl',
    webSearchAllowed: process.env.WEB_SEARCH_ALLOWED === 'true',
    openAiApiKey: process.env.OPENAI_API_KEY,
    openAiModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    openAiTimeoutMs: Number.parseInt(process.env.OPENAI_TIMEOUT_MS ?? '12000', 10),
    openAiMaxRetries: Number.parseInt(process.env.OPENAI_MAX_RETRIES ?? '2', 10),
    deepSeekApiKey: optionalString(process.env.DEEPSEEK_API_KEY),
    deepSeekBaseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
    deepSeekModel: process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash',
    embeddingProvider: parseEmbeddingProvider(process.env.EMBEDDING_PROVIDER),
    embeddingProfile: '',
    guideMaxDepth: Number.parseInt(process.env.GUIDE_MAX_DEPTH ?? '2', 10),
    ragKnowledgeMapEnabled: process.env.RAG_KNOWLEDGE_MAP_ENABLED === 'true',
    ragSharedDirectory: optionalString(process.env.RAG_SHARED_DIRECTORY),
    ragWebsiteAllowlist: parseList(process.env.RAG_WEBSITE_ALLOWLIST),
    ragMaxFileBytes: Number.parseInt(process.env.RAG_MAX_FILE_BYTES ?? '1048576', 10),
    ragMaxChunksPerSource: Number.parseInt(process.env.RAG_MAX_CHUNKS_PER_SOURCE ?? '8', 10),
    ragVectorEnabled: process.env.RAG_VECTOR_ENABLED === 'true',
    ragVectorLimit: Number.parseInt(process.env.RAG_VECTOR_LIMIT ?? '5', 10),
    ragSeedKnowledgeEnabled:
      process.env.RAG_SEED_KNOWLEDGE_ENABLED === undefined
        ? (process.env.NODE_ENV ?? 'development') !== 'production'
        : process.env.RAG_SEED_KNOWLEDGE_ENABLED === 'true',
    ragInputAdaptersEnabled:
      process.env.RAG_INPUT_ADAPTERS_ENABLED === undefined
        ? (process.env.NODE_ENV ?? 'development') !== 'production'
        : process.env.RAG_INPUT_ADAPTERS_ENABLED === 'true',
    ragAllowedAccessScopes: parseList(process.env.RAG_ALLOWED_ACCESS_SCOPES || 'all_users'),
    openAiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
  };

  config.embeddingProfile = embeddingProfileFor(
    config.embeddingProvider,
    config.openAiEmbeddingModel,
    process.env.EMBEDDING_PROFILE,
  );

  validateConfig(config);
  return config;
}

function validateConfig(config: ServerConfig): void {
  if (config.nodeEnv === 'production' && config.authDisabled) {
    throw new Error('AUTH_DISABLED cannot be true in production');
  }

  if (!config.authDisabled && !config.databaseUrl) {
    throw new Error('Microsoft authentication requires DATABASE_URL');
  }

  if (!config.authDisabled) {
    const missingMicrosoftSettings = [
      ['AUTH_MICROSOFT_TENANT_ID', config.authMicrosoftTenantId],
      ['AUTH_MICROSOFT_CLIENT_ID', config.authMicrosoftClientId],
      ['AUTH_MICROSOFT_CLIENT_SECRET', config.authMicrosoftClientSecret],
      ['AUTH_MICROSOFT_REDIRECT_URI', config.authMicrosoftRedirectUri],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missingMicrosoftSettings.length > 0) {
      throw new Error(`Microsoft authentication requires ${missingMicrosoftSettings.join(', ')}`);
    }
  }

  if (!Number.isFinite(config.authSessionDurationMs) || config.authSessionDurationMs <= 0) {
    throw new Error('AUTH_SESSION_DURATION_MS must be a positive integer');
  }

  if (config.sessionStore === 'postgres' && !config.databaseUrl) {
    throw new Error('SESSION_STORE=postgres requires DATABASE_URL');
  }

  if (config.ragVectorEnabled && !config.databaseUrl) {
    throw new Error('RAG_VECTOR_ENABLED=true requires DATABASE_URL');
  }

  if (config.ragKnowledgeMapEnabled) {
    if (!config.databaseUrl) {
      throw new Error('RAG_KNOWLEDGE_MAP_ENABLED=true requires DATABASE_URL');
    }

    if (config.sessionStore !== 'postgres') {
      throw new Error('RAG_KNOWLEDGE_MAP_ENABLED=true requires SESSION_STORE=postgres');
    }
  }

  if (!Number.isFinite(config.postgresPoolMax) || config.postgresPoolMax <= 0) {
    throw new Error('POSTGRES_POOL_MAX must be a positive integer');
  }

  if (!Number.isFinite(config.ragVectorLimit) || config.ragVectorLimit <= 0) {
    throw new Error('RAG_VECTOR_LIMIT must be a positive integer');
  }

  // Next serves the UI and API from the same origin; CORS is only needed if a future client is
  // intentionally hosted elsewhere.
}

function optionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseSessionStore(value: string | undefined): 'file' | 'postgres' {
  if (!value?.trim()) {
    return 'file';
  }

  if (value === 'file' || value === 'postgres') {
    return value;
  }

  throw new Error('SESSION_STORE must be either "file" or "postgres"');
}

function parseList(value: string | undefined): string[] {
  return (
    value
      ?.split(',')
      .map((entry) => entry.trim())
      .filter(Boolean) ?? []
  );
}

function parseAiProvider(value: string | undefined): 'openai' | 'deepseek' {
  if (!value || value === 'openai') return 'openai';
  if (value === 'deepseek') return 'deepseek';
  throw new Error('AI_PROVIDER must be either "openai" or "deepseek"');
}

function parseEmbeddingProvider(value: string | undefined): 'openai' | 'local' {
  if (!value || value === 'openai') return 'openai';
  if (value === 'local') return 'local';
  throw new Error('EMBEDDING_PROVIDER must be either "openai" or "local"');
}

function loadDotEnv(): void {
  let currentDirectory = dirname(fileURLToPath(import.meta.url));

  while (true) {
    const envPath = join(currentDirectory, '.env');

    if (existsSync(envPath)) {
      dotenv.config({ path: envPath });
      return;
    }

    const parentDirectory = dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      dotenv.config();
      return;
    }

    currentDirectory = parentDirectory;
  }
}
