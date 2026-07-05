import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiRoute } from '@/server/routeHandler';

const guideExpandRequestSchema = z.object({
  nodeId: z.string().min(1),
  instruction: z.string().optional(),
  webSearchEnabled: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { sessionId } = await context.params;
  return handleApiRoute(request, async ({ request: apiRequest, services, user }) => {
    const payload = guideExpandRequestSchema.parse(await apiRequest.json());
    return services.guide.expand(sessionId, payload, user.id);
  });
}
