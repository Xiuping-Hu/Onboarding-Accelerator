import type { ChatMessage, CitationSegment, SourceProvenance } from '@onboarding/shared';
import { z } from 'zod';

const MAX_PROMPT_SOURCES = 5;

const GroundedAnswerSchema = z
  .object({
    segments: z
      .array(
        z
          .object({
            markdown: z.string().trim().min(1),
            sourceNumbers: z.array(z.number().int().positive()),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const onboardingSystemPrompt =
  'You are an onboarding assistant. Answer clearly and use only grounded context when provided. Return only the requested JSON object. Divide the answer into ordered Markdown segments and attach sourceNumbers to the exact segment each source supports. Use several segments when different parts of the response use different references. Do not place citation markers, source lists, or source numbers inside the Markdown. Say when information is missing instead of inventing it.';

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
          .slice(0, MAX_PROMPT_SOURCES)
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
      ? 'For every grounded segment, set sourceNumbers to the supporting Source numbers. A segment may reference several sources, and the same source may support several segments.'
      : 'No sources are available, so every sourceNumbers array must be empty.';

  return `Question: ${prompt}\n\nGrounding context:\n${sourceContext}${guideContext}\n\nOutput schema:\n{"segments":[{"markdown":"Answer content for one referenced passage.","sourceNumbers":[1]}]}\n\n${citationInstructions}`;
}

export function parseGroundedAnswer(
  output: string,
  sources: SourceProvenance[],
): { content: string; citationSegments: CitationSegment[] } | undefined {
  const json = stripJsonFence(output);
  let decoded: unknown;

  try {
    decoded = JSON.parse(json);
  } catch {
    return undefined;
  }

  const parsed = GroundedAnswerSchema.safeParse(decoded);
  if (!parsed.success) return undefined;

  const promptSources = sources.slice(0, MAX_PROMPT_SOURCES);
  const hasUnknownSource = parsed.data.segments.some((segment) =>
    segment.sourceNumbers.some((number) => number > promptSources.length),
  );
  if (hasUnknownSource) return undefined;

  const hasCitation = parsed.data.segments.some((segment) => segment.sourceNumbers.length > 0);
  if (promptSources.length > 0 && !hasCitation) return undefined;

  const citationSegments = parsed.data.segments.map((segment) => ({
    markdown: segment.markdown,
    sourceIds: [
      ...new Set(
        segment.sourceNumbers.map((number) => promptSources[number - 1]?.id).filter(isString),
      ),
    ],
  }));

  return {
    content: citationSegments.map((segment) => segment.markdown).join('\n\n'),
    citationSegments,
  };
}

function stripJsonFence(output: string): string {
  const trimmed = output.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}

function isString(value: string | undefined): value is string {
  return typeof value === 'string';
}
