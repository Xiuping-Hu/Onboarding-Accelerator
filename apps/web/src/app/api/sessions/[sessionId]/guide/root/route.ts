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
    return services.guide.generateRoot(sessionId, payload, user.id);
  });
}
