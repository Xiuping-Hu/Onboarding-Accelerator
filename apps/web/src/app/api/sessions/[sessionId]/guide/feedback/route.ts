import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiRoute } from '@/server/routeHandler';

const feedbackSchema = z.object({
  nodeId: z.string().uuid().optional(),
  messageId: z.string().uuid().optional(),
  category: z.enum(['inaccurate', 'stale', 'missing', 'source_inaccessible', 'other']),
  comment: z.string().trim().max(1000).optional(),
});
type RouteContext = { params: Promise<{ sessionId: string }> };

export async function POST(request: NextRequest, context: RouteContext): Promise<Response> {
  const { sessionId } = await context.params;
  return handleApiRoute(request, async ({ request: apiRequest, services, user }) => {
    if (!services.knowledgeMaps)
      return new Response('Knowledge maps are disabled', { status: 404 });
    const payload = feedbackSchema.parse(await apiRequest.json());
    const session = await services.sessions.get(sessionId, user.id);
    if (!session.guide.knowledgeMapVersionId)
      return new Response('Session does not use a published knowledge map', { status: 404 });
    await services.knowledgeMaps.submitFeedback(
      { ...payload, mapVersionId: session.guide.knowledgeMapVersionId },
      user.id,
    );
    return { ok: true };
  });
}
