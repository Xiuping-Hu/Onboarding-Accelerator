import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleAdminApiRoute } from '../../../../server/adminApi';

const evidenceSchema = z.object({
  sourceId: z.string().min(1),
  sourceVersionId: z.string().min(1).optional(),
  sectionKey: z.string().min(1).optional(),
  role: z.enum(['authoritative', 'supplemental']),
});

const draftSchema = z.object({
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
          evidence: z.array(evidenceSchema).min(1),
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
        evidence: z.array(evidenceSchema),
      }),
    ),
  }),
});

export async function POST(request: NextRequest): Promise<Response> {
  return handleAdminApiRoute(request, async ({ request: apiRequest, services, user }) => {
    if (!services.knowledgeMaps) {
      return new Response('Knowledge maps are disabled', { status: 404 });
    }
    return services.knowledgeMaps.createDraft(draftSchema.parse(await apiRequest.json()), user.id);
  });
}
