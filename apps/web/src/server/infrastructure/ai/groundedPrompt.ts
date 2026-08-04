import type { ChatMessage, SourceProvenance } from '@onboarding/shared';

export const onboardingSystemPrompt =
  'You are an onboarding assistant. Answer clearly and use only grounded context when provided. Cite supporting sources by placing their numbered marker immediately after the sentence or paragraph they support: [[1]] for one source or [[1,2]] for multiple sources. A response may contain several citations, and each citation must stay next to its supported content instead of being collected at the end. Say when information is missing instead of inventing it.';

export function formatGroundedHistory(chatHistory: ChatMessage[] = []) {
  return chatHistory.slice(-8).map((message) => ({
    role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
    content: message.content.replace(/\[\[\d+(?:\s*,\s*\d+)*\]\]/g, '').trim(),
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
              `Source [${index + 1}]: ${source.title}\n${source.excerpt}\nURI: ${source.uri ?? 'not provided'}`,
          )
          .join('\n\n')
      : 'No onboarding sources were retrieved.';
  const guideContext =
    guideNodeIds.length > 0 ? `\n\nRelated visual guide node IDs: ${guideNodeIds.join(', ')}` : '';
  const citationInstructions =
    sources.length > 0
      ? 'Put [[n]] immediately after the content supported by Source [n]. Use [[n,m]] when the same content is supported by multiple sources. Do not collect citations in a source list at the end.'
      : 'No sources are available, so do not add citation markers.';

  return `Question: ${prompt}\n\nGrounding context:\n${sourceContext}${guideContext}\n\nCitation format: ${citationInstructions}`;
}
