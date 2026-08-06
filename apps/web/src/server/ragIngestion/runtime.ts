import { loadConfig } from '../config';
import { LocalHashEmbeddingService, OpenAiEmbeddingService } from '../embeddingService';
import { closeProviderFetch } from '../infrastructure/ai/providerFetch';
import { getPrismaClient } from '../infrastructure/prisma/prismaClient';
import { RagIngestionService } from './ingestionService';

export function createRagRuntime(options: { requireEmbeddings?: boolean } = {}) {
  const config = loadConfig();
  if (!config.databaseUrl) throw new Error('DATABASE_URL is required.');
  if (
    options.requireEmbeddings !== false &&
    config.embeddingProvider === 'openai' &&
    !config.openAiApiKey
  ) {
    throw new Error('OPENAI_API_KEY is required for the OpenAI embedding profile.');
  }

  const database = getPrismaClient({
    connectionString: config.databaseUrl,
    max: config.postgresPoolMax,
    ssl: config.postgresSsl,
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
  const service = new RagIngestionService(
    database,
    embeddings,
    {
      tenantId: process.env.RAG_SHAREPOINT_TENANT_ID,
      clientId: process.env.RAG_SHAREPOINT_CLIENT_ID,
      clientSecret: process.env.RAG_SHAREPOINT_CLIENT_SECRET,
    },
    config.ragAllowedAccessScopes,
    config.embeddingProfile,
    true,
    {
      maximumFileBytes: config.ragMaxFileBytes,
      websiteAllowlist: config.ragWebsiteAllowlist,
    },
  );

  return {
    config,
    database,
    service,
    async close(): Promise<void> {
      await closeProviderFetch();
      await database.$disconnect();
    },
  };
}

export type RagRuntime = ReturnType<typeof createRagRuntime>;
