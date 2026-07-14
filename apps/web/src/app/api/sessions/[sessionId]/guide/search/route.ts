import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiRoute } from '@/server/routeHandler';

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { sessionId } = await context.params;
  return handleApiRoute(request, async ({ request: apiRequest, services, user }) => {
    if (!services.knowledgeMaps)
      return new Response('Knowledge maps are disabled', { status: 404 });
    const query = z
      .string()
      .trim()
      .min(1)
      .max(200)
      .parse(apiRequest.nextUrl.searchParams.get('query'));
    const session = await services.sessions.get(sessionId, user.id);
    if (!session.guide.knowledgeMapVersionId) return { nodes: [] };
    const scopes = await services.knowledgeMaps.accessScopesFor(user.id);
    return {
      nodes: await services.knowledgeMaps.search(
        session.guide.knowledgeMapVersionId,
        query,
        scopes,
      ),
    };
  });
}
