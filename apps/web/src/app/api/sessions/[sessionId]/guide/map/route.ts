import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiRoute } from '@/server/routeHandler';

const draftGuideMapNodeSchema = z.object({
  clientId: z.string().min(1),
  parentClientId: z.string().min(1).optional(),
  title: z.string().min(1),
  summary: z.string().min(1),
  detail: z.string().optional(),
  sourceIds: z.array(z.string()).optional(),
  position: z.number().int(),
});

const createGuideMapRequestSchema = z.object({
  draftGuideMap: z.object({
    title: z.string().min(1),
    summary: z.string().optional(),
    nodes: z.array(draftGuideMapNodeSchema).min(1),
  }),
});

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { sessionId } = await context.params;
  return handleApiRoute(request, async ({ request: apiRequest, services, user }) => {
    const payload = createGuideMapRequestSchema.parse(await apiRequest.json());
    return services.guide.createMap(sessionId, payload, user.id);
  });
}
