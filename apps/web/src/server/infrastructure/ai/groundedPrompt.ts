import type { ChatMessage, SourceProvenance } from '@onboarding/shared';

export const onboardingSystemPrompt =
  'You are an onboarding assistant. Answer clearly, cite the supplied source titles inline, use only grounded context when provided, and say when the information is missing instead of inventing it.';

export function formatGroundedHistory(chatHistory: ChatMessage[] = []) {
  return chatHistory.slice(-8).map((message) => ({
    role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
    content: message.content,
  }));
}

export function buildGroundedPrompt(
  prompt: string,
  sources: SourceProvenance[],
  guideNodeIds: string[],
): string {
  const sourceContext =
    sources.length > 0
      ? sources
          .slice(0, 5)
          .map(
            (source, index) =>
              `${index + 1}. ${source.title}\n${source.excerpt}\nURI: ${source.uri ?? 'not provided'}`,
          )
          .join('\n\n')
      : 'No onboarding sources were retrieved.';
  const guideContext =
    guideNodeIds.length > 0 ? `\n\nRelated visual guide node IDs: ${guideNodeIds.join(', ')}` : '';

  return `Question: ${prompt}\n\nGrounding context:\n${sourceContext}${guideContext}`;
}
