import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { handleAdminApiRoute } from '../../../../server/adminApi';

const limitSchema = z.coerce.number().int().min(1).max(100).optional();

export async function GET(request: NextRequest): Promise<Response> {
  return handleAdminApiRoute(request, async ({ request: apiRequest, services }) =>
    services.adminAudit.listRecent(
      limitSchema.parse(apiRequest.nextUrl.searchParams.get('limit') ?? undefined),
    ),
  );
}
