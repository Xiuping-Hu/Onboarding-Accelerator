import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

loadDotEnv();

export interface ServerConfig {
  nodeEnv: string;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  authDisabled: boolean;
  authCookieName: string;
  authSessionDurationMs: number;
  authSecureCookie: boolean;
  authLoginRateLimitWindowMs: number;
  authLoginRateLimitMax: number;
  databaseUrl?: string;
  postgresSsl: boolean;
  postgresPoolMax: number;
  sessionStore: 'file' | 'postgres';
  sessionStorePath: string;
  logStorePath: string;
  webSearchAllowed: boolean;
  openAiApiKey?: string;
  openAiModel: string;
  openAiTimeoutMs: number;
  openAiMaxRetries: number;
  openAiInputCostPer1MTokens?: number;
  openAiOutputCostPer1MTokens?: number;
  guideMaxDepth: number;
  ragSharedDirectory?: string;
  ragWebsiteAllowlist: string[];
  ragMaxFileBytes: number;
  ragMaxChunksPerSource: number;
  ragVectorEnabled: boolean;
  ragVectorLimit: number;
  openAiEmbeddingModel: string;
}

export function loadConfig(): ServerConfig {
  const config: ServerConfig = {
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
    authLoginRateLimitWindowMs: Number.parseInt(
      process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS ?? '300000',
      10,
    ),
    authLoginRateLimitMax: Number.parseInt(process.env.AUTH_LOGIN_RATE_LIMIT_MAX ?? '10', 10),
    databaseUrl: optionalString(process.env.DATABASE_URL),
    postgresSsl: process.env.POSTGRES_SSL === 'true',
    postgresPoolMax: Number.parseInt(process.env.POSTGRES_POOL_MAX ?? '10', 10),
    sessionStore: parseSessionStore(process.env.SESSION_STORE),
    sessionStorePath: process.env.SESSION_STORE_PATH ?? 'data/sessions.json',
    logStorePath: process.env.LOG_STORE_PATH ?? 'data/events.jsonl',
    webSearchAllowed: process.env.WEB_SEARCH_ALLOWED === 'true',
    openAiApiKey: process.env.OPENAI_API_KEY,
    openAiModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    openAiTimeoutMs: Number.parseInt(process.env.OPENAI_TIMEOUT_MS ?? '12000', 10),
    openAiMaxRetries: Number.parseInt(process.env.OPENAI_MAX_RETRIES ?? '2', 10),
    openAiInputCostPer1MTokens: optionalNumber(process.env.OPENAI_INPUT_COST_PER_1M_TOKENS),
    openAiOutputCostPer1MTokens: optionalNumber(process.env.OPENAI_OUTPUT_COST_PER_1M_TOKENS),
    guideMaxDepth: Number.parseInt(process.env.GUIDE_MAX_DEPTH ?? '2', 10),
    ragSharedDirectory: optionalString(process.env.RAG_SHARED_DIRECTORY),
    ragWebsiteAllowlist: parseList(process.env.RAG_WEBSITE_ALLOWLIST),
    ragMaxFileBytes: Number.parseInt(process.env.RAG_MAX_FILE_BYTES ?? '1048576', 10),
    ragMaxChunksPerSource: Number.parseInt(process.env.RAG_MAX_CHUNKS_PER_SOURCE ?? '8', 10),
    ragVectorEnabled: process.env.RAG_VECTOR_ENABLED === 'true',
    ragVectorLimit: Number.parseInt(process.env.RAG_VECTOR_LIMIT ?? '5', 10),
    openAiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
  };

  validateConfig(config);
  return config;
}

function validateConfig(config: ServerConfig): void {
  if (config.nodeEnv === 'production' && config.authDisabled) {
    throw new Error('AUTH_DISABLED cannot be true in production');
  }

  if (!config.authDisabled && !config.databaseUrl) {
    throw new Error('Password authentication requires DATABASE_URL');
  }

  if (!Number.isFinite(config.authSessionDurationMs) || config.authSessionDurationMs <= 0) {
    throw new Error('AUTH_SESSION_DURATION_MS must be a positive integer');
  }

  if (
    !Number.isFinite(config.authLoginRateLimitWindowMs) ||
    config.authLoginRateLimitWindowMs <= 0
  ) {
    throw new Error('AUTH_LOGIN_RATE_LIMIT_WINDOW_MS must be a positive integer');
  }

  if (!Number.isFinite(config.authLoginRateLimitMax) || config.authLoginRateLimitMax <= 0) {
    throw new Error('AUTH_LOGIN_RATE_LIMIT_MAX must be a positive integer');
  }

  if (config.sessionStore === 'postgres' && !config.databaseUrl) {
    throw new Error('SESSION_STORE=postgres requires DATABASE_URL');
  }

  if (config.ragVectorEnabled && !config.databaseUrl) {
    throw new Error('RAG_VECTOR_ENABLED=true requires DATABASE_URL');
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

function optionalNumber(value: string | undefined): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
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
