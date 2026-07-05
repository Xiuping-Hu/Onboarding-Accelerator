import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiRoute } from '@/server/routeHandler';

const userSettingsSchema = z.object({
  webSearchEnabled: z.boolean().optional(),
});

const createSessionRequestSchema = z.object({
  title: z.string().optional(),
  settings: userSettingsSchema.optional(),
});

export async function GET(request: NextRequest) {
  return handleApiRoute(request, async ({ services, user }) => ({
    sessions: await services.sessions.list(user.id),
  }));
}

export async function POST(request: NextRequest) {
  return handleApiRoute(request, async ({ request: apiRequest, services, user }) => {
    const payload = createSessionRequestSchema.parse(await apiRequest.json());
    return Response.json(
      { session: await services.sessions.create(payload, user.id) },
      { status: 201 },
    );
  });
}
