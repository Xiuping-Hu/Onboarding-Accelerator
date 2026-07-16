import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiRoute } from '@/server/routeHandler';
import { KnowledgeMapNotFoundError } from '@/server/knowledgeMapService';
import { projectKnowledgeMapToGuide } from '@/server/knowledgeMapProjection';

const guideRootRequestSchema = z.object({
  prompt: z.string().optional(),
  webSearchEnabled: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { sessionId } = await context.params;
  return handleApiRoute(request, async ({ request: apiRequest, services, user }) => {
    const payload = guideRootRequestSchema.parse(await apiRequest.json());
    if (!services.knowledgeMaps) {
      const response = await services.guide.generateRoot(sessionId, payload, user.id);
      return {
        ...response,
        knowledgeMapEnabled: false,
      };
    }

    const session = await services.sessions.get(sessionId, user.id);
    const scopes = await services.knowledgeMaps.accessScopesFor(user.id);
    try {
      const map = await services.knowledgeMaps.getPublished(scopes);
      const guide = projectKnowledgeMapToGuide(map);
      return {
        rootNodeIds: guide.rootNodeIds,
        nodes: guide.rootNodeIds.map((nodeId) => guide.nodes[nodeId]).filter(Boolean),
        session: { ...session, guide },
        sources: map.nodes.flatMap((node) => node.sources),
        knowledgeMapEnabled: true,
      };
    } catch (error) {
      if (!(error instanceof KnowledgeMapNotFoundError)) throw error;
      return {
        rootNodeIds: [],
        nodes: [],
        session,
        sources: [],
        knowledgeMapEnabled: true,
      };
    }
  });
}
