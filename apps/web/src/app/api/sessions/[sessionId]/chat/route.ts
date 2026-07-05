import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiRoute } from '@/server/routeHandler';

const chatRequestSchema = z.object({
  message: z.string().min(1),
  webSearchEnabled: z.boolean().optional(),
  selectedStepId: z.string().optional(),
});

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { sessionId } = await context.params;
  return handleApiRoute(request, async ({ request: apiRequest, services, user }) => {
    const payload = chatRequestSchema.parse(await apiRequest.json());
    return services.chat.chat(
      sessionId,
      {
        ...payload,
        sessionId,
        webSearchEnabled: payload.webSearchEnabled ?? false,
      },
      user.id,
    );
  });
}
