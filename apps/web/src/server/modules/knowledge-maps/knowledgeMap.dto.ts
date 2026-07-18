import type { RagKnowledgeMapDraft } from '@onboarding/shared';
import { z } from 'zod';

const EvidenceSchema = z.object({
  sourceId: z.string().min(1),
  sourceVersionId: z.string().min(1).optional(),
  sectionKey: z.string().min(1).optional(),
  role: z.enum(['authoritative', 'supplemental']),
});

export const KnowledgeMapProposalBodySchema = z.object({
  objective: z.string().trim().min(1).max(500),
  sourceIds: z.array(z.string().min(1)).min(1).max(40),
});

export const KnowledgeMapDraftBodySchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).optional(),
  accessScope: z.string().trim().min(1).max(120).default('all_users'),
  draft: z.object({
    objective: z.string().trim().min(1).max(500),
    nodes: z
      .array(
        z.object({
          clientKey: z.string().min(1),
          suggestedStableKey: z.string().min(1).max(120),
          kind: z.enum([
            'concept',
            'role',
            'system',
            'workflow',
            'task',
            'decision',
            'resource',
            'milestone',
          ]),
          title: z.string().trim().min(1).max(160),
          summary: z.string().trim().min(1).max(500),
          owner: z.string().trim().min(1).max(160).optional(),
          evidence: z.array(EvidenceSchema).min(1),
        }),
      )
      .min(1)
      .max(80),
    edges: z.array(
      z.object({
        clientKey: z.string().min(1),
        fromClientKey: z.string().min(1),
        toClientKey: z.string().min(1),
        relationship: z.enum([
          'contains',
          'prerequisite',
          'learning_precedes',
          'workflow_transition',
          'uses',
          'owned_by',
          'related',
        ]),
        rationale: z.string().trim().min(1).max(500).optional(),
        evidence: z.array(EvidenceSchema),
      }),
    ),
  }),
});

export const PublishKnowledgeMapParamsSchema = z.object({
  mapId: z.string().min(1),
  versionId: z.string().min(1),
});
export const PublishKnowledgeMapBodySchema = z.object({
  changeNote: z.string().trim().min(1).max(500).optional(),
});

export type KnowledgeMapProposalBody = z.infer<typeof KnowledgeMapProposalBodySchema>;
export type KnowledgeMapDraftBody = Omit<z.infer<typeof KnowledgeMapDraftBodySchema>, 'draft'> & {
  draft: RagKnowledgeMapDraft;
};
export type PublishKnowledgeMapBody = z.infer<typeof PublishKnowledgeMapBodySchema>;

export function toKnowledgeMapProposalResponseDto(draft: RagKnowledgeMapDraft) {
  return { draft };
}

export function toKnowledgeMapDraftResponseDto(result: { mapId: string; versionId: string }) {
  return result;
}
