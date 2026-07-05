import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleApiRoute } from '@/server/routeHandler';

const logLimitSchema = z.coerce.number().int().min(1).max(100).optional();

export async function GET(request: NextRequest) {
  return handleApiRoute(request, async ({ request: apiRequest, services }) => {
    const limit = logLimitSchema.parse(apiRequest.nextUrl.searchParams.get('limit') ?? undefined);
    return services.logs.listRecent(limit);
  });
}
