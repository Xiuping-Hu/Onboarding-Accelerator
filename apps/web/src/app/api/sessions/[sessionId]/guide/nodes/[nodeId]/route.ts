import type { NextRequest } from 'next/server';
import { handleApiRoute } from '@/server/routeHandler';

type RouteContext = { params: Promise<{ sessionId: string; nodeId: string }> };

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  const { sessionId, nodeId } = await context.params;
  return handleApiRoute(request, async ({ services, user }) => {
    if (!services.knowledgeMaps)
      return new Response('Knowledge maps are disabled', { status: 404 });
    const session = await services.sessions.get(sessionId, user.id);
    const versionId = session.guide.knowledgeMapVersionId;
    if (!versionId)
      return new Response('Session does not use a published knowledge map', { status: 404 });
    const scopes = await services.knowledgeMaps.accessScopesFor(user.id);
    return services.knowledgeMaps.getNodeDetail(versionId, nodeId, scopes);
  });
}
