import { loadConfig } from '../../config';
import { LocalHashEmbeddingService, OpenAiEmbeddingService } from '../../embeddingService';
import { createAnswerProvider } from '../../infrastructure/ai/answerProviderFactory';
import { closeProviderFetch } from '../../infrastructure/ai/providerFetch';
import { getPrismaClient } from '../../infrastructure/prisma/prismaClient';
import { createStaticRoadmapService } from './factory';

export function createStaticRoadmapRuntime() {
  const config = loadConfig();
  if (!config.databaseUrl) throw new Error('DATABASE_URL is required.');
  const db = getPrismaClient({
    connectionString: config.databaseUrl,
    max: config.postgresPoolMax,
    ssl: config.postgresSsl,
  });
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
  const service = createStaticRoadmapService({ db, answers, embeddings, config });
  return {
    config,
    db,
    service,
    async close(): Promise<void> {
      await closeProviderFetch();
      await db.$disconnect();
    },
  };
}

export type StaticRoadmapRuntime = ReturnType<typeof createStaticRoadmapRuntime>;
