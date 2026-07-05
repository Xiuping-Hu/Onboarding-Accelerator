import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiRoute } from '@/server/routeHandler';

const userSettingsSchema = z.object({
  webSearchEnabled: z.boolean().optional(),
});

const updateSessionRequestSchema = z.object({
  title: z.string().optional(),
  settings: userSettingsSchema.optional(),
  selectedNodeId: z.string().nullable().optional(),
  expandedNodeIds: z.array(z.string()).optional(),
});

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { sessionId } = await context.params;
  return handleApiRoute(request, async ({ services, user }) =>
    services.sessions.get(sessionId, user.id),
  );
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { sessionId } = await context.params;
  return handleApiRoute(request, async ({ request: apiRequest, services, user }) => {
    const payload = updateSessionRequestSchema.parse(await apiRequest.json());
    return services.sessions.update(sessionId, payload, user.id);
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { sessionId } = await context.params;
  return handleApiRoute(request, async ({ services, user }) => {
    await services.sessions.delete(sessionId, user.id);
  });
}
