import type {
  GenerateGuideRootResponse,
  KnowledgeMapNodeDetail,
  OnboardingSession,
} from '@onboarding/shared';
import { z } from 'zod';

export const GuideSessionParamsSchema = z.object({ sessionId: z.string().min(1) });
export const GuideNodeParamsSchema = z.object({
  sessionId: z.string().min(1),
  nodeId: z.string().min(1),
});
export const GenerateGuideRootBodySchema = z.object({
  prompt: z.string().optional(),
  webSearchEnabled: z.boolean().optional(),
});
export const GuideSearchQuerySchema = z.object({
  query: z.string().trim().min(1).max(200),
});
export const GuideFeedbackBodySchema = z.object({
  nodeId: z.string().uuid().optional(),
  messageId: z.string().uuid().optional(),
  category: z.enum(['inaccurate', 'stale', 'missing', 'source_inaccessible', 'other']),
  comment: z.string().trim().max(1000).optional(),
});

export type GenerateGuideRootBody = z.infer<typeof GenerateGuideRootBodySchema>;
export type GuideFeedbackBody = z.infer<typeof GuideFeedbackBodySchema>;

export function toGenerateGuideRootResponseDto(
  response: GenerateGuideRootResponse,
): GenerateGuideRootResponse {
  return response;
}

export function toGuideNodeResponseDto(node: KnowledgeMapNodeDetail): KnowledgeMapNodeDetail {
  return node;
}

export function toGuideSearchResponseDto(nodes: KnowledgeMapNodeDetail[]): {
  nodes: KnowledgeMapNodeDetail[];
} {
  return { nodes };
}

export function withGuideSession(
  session: OnboardingSession,
  guide: OnboardingSession['guide'],
): OnboardingSession {
  return { ...session, guide };
}
