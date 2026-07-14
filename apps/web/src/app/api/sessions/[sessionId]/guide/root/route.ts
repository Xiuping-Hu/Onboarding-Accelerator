import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiRoute } from '@/server/routeHandler';

const guideRootRequestSchema = z.object({
  prompt: z.string().optional(),
  webSearchEnabled: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { sessionId } = await context.params;
  return handleApiRoute(request, async ({ request: apiRequest, services, user }) => {
    const payload = guideRootRequestSchema.parse(await apiRequest.json());
    const response = await services.guide.generateRoot(sessionId, payload, user.id);
    if (!services.knowledgeMaps || !response.session.guide.knowledgeMapId) {
      return {
        ...response,
        knowledgeMapEnabled: Boolean(services.knowledgeMaps),
      };
    }
    const scopes = await services.knowledgeMaps.accessScopesFor(user.id);
    const map = await services.knowledgeMaps.getPublished(
      scopes,
      response.session.guide.knowledgeMapId,
    );
    return {
      ...response,
      knowledgeMapEnabled: true,
      sources: map.nodes.flatMap((node) => node.sources),
    };
  });
}
