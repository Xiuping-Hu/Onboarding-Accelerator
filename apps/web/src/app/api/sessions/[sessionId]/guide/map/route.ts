import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiRoute } from '@/server/routeHandler';
import { projectKnowledgeMapToGuide } from '@/server/knowledgeMapProjection';

const draftGuideMapNodeSchema = z.object({
  clientId: z.string().min(1),
  parentClientId: z.string().min(1).optional(),
  title: z.string().min(1),
  summary: z.string().min(1),
  detail: z.string().optional(),
  sourceIds: z.array(z.string()).optional(),
  position: z.number().int(),
});

const legacyRequestSchema = z.object({
  draftGuideMap: z.object({
    title: z.string().min(1),
    summary: z.string().optional(),
    nodes: z.array(draftGuideMapNodeSchema).min(1),
  }),
});

const publishedRequestSchema = z.object({
  mode: z.literal('published_projection'),
  proposalId: z.string().uuid(),
});

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { sessionId } = await context.params;
  return handleApiRoute(request, async ({ request: apiRequest, services, user }) => {
    const rawPayload = await apiRequest.json();
    if ('mode' in (rawPayload as Record<string, unknown>)) {
      const payload = publishedRequestSchema.parse(rawPayload);
      if (!services.knowledgeMaps)
        return new Response('Knowledge maps are disabled', { status: 404 });
      const session = await services.sessions.get(sessionId, user.id);
      const proposal = session.guide.pendingMapProjection;
      if (
        !proposal ||
        proposal.id !== payload.proposalId ||
        proposal.sessionRevision !== session.revision ||
        new Date(proposal.expiresAt) <= new Date()
      ) {
        return new Response('Map proposal is no longer available', { status: 409 });
      }
      const scopes = await services.knowledgeMaps.accessScopesFor(user.id);
      const map = await services.knowledgeMaps.getPublished(scopes, proposal.mapId);
      if (map.versionId !== proposal.mapVersionId) {
        return new Response('Map proposal is no longer current', { status: 409 });
      }
      const guide = projectKnowledgeMapToGuide({
        ...map,
        nodes: map.nodes.filter((node) => proposal.nodeIds.includes(node.id)),
      });
      const saved = await services.sessions.save(
        {
          ...session,
          updatedAt: new Date().toISOString(),
          guide,
        },
        user.id,
      );
      return {
        rootNodeIds: saved.guide.rootNodeIds,
        nodes: saved.guide.rootNodeIds.map((id) => saved.guide.nodes[id]).filter(Boolean),
        session: saved,
        sources: [],
      };
    }
    return services.guide.createMap(sessionId, legacyRequestSchema.parse(rawPayload), user.id);
  });
}
