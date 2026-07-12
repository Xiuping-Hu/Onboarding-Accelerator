export const localHashEmbeddingProfile = 'local:hash-v1:1536';

export function embeddingProfileFor(
  provider: 'openai' | 'local',
  openAiModel: string,
  override?: string,
): string {
  if (override?.trim()) return override.trim();
  return provider === 'local' ? localHashEmbeddingProfile : `openai:${openAiModel}`;
}
