import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

loadDotEnv();

export interface ServerConfig {
  port: number;
  nodeEnv: string;
  corsOrigins: string[];
  requestBodyLimit: string;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  authDisabled: boolean;
  apiAuthToken?: string;
  authIssuer?: string;
  authAudience?: string;
  authJwksUri?: string;
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
}

export function loadConfig(): ServerConfig {
  const config: ServerConfig = {
    port: Number.parseInt(process.env.PORT ?? '3978', 10),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    corsOrigins: parseList(process.env.CORS_ALLOWED_ORIGINS),
    requestBodyLimit: process.env.REQUEST_BODY_LIMIT ?? '1mb',
    rateLimitWindowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),
    rateLimitMax: Number.parseInt(process.env.RATE_LIMIT_MAX ?? '120', 10),
    authDisabled: process.env.AUTH_DISABLED === 'true',
    apiAuthToken: optionalString(process.env.API_AUTH_TOKEN),
    authIssuer: optionalString(process.env.AUTH_ISSUER),
    authAudience: optionalString(process.env.AUTH_AUDIENCE),
    authJwksUri: optionalString(process.env.AUTH_JWKS_URI),
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
  };

  validateConfig(config);
  return config;
}

function validateConfig(config: ServerConfig): void {
  if (!Number.isFinite(config.port) || config.port <= 0) {
    throw new Error('PORT must be a positive integer');
  }

  if (!config.authDisabled && !config.apiAuthToken && !hasJwtValidationConfig(config)) {
    throw new Error(
      'Authentication is enabled but no API_AUTH_TOKEN or AUTH_ISSUER/AUTH_AUDIENCE/AUTH_JWKS_URI configuration was provided',
    );
  }

  if (config.nodeEnv === 'production' && config.authDisabled) {
    throw new Error('AUTH_DISABLED cannot be true in production');
  }

  if (config.nodeEnv === 'production' && config.corsOrigins.length === 0) {
    throw new Error('CORS_ALLOWED_ORIGINS must be configured in production');
  }
}

function hasJwtValidationConfig(config: ServerConfig): boolean {
  return Boolean(config.authIssuer && config.authAudience && config.authJwksUri);
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
