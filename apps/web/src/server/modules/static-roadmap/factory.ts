import type { PrismaClient } from '@/generated/prisma/client';
import type { AnswerProvider } from '../../core/ports/answerProvider';
import type { ServerConfig } from '../../config';
import type { EmbeddingProvider } from '../../embeddingService';
import { staticRoadmapConfigFromServerConfig } from './publicationHook';
import { StaticRoadmapPrismaRepository } from './repository';
import { StaticRoadmapService } from './service';
import type { StaticRoadmapConfig } from './types';

export function createStaticRoadmapService(input: {
  db: PrismaClient;
  answers: AnswerProvider;
  embeddings: EmbeddingProvider;
  config: ServerConfig | StaticRoadmapConfig;
}): StaticRoadmapService {
  const config =
    'staticRoadmapEnabled' in input.config
      ? staticRoadmapConfigFromServerConfig(input.config)
      : input.config;
  return new StaticRoadmapService(
    new StaticRoadmapPrismaRepository(input.db, input.embeddings, config),
    input.answers,
  );
}
